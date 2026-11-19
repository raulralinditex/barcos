import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S155-H: the yard's fleet room grouped by captain.
 *
 * The player asked for it in those words (verbatim): "un panel de \"tu flota\" por capitana,
 * puedes mover los barcos entre los paneles". The claims that matter and cannot be read off a
 * screenshot:
 *
 *   - two captains in the same yard each get their own block with their own hulls;
 *   - handing a hull to the other captain moves her in the panels;
 *   - the move is written to the stored fleet, as the new captain's `commandId`;
 *   - a single captain still draws the flat list the room always had (S155-I).
 */

const build = (name, extra = {}) =>
  toRuntimeShip(
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
    { name },
  );

const home = "puerto-casa";
const captainA = { ...build("Santa Ana"), commandId: null, yardId: home };
captainA.commandId = captainA.id;
const captainB = { ...build("Numancia"), yardId: home };
captainB.commandId = captainB.id;
const escort = { ...build("Aviso"), yardId: home, commandId: captainA.id };

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const open = async (ships) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, locale: "es-AR" });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([shipsJson]) => {
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", shipsJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 40000 }));
    },
    [JSON.stringify({ v: 1, captainId: captainA.id, ships })],
  );
  await page.goto("http://localhost:8765/index.html#flota", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  return page;
};

/* --------------------------------------------- 1: two captains, two blocks */

let page = await open([captainA, escort, captainB]);

const blocks = await page.locator(".fleet-captain-block").count();
check(blocks === 2, `S155-H: the room must draw one block per captain, drew ${blocks}`);

const blockA = page.locator(`.fleet-captain-block[data-captain-block="${captainA.id}"]`);
const blockB = page.locator(`.fleet-captain-block[data-captain-block="${captainB.id}"]`);
check(await blockA.count() === 1, "S155-H: the first captain has no block of her own");
check(await blockB.count() === 1, "S155-H: the second captain has no block of her own");

const hullsOfA = await blockA.locator(".fleet-item").evaluateAll((rows) =>
  rows.map((row) => row.dataset.shipId),
);
const hullsOfB = await blockB.locator(".fleet-item").evaluateAll((rows) =>
  rows.map((row) => row.dataset.shipId),
);
check(
  hullsOfA.length === 2 && hullsOfA.includes(captainA.id) && hullsOfA.includes(escort.id),
  `S155-H: the first block must hold her own hull and her escort, holds ${JSON.stringify(hullsOfA)}`,
);
check(
  hullsOfB.length === 1 && hullsOfB[0] === captainB.id,
  `S155-H: the second block must hold only her own hull, holds ${JSON.stringify(hullsOfB)}`,
);

/* --------------------------------------------- 2: hand the escort to the other captain */

const move = blockA.locator(`select[data-move="${escort.id}"]`);
check(await move.count() === 1, "S155-H: a hull under a captain offers no way to be handed over");

if ((await move.count()) === 1) {
  await move.selectOption(captainB.id);
  await page.waitForTimeout(500);

  const afterA = await blockA.locator(".fleet-item").evaluateAll((rows) =>
    rows.map((row) => row.dataset.shipId),
  );
  const afterB = await blockB.locator(".fleet-item").evaluateAll((rows) =>
    rows.map((row) => row.dataset.shipId),
  );
  check(
    !afterA.includes(escort.id),
    `S155-H: the hull was not taken out of her old captain's block, still ${JSON.stringify(afterA)}`,
  );
  check(
    afterB.includes(escort.id),
    `S155-H: the hull did not appear under the new captain, holds ${JSON.stringify(afterB)}`,
  );

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")));
  const handover = stored.ships.find((ship) => ship.id !== stored.captainId && ship.commandId === captainB.id);
  check(
    handover !== undefined,
    `S155-H: the move was not written to the stored fleet: ${JSON.stringify(
      stored.ships.map((ship) => [ship.id, ship.commandId]),
    )}`,
  );
  check(
    handover?.id === escort.id,
    `S155-H: the wrong hull was handed over, stored ${handover?.id}`,
  );
}

/* --------------------------------------------- 3: a captain is never handed over */

const captainMove = await blockA.locator(`select[data-move="${captainA.id}"]`).count();
check(captainMove === 0, "S155-H: a captain must not offer to be handed to another captain");

await page.screenshot({ path: "/tmp/fleet-squadrons.png" });
await page.close();

/* --------------------------------------------- 4: one captain keeps the flat list (S155-I) */

page = await open([captainA, escort]);
const flat = await page.locator(".fleet-captain-block").count();
const items = await page.locator(".fleet-item").count();
check(flat === 0, `S155-I: a single captain must keep the flat list, found ${flat} captain blocks`);
check(items === 2, `S155-I: the flat list must still draw both hulls, drew ${items}`);
await page.close();

await browser.close();
console.log(JSON.stringify({ errors, failures }, null, 2));
if (failures.length > 0) process.exit(1);
