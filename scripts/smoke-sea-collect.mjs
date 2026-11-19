import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S158: the pick-up order is a round, not a loop.
 *
 * The player reported (verbatim): "cuando le das a la tecla G recogida de doblones, entra en
 * un ciclo, seleccion de destello, ir a destello recoger doblones, y empieza otra vez". The
 * sea tops its treasures back up to the zone's quota on every tick, so waiting for an empty
 * sea never ends. The claims that matter:
 *
 *   - G starts the order and the banner says so;
 *   - the captain collects the buoys she set out for, and the order then ENDS by itself;
 *   - she does not keep sailing after the round is over.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 0,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  ),
  { name: "Santa Ana" },
);

// Three buoys close to the hull, so the round is short and the smoke is fast.
const world = {
  v: 1,
  seed: 7,
  rngState: 7,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 210, y: 70, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [],
  encounters: [
    { id: 901, type: "treasure", x: 320, y: 90, gold: 60, zoneId: "costera" },
    { id: 902, type: "treasure", x: 200, y: 260, gold: 60, zoneId: "costera" },
    { id: 903, type: "treasure", x: 150, y: -120, gold: 60, zoneId: "costera" },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, locale: "es-AR" });
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.addInitScript(
  ([shipsJson, worldJson]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", shipsJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify({ v: 1, captainId: ship.id, ships: [{ ...ship, commandId: ship.id, yardId: null }] }), JSON.stringify(world)],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(700);

await page.keyboard.press("g");
await page.waitForTimeout(400);
const started = await page.locator("#banner").textContent();
check(/bolas amarillas|golden buoys/i.test(started), `S158: G must start the round, banner said "${started}"`);

// The round is short: sail it out and watch the order end by itself.
const readGold = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1")).gold);
const before = await readGold();
// The round is three buoys spread over a few hundred metres, and the hull makes about 6 kn:
// the sail takes a while. The banner of a collected treasure shares the line, so the loop
// watches the gold as well as the text, and gives the voyage the time it needs.
let ended = false;
let banner = "";
for (let i = 0; i < 120 && !ended; i += 1) {
  await page.waitForTimeout(500);
  banner = await page.locator("#banner").textContent();
  if (/terminó la recogida|finished the pick-up/i.test(banner)) ended = true;
}
const collected = (await readGold()) - before;

check(ended, `S158: the round must end by itself, the banner said "${banner}"`);
check(collected >= 3, `S158: the round must collect the buoys it set out for, collected ${collected}`);

// Once the round is over she is not sailing to another one.
await page.waitForTimeout(1500);
const after = await readGold();
check(
  after === before + collected,
  `S158: the order must stop when the round is over, gold went from ${before + collected} to ${after}`,
);

await page.screenshot({ path: "/tmp/sea-collect.png" });
await browser.close();
console.log(JSON.stringify({ errors, failures, collected, banner }, null, 2));
if (failures.length > 0) process.exit(1);
