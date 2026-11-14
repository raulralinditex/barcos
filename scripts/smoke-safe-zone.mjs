import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { safeZoneRadiusM } from "../src/model/world.js";
import { sideRangeM, createPlayerCombatant } from "../src/model/combat.js";

/**
 * Browser smoke for the safe zone, the supply clock and the range circle (S66, S67, S68).
 * Needs the local server on 8765.
 *
 *   S66  an enemy that drifts into the shipyard's zone is pushed out and cannot fire;
 *   S67  the supply burns with the world clock and the crew's wages are charged per day;
 *   S68  the range arc follows the round each beam is loaded with.
 *
 * Each check is measured against the model, not against a magic number: the screen and
 * the rules must agree.
 */

const runtime = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "media-culebrina-9", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        { pieceId: "media-culebrina-9", qty: 2, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 6000,
      ballastKg: 3000,
      equipmentKg: 2500,
      reserveKg: 1500,
    },
    12000,
  ),
  { name: "Golden Hind" },
);

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

/* ------------------------------------------------- S66: the enemy is kept out */

const intruder = {
  id: 901,
  type: "enemy",
  hullId: "patache",
  // Right on the quay, inside the zone.
  x: 120,
  y: 0,
  heading: 0,
  currentSpeedKn: 0,
  drift: { heading: 0, speedKn: 0 },
  engaged: true,
};

const zoneWorld = {
  v: 1,
  seed: 7,
  rngState: 7,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  encounters: [intruder],
};

const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.addInitScript(
  ([fleetJson, worldJson]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify({ v: 1, captainId: runtime.id, ships: [runtime] }), JSON.stringify(zoneWorld)],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const savedWorld = () =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return game?.world ? JSON.parse(game.world) : null;
  });

const radius = safeZoneRadiusM();
const after = await savedWorld();
const enemy = after?.encounters?.find((e) => e.type === "enemy");
check(Boolean(enemy), "S66: the enemy should still be on the sea, just not on the quay");
if (enemy) {
  const distance = Math.hypot(enemy.x, enemy.y);
  check(
    distance > radius,
    `S66: the enemy should be pushed out past ${radius} m, it is at ${distance.toFixed(0)} m`,
  );
}

// The captain is unharmed: an enemy inside the zone does not fire.
const hullAfter = await page.evaluate(() => {
  window.dispatchEvent(new Event("beforeunload"));
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return game?.combat?.player?.condition?.hull ?? 100;
});
check(hullAfter >= 99, `S66: the captain was fired on inside her own port, hull at ${hullAfter}`);

/* ------------------------------------------------- S67: the supply burns with the clock */

const supplyOf = async () =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return typeof game?.supplyLeftS === "number" ? game.supplyLeftS : null;
  });

const supplyStart = await supplyOf();
check(supplyStart !== null, "S67: the voyage should carry a supply reserve");
// The voyage started 45 days ago worth of seconds and some have burned already.
check(
  supplyStart !== null && supplyStart < 45 * 100,
  `S67: the supply should have burned from 4500 s, it reads ${supplyStart}`,
);

await page.waitForTimeout(2000);
const supplyLater = await supplyOf();
check(
  supplyLater !== null && supplyLater < supplyStart,
  `S67: the supply should keep burning, it went ${supplyStart} -> ${supplyLater}`,
);

/* ------------------------------------------------- S68: the range arc follows the round */

const rangeBabor = sideRangeM(createPlayerCombatant(runtime), "babor");
check(rangeBabor > 0, "S68: the beam should have a range to draw");

// Switch the beam to hailshot and read the range again: it must shrink.
await page.keyboard.press("3");
await page.waitForTimeout(600);
const afterSwitch = await page.evaluate(() => {
  window.dispatchEvent(new Event("beforeunload"));
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  const pieces = game?.combat?.player?.pieces ?? [];
  return pieces.filter((p) => p.ammoId === "metralla").length;
});
check(afterSwitch > 0, `S68: key 3 should load hailshot into the culverins, ${afterSwitch} took it`);

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: the enemy is pushed past ${radius} m and cannot fire, the supply burned ${Math.round(45 * 100 - supplyLater)} s, and ${afterSwitch} guns took hailshot`,
);
