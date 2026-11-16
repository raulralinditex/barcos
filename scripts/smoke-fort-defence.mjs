import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { createFortCombatant } from "../src/model/fort.js";
import { createEnemyCombatant, createPlayerCombatant, COMBAT } from "../src/model/combat.js";
import { safeZoneRadiusM } from "../src/model/world.js";

/** Coastal defence and the port's safe zone (S126, S66). Needs the server on 8765. */
const runtime = toRuntimeShip(buildShip({
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
}, 12000), { name: "Golden Hind" });

const enemy = (id, x, y) => {
  const encounter = {
    id, type: "enemy", hullId: "galeon-guerra", zoneId: "costera", x, y,
    heading: Math.PI / 2, currentSpeedKn: 0, drift: { heading: 0, speedKn: 0 }, engaged: true,
  };
  // Seed the combatant explicitly: ensureEnemyCombat would otherwise arm it with the
  // player's zone rather than the enemy's birth zone.
  encounter.combat = createEnemyCombatant(encounter, { id: encounter.zoneId }, 7);
  return encounter;
};
const near = enemy(901, 200, 0);
const far = enemy(902, 0, 900);
const world = {
  v: 1, seed: 7, rngState: 7, nextId: 903, gold: 0, timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  encounters: [near, far],
};
const yard = createFortCombatant();
const playerHull = createPlayerCombatant(runtime).condition.hull;

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(([fleetJson, worldJson, fort]) => {
  // A guaranteed hit makes the smoke deterministic rather than a roll of the dice.
  Math.random = () => 0;
  // Only the yard may damage the targets: the captain and her escorts do not fire.
  localStorage.setItem("barcos:autofire:v1", "0");
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", fleetJson);
  localStorage.setItem("barcos:game:v1", JSON.stringify({
    gold: 5000, world: worldJson,
    fort: { condition: fort.condition, crew: fort.crew, status: fort.status }, victories: 0,
  }));
}, [JSON.stringify({ v: 1, captainId: runtime.id, ships: [runtime] }), JSON.stringify(world), yard]);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
const saved = await page.evaluate(() => {
  window.dispatchEvent(new Event("beforeunload"));
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return { world: game?.world ? JSON.parse(game.world) : null, player: game?.combat?.player ?? null };
});
const nearAfter = saved.world?.encounters?.find((e) => e.id === near.id);
const farAfter = saved.world?.encounters?.find((e) => e.id === far.id);
const distance = (e) => e ? Math.hypot(e.x, e.y) : NaN;
check(nearAfter?.zoneId === "costera" && Boolean(nearAfter?.combat), "S126: the seeded coastal combatant should remain on the sea");
check(
  nearAfter?.combat?.condition?.hull < near.combat.condition.hull ||
    nearAfter?.combat?.condition?.crew < near.combat.condition.crew,
  `S126: the yard should damage the coastal enemy (hull ${near.combat.condition.hull} -> ${nearAfter?.combat?.condition?.hull}, crew ${near.combat.condition.crew} -> ${nearAfter?.combat?.condition?.crew})`,
);
// The push lands on the boundary itself, and floating point puts it a hair inside:
// measured 299.99999999999994 m against a radius of 300. One metre of tolerance is the
// difference between the boundary and being inside the zone.
check(distance(nearAfter) >= safeZoneRadiusM() - 1, `S66: the enemy should be pushed out of the safe zone, distance ${distance(nearAfter)} m`);
check(farAfter?.zoneId === "costera" && Boolean(farAfter?.combat), "S126: the distant seeded combatant should remain on the sea");
check(distance(farAfter) > COMBAT.engageRadiusM, `S126: the distant enemy must remain outside the engage radius, distance ${distance(farAfter)} m`);
check(
  Boolean(farAfter?.combat) && JSON.stringify(farAfter.combat.condition) === JSON.stringify(far.combat.condition),
  `S126: the distant enemy should take no damage (${JSON.stringify(far.combat.condition)} -> ${JSON.stringify(farAfter?.combat?.condition)})`,
);
check(distance(saved.world?.ship) < safeZoneRadiusM(), `S66: the captain must remain inside the safe zone, distance ${distance(saved.world?.ship)} m`);
check(saved.player?.condition?.hull === playerHull, `S66: the captain's hull should remain unharmed (${playerHull} -> ${saved.player?.condition?.hull})`);

await page.close();
await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`SMOKE OK: coastal enemy hull ${near.combat.condition.hull} -> ${nearAfter.combat.condition.hull}; distant enemy unharmed at ${Math.round(distance(farAfter))} m; captain hull ${playerHull} -> ${saved.player.condition.hull}; no browser errors`);
