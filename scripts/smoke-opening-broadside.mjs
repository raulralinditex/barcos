import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { COMBAT, createPlayerCombatant, openingBonus, sideRangeM } from "../src/model/combat.js";

/**
 * Browser smoke for the opening broadside, the cost of changing round, and the lit range
 * arc (S69, S70, S71). Needs the local server on 8765.
 *
 *   S69  the first volley of a beam after engaging hits harder and aims better, once per beam;
 *   S70  the round-change key reaches the guns (its reload cost is pinned in the model tests);
 *   S71  the arc of a beam with every gun loaded is drawn solid.
 */

const runtime = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
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

// The enemy sits on the starboard beam, close enough that chain shot still reaches it
// (a minion's chain range is about 245 m): a switched volley that cannot fire would make
// the reload comparison meaningless.
const enemy = {
  id: 901,
  type: "enemy",
  hullId: "patache",
  x: 0,
  y: 150,
  heading: 0,
  currentSpeedKn: 0,
  drift: { heading: 0, speedKn: 0 },
};

const world = {
  v: 1,
  seed: 7,
  rngState: 7,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  encounters: [enemy],
};

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.addInitScript(
  ([fleetJson, worldJson]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    // Automatic fire is on by default and would spend the opening volley before this
    // smoke can press the key (S47). It is turned off so the volley under test is the
    // one the player ordered.
    localStorage.setItem("barcos:autofire:v1", "0");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify({ v: 1, captainId: runtime.id, ships: [runtime] }), JSON.stringify(world)],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

/** The player's combatant as the sea has it, read back through the saved record. */
const guns = () =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return (game?.combat?.player?.pieces ?? []).map((p) => ({
      pieceId: p.pieceId,
      ammoId: p.ammoId,
      reloadTimer: p.reloadTimer,
    }));
  });

/* ------------------------------------------------- S69: the opening volley exists */

// The model side: an engaged, fresh combatant has a live bonus on both beams.
const model = createPlayerCombatant(runtime);
model.engaged = true;
model.openedFire = { babor: false, estribor: false };
check(
  openingBonus(model, "estribor").damage === COMBAT.openingDamageBonus,
  "S69: a fresh engaged beam should carry the opening bonus",
);
check(
  openingBonus(model, "estribor").accuracy === COMBAT.openingAccuracyBonus,
  "S69: and the accuracy bonus too",
);
model.openedFire.estribor = true;
check(openingBonus(model, "estribor").damage === 1, "S69: firing spends it");

// The sea side: fire the starboard beam and read the clock straight away. Both reloads
// are measured the same 120 ms after the shot, or the comparison is between a fresh
// clock and one that has already run down.
const beforeFire = await guns();
await page.keyboard.press("e");
await page.waitForTimeout(120);
const afterFire = await guns();
const spent = afterFire.filter((p, i) => p.reloadTimer > (beforeFire[i]?.reloadTimer ?? 0));
check(spent.length > 0, "S69: the starboard beam should have fired and be reloading");

/* ------------------------------------------------- S71: the loaded beam's arc is solid */

// The arc is measured ON ITS OWN RING, never over the whole canvas. Two earlier versions of
// this check counted "bright" pixels everywhere and passed with the arc switched off: the
// canvas pixel alpha is always 255 (the sea is opaque), so the line's opacity never shows
// up there, and a light-blue filter also matches the reload bars. What does change is the
// colour on the ring itself: a ready beam is drawn at 85 % over the sea, a reloading one at
// 26 %, so the ready ring is light blue and the reloading ring is almost the sea's colour.
const PX_PER_M = 0.4; // camera scale in sea.js
// Measured in the IRON phase, before key 2: iron reaches 350 m, the enemy is inside it, and
// the first volley leaves the guns. (Chain shot reaches 245 m and the AI moves the enemy
// out of that range, so a measurement taken after switching would never see a reload.)
const ringPx = sideRangeM(createPlayerCombatant(runtime), "estribor") * PX_PER_M;
check(ringPx > 20, `S71: the starboard arc should have a radius to measure, got ${ringPx}`);

/** Light-blue pixels on the starboard arc's ring, 30 to 150 degrees below the ship. */
const ringLight = () =>
  page.evaluate((radius) => {
    const canvas = document.querySelector("#sea-canvas");
    const { width, height } = canvas;
    const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
    const cx = width / 2;
    const cy = height / 2;
    let light = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - radius) > 3) continue;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle < 30 || angle > 150) continue;
        const i = (y * width + x) * 4;
        if (data[i] > 105 && data[i + 1] > 150 && data[i + 2] > 190) light += 1;
      }
    }
    return light;
  }, ringPx);

// Reloading: the S69 volley left the starboard guns a moment ago (read straight away).
const reloading = await ringLight();

// Ready: wait until every gun is back, then read the same ring again.
for (let i = 0; i < 40; i += 1) {
  if (!(await guns()).some((p) => (p.reloadTimer ?? 0) > 0)) break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(200);
const ready = await ringLight();

// The threshold is measured, not guessed: a ready arc paints ~790 light px on this ring, a
// reloading one 0, and an arc forced to "never ready" still leaves ~140 (the dashes at 26 %
// over a mid-blue sea). 400 sits well clear of both, so only a genuinely solid arc passes.
check(ready > 400, `S71: a loaded beam's arc should be solid on its ring (over 400 light px), found ${ready}`);
check(
  reloading * 3 < ready,
  `S71: a reloading beam's arc must be much fainter than a loaded one (${reloading} vs ${ready} light px)`,
);
const arcPixels = { bright: ready, faint: reloading };

/* ------------------------------------------------- S70: changing round is an order the sea obeys */

// The COST of changing round (a longer reload for the guns that changed) is pinned in the
// model, in test/opening-broadside.test.js, where the target does not move. It cannot be
// measured honestly here: chain shot reaches about 245 m, the enemy AI moves the target
// out of that range after the first volley, and the second shot never leaves the guns, so
// the comparison would be between a reload and no reload. What belongs to the browser is
// that the key reaches the guns: pressing 2 must load chain shot into the minions.
for (let i = 0; i < 40; i += 1) {
  const reloading = (await guns()).some((p) => (p.reloadTimer ?? 0) > 0);
  if (!reloading) break;
  await page.waitForTimeout(250);
}

await page.keyboard.press("2");
await page.waitForTimeout(400);
const afterSwitch = await guns();
check(
  afterSwitch.some((p) => p.ammoId === "cadena"),
  "S70: key 2 should have loaded chain shot into the minions",
);
check(
  afterSwitch.every((p) => p.ammoId === "cadena" || p.ammoId === "bala-hierro"),
  "S70: no gun may hold a round the scenario never gave it",
);

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: the opening volley fires and is spent, key 2 loads chain shot, and the loaded arc is solid (${arcPixels.bright} px) and the reloading one is faint (${arcPixels.faint} px)`,
);
