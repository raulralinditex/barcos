import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { createFortCombatant } from "../src/model/fort.js";
import { createEnemyCombatant } from "../src/model/combat.js";

/**
 * Does the enemy fire at the yard? (the player's decision, verbatim): "el enemigo dispara al
 * astillero o no, si dispara, lo hace por area exactamente como si fuera un barco nuestro".
 *
 * The switch ships OFF ("valor por defecto apagado"), so the same sea, seeded the same way,
 * must leave the yard untouched until the player turns it on. Turned on, the yard is one more
 * hull of ours in the enemies' aim: the abyss squadron in her reach wears her down.
 *
 * What is read is the saved yard (`barcos:game:v1`), never an internal of the screen: the
 * player sees her garrison and her hull, so that is what has to move or stay put.
 * Needs the local server on 8765.
 */

const runtime = toRuntimeShip(buildShip({
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
}, 12000), { name: "Golden Hind" });

/**
 * One abyss squadron inside the yard's reach, already fighting, armed as the abyss arms it.
 * Her distance to the yard (120 m) is a little shorter than to the captain (126 m), so the
 * nearest-by-distance rule the switch turns on has an unambiguous answer: the yard.
 */
const squadron = () => {
  const encounter = {
    id: 901, type: "enemy", hullId: "galeon-guerra", zoneId: "abismo",
    x: 120, y: 0, heading: 0, currentSpeedKn: 0,
    drift: { heading: 0, speedKn: 0 }, engaged: true,
  };
  encounter.combat = createEnemyCombatant(encounter, { id: "abismo" }, 7);
  return encounter;
};

const world = {
  v: 1, seed: 7, rngState: 7, nextId: 902, gold: 0, timeS: 0,
  // Inside the port, as a captain who has not weighed anchor yet: the yard is what is at stake.
  ship: { x: 0, y: 40, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  encounters: [squadron()],
};

const yard = createFortCombatant();

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

/** Sail the same sea once, with the given settings, and return the saved yard and enemy. */
const sail = async (settings) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.addInitScript(([fleetJson, worldJson, fort, settingsJson]) => {
    // A guaranteed hit makes the smoke deterministic instead of a roll of the dice.
    Math.random = () => 0;
    // Only the enemies fire: the captain's automatic fire would sink the squadron and hide
    // what this smoke is about.
    localStorage.setItem("barcos:autofire:v1", "0");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({
      gold: 5000, world: worldJson,
      fort: { condition: fort.condition, crew: fort.crew, status: fort.status },
      victories: 0,
    }));
    // Only what the player chose: every other value stays at its shipped default.
    localStorage.setItem("barcos:settings:v1", JSON.stringify(settingsJson));
  }, [JSON.stringify({ v: 1, captainId: runtime.id, ships: [runtime] }), JSON.stringify(world), yard, settings]);

  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  const saved = await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return { world: game?.world ? JSON.parse(game.world) : null, fort: game?.fort ?? null };
  });
  await context.close();
  return {
    fort: saved.fort,
    enemy: saved.world?.encounters?.find((e) => e.id === 901) ?? null,
  };
};

/** How hurt a yard is, as one number: her garrison and her hull, in points lost. */
const wear = (condition) =>
  condition ? (100 - Number(condition.crew ?? 100)) + (100 - Number(condition.hull ?? 100)) : NaN;

/* ------------------------------------------------ 1: the shipped default, off */

const off = await sail({});
check(Boolean(off.enemy?.combat), "the abyss squadron in the yard's reach should be afloat and fighting");
check(
  Boolean(off.fort) && off.fort.status === "fighting",
  `with the switch off the yard should still be fighting, she reads ${off.fort?.status}`,
);
check(
  wear(off.fort?.condition) === 0,
  `OFF: the yard must take no fire from an enemy in her reach, her condition reads ${JSON.stringify(off.fort?.condition)} (seeded ${JSON.stringify(yard.condition)})`,
);

/* ------------------------------------------------ 2: the player turns it on */

const on = await sail({ "combat.enemyFiresAtYard": 1 });
check(Boolean(on.enemy?.combat), "the abyss squadron should still be afloat with the switch on");
check(
  wear(on.fort?.condition) > 0,
  `ON: the enemy in the yard's reach should wear her down, her condition reads ${JSON.stringify(on.fort?.condition)} (seeded ${JSON.stringify(yard.condition)})`,
);

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: off leaves the yard untouched (${JSON.stringify(off.fort.condition)}); on wears her down to ${JSON.stringify(on.fort.condition)}; no browser errors`,
);
