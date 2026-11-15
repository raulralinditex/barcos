import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { createFortCombatant } from "../src/model/fort.js";
import { createEnemyCombatant } from "../src/model/combat.js";

/**
 * Browser smoke for the shipyard in a fight (S74). Needs the local server on 8765.
 *
 * The yard is a static hull with a garrison: an abyss squadron that reaches her wears her
 * down, her garrison breaks, and she strikes. This checks the outcome the player feels —
 * the port closes — through the sea screen, not only in the model.
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

// An abyss squadron sitting on the yard, already fighting.
const squadron = {
  id: 901,
  type: "enemy",
  hullId: "galeon-guerra",
  zoneId: "abismo",
  x: 150,
  y: 0,
  heading: 0,
  currentSpeedKn: 0,
  drift: { heading: 0, speedKn: 0 },
  engaged: true,
};
// The squadron is armed as the abyss arms it. Left to the sea, `ensureEnemyCombat` arms an
// enemy with the zone the PLAYER is standing in (coastal, beside the yard), which gives
// twelve light guns instead of thirty-four heavy ones and a siege that never ends. A
// squadron that chased the captain home keeps the guns it was born with, so that is what
// is seeded here.
squadron.combat = createEnemyCombatant({ id: 901, hullId: "galeon-guerra", zoneId: "abismo" }, { id: "abismo" }, 7);

const world = {
  v: 1, seed: 7, rngState: 7, nextId: 900, gold: 0, timeS: 0,
  // Inside the port radius (110 m), so the repair key reaches the yard's own check.
  ship: { x: 0, y: 40, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  encounters: [squadron],
};

// The yard starts nearly beaten, so the smoke does not have to wait a whole battle: her
// garrison is about to break, which is the case under test.
// The yard starts SOUND: her garrison is full, so the only thing that can make her strike
// is the squadron's fire. A pre-thinned yard would strike on her own and prove nothing.
const yard = createFortCombatant();

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(([fleetJson, worldJson, fort]) => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", fleetJson);
  localStorage.setItem("barcos:game:v1", JSON.stringify({
    gold: 5000,
    world: worldJson,
    fort: { condition: fort.condition, crew: fort.crew, status: fort.status },
    victories: 0,
  }));
}, [JSON.stringify({ v: 1, captainId: runtime.id, ships: [runtime] }), JSON.stringify(world), yard]);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const savedFort = () =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return game?.fort ?? null;
  });

const start = await savedFort();
check(start !== null, "S74: the sea save should carry the yard's state");

// Let the fight run: the squadron fires at the yard, her garrison breaks.
// The siege of one galleon against a sound yard lasts about 55 s of WORLD time at x1 (it
// ended in 55 s of wall clock when measured). The wait is bounded by the CLOCK, not by a
// count of polls: when the siege does not end, each poll takes seconds, and a count of 280
// turned a failing run into a twenty-two minute one.
const DEADLINE = Date.now() + 150_000;
let captured = null;
for (; Date.now() < DEADLINE && !captured; ) {
  await page.waitForTimeout(500);
  const fort = await savedFort();
  if (fort && (fort.status === "surrendered" || fort.status === "sunk")) captured = fort;
}

const finalCrew = (await savedFort())?.condition?.crew;
check(
  Boolean(captured),
  `S74: the abyss squadron should break the yard's garrison, her crew reads ${finalCrew}`,
);
// "Starts sound" is a fact about what was SEEDED, so it is read from the seed. Reading it
// back from the browser measures the yard after the siege has already begun: by the time
// the first sample is taken the squadron has had its first volleys.
check(
  yard.condition.crew === 100 && yard.condition.hull === 100,
  `S74: the yard must be seeded sound, or the strike is not the squadron's doing (crew ${yard.condition.crew}, hull ${yard.condition.hull})`,
);
check(
  (start.condition?.crew ?? 100) <= 100,
  "S74: the saved yard must not come back stronger than it was seeded",
);
if (captured) {
  check(
    captured.condition.crew <= (start.condition?.crew ?? 100),
    `S74: the yard's garrison should not grow while she is boarded (${start.condition?.crew} -> ${captured.condition.crew})`,
  );
}

// And the port is closed: the repair key refuses.
//
// The notice is looked for over the whole time the banner stays up (3 s), not read once
// after a fixed wait. The squadron is still on the yard, and the sea's own enemy-proximity
// warning rewrites the banner every 6 s: a single read 400 ms after the key landed on it
// in roughly one run in four and failed with «¡Vela hostil a 305 m!», which is a different
// notice and not a defect of the refusal. The text must also be the translated one: the
// old pattern (`/port/`) matched the raw catalogue key `sea.banner.portClosed`, so it
// passed while the player was shown an untranslated key.
await page.keyboard.press("r");
const REFUSAL = /astillero.*enemig|enemig.*astillero/i;
let banner = "";
for (let waited = 0; waited <= 2500; waited += 100) {
  banner = (await page.locator("#banner").textContent()) ?? "";
  if (REFUSAL.test(banner)) break;
  await page.waitForTimeout(100);
}
check(
  REFUSAL.test(banner) && !/^sea\./.test(banner.trim()),
  `S74: a taken yard should refuse repairs with a notice, the last banner read says "${banner}"`,
);

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: the abyss squadron broke the yard's garrison (crew ${start.condition.crew} -> ${captured?.condition?.crew}), she struck, and the port refused repairs`,
);
