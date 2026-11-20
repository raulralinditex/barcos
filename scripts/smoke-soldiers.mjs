import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S160: the soldiers have a mechanic.
 *
 * The player asked for it (verbatim): "vamos a darles una mecanica a los soldados", chose all
 * three of the offered ones ("las tres"), and made the capture demand soldiers ("Sí: la
 * captura pasa a exigir soldados").
 *
 * The claims that matter, measured through the real screen:
 *   - a hull with no soldiers does NOT take a prize that strikes in front of her;
 *   - a hull with soldiers DOES take it, and the prize joins the squadron;
 *   - the reason is on screen, so the player learns why she lost the ship.
 */

const build = (soldiers) =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "galeon-pequeno",
        batteries: [
          { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 40, ammoId: "metralla" },
          { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 40, ammoId: "metralla" },
        ],
        crew: { marino: 34, artillero: 10, soldado: soldiers },
        days: 45,
        cargoKg: 0,
        ballastKg: 3_000,
        equipmentKg: 2_500,
        reserveKg: 1_500,
      },
      12000,
    ),
    { name: soldiers > 0 ? "Con soldados" : "Sin soldados" },
  );

/** A sea with one enemy already struck, right next to the hull. */
const struckSea = (ship) => ({
  v: 1,
  seed: 4,
  rngState: 4,
  nextId: 500,
  gold: 0,
  timeS: 0,
  ship: { x: 210, y: 70, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [],
  level: 1,
  levelEnemies: [501],
  levelVictories: 0,
  order: { throttle: 0, turn: 0 },
  squadrons: [],
  encounters: [
    {
      id: 501,
      type: "enemy",
      x: 260,
      y: 80,
      hullId: "patache",
      zoneId: "costera",
      level: 1,
      engaged: true,
      heading: 0,
      currentSpeedKn: 0,
      drift: { heading: 0, speedKn: 1 },
      combat: {
        name: "Patache",
        status: "fighting",
        condition: { hull: 95, rigging: 95, crew: 100, morale: 100 },
        crew: { marino: 14, artillero: 2, soldado: 4 },
        initialCrew: 20,
        crewMin: 6,
        hullToughness: 1,
        pieces: [],
        damageDealt: { babor: 0, estribor: 0 },
        crewDamagePool: 0,
      },
    },
  ],
});

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const open = async (ship) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: "es-AR" });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([fleetJson, worldJson]) => {
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
    },
    [
      JSON.stringify({ v: 1, captainId: ship.id, ships: [{ ...ship, commandId: ship.id, yardId: null }] }),
      JSON.stringify(struckSea(ship)),
    ],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  return page;
};

const fleetCount = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.length);

/**
 * The fleet the fixture wrote: the captain alone.
 *
 * The capture lands inside the first second of the voyage (the prize is 51 m away and
 * already struck), so reading the fleet once the page has settled measures a capture that
 * has ALREADY happened. The baseline is the one the fixture seeded.
 */
const FLEET_AT_OPEN = 1;

/* ------------------------------------- 1: no soldiers, no prize (S160-B) */

const bare = build(0);
let page = await open(bare);
const beforeBare = FLEET_AT_OPEN;
let banner = "";
for (let i = 0; i < 60; i += 1) {
  await page.waitForTimeout(300);
  const text = await page.locator("#banner").textContent();
  if (/soldados|saquea/i.test(text)) { banner = text; break; }
}
check(
  /soldados|saquea/i.test(banner),
  `S160-B: a hull with no soldiers must say why she cannot take the prize, banner said "${banner}"`,
);
const afterBare = await fleetCount(page);
check(
  afterBare === beforeBare,
  `S160-B: a hull with no soldiers must NOT take the prize, fleet went ${beforeBare} → ${afterBare}`,
);
await page.context().close();

/* ------------------------------------- 2: with soldiers, the prize is taken */

const armed = build(40);
page = await open(armed);
const beforeArmed = FLEET_AT_OPEN;
let taken = "";
for (let i = 0; i < 60; i += 1) {
  await page.waitForTimeout(300);
  const text = await page.locator("#banner").textContent();
  if (/capturada|suma a tu flota/i.test(text)) { taken = text; break; }
}
const afterArmed = await fleetCount(page);
check(
  afterArmed === beforeArmed + 1,
  `S160-B: a hull with soldiers must take the prize, fleet went ${beforeArmed} → ${afterArmed}`,
);
check(/capturada|suma a tu flota/i.test(taken), `S160-B: the capture must be announced, banner said "${taken}"`);
await page.context().close();

await browser.close();
console.log(JSON.stringify({ errors, failures }, null, 2));
if (failures.length > 0) process.exit(1);
