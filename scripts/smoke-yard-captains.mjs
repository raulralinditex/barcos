import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { SHIPYARDS } from "../src/data/naval-data.js";

/**
 * Browser smoke for S183: a captain per yard shows as capitana, sails from her own yard and
 * is placed at that yard's anchor.
 *
 * The player reported it (verbatim, in Spanish): after buying a hull in "aguas costeras"
 * (ensenada-abierta) she must read as that yard's CAPITANA, and setting sail with her must
 * take her out of that yard and leave her beside its quay — not beside the other ships.
 * Measured causes, each one a claim here:
 *
 *   A. entering a yard by hash (`index.html#flota:<yard>`, what the sea writes) rendered the
 *      fleet list before `viewedYardId` was set, so the yard listed the home yard's hulls;
 *   B. the capitana tag and the promote button keyed off `fleet.captainId` only, so a hull
 *      that commands her own yard read as a plain hull;
 *   C. `departYard` sailed `fleet.captainId`, not the captain of the yard on screen;
 *   D. the sea kept the saved station and never placed a squadron at the anchor of the yard
 *      it had just left.
 */

const A = SHIPYARDS.find((yard) => yard.id === "ensenada-abierta");
const B = SHIPYARDS.find((yard) => yard.id === "cala-del-abismo");

const design = buildShip(
  {
    hullId: "galeon-pequeno",
    batteries: [
      { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    ],
    crew: { marino: 34, artillero: 10, soldado: 26 },
    days: 45,
    cargoKg: 0,
    ballastKg: 3000,
    equipmentKg: 2500,
    reserveKg: 1500,
  },
  12000,
);
if (!design?.feasible) throw new Error("smoke setup failed: the ship is not feasible");
const hull = (name, id, fields = {}) => ({ ...toRuntimeShip(design, { name }), id, ...fields });

/* The fleet of the report: the first captain under way, one captain per yard, and a hull of
 * the first yard's command so the promote control has somebody to appear for. */
const ship1 = hull("Primera", "ship1", { commandId: "ship1", yardId: null });
const ship2 = hull("CapitanaA", "ship2", { commandId: "ship2", yardId: A.id });
const escort = hull("EscoltaA", "ship2-escort", { commandId: "ship2", yardId: A.id, sails: true });
const ship3 = hull("CapitanaB", "ship3", { commandId: "ship3", yardId: B.id });
const fleet = { v: 1, captainId: ship1.id, ships: [ship1, ship2, escort, ship3] };

// The sea save: the first captain alone on the water, far from both yards.
const world = {
  v: 1,
  seed: 4242,
  rngState: 4242,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 3400, y: 900, heading: 0, currentSpeedKn: 0, speedKn: ship1.speedKn, id: ship1.id },
  escorts: [],
  encounters: [],
};

const failures = [];
const errors = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const seed = (page) =>
  page.addInitScript(
    ([fleetJson, worldJson]) => {
      // Seed once per tab: a navigation to the sea would otherwise re-seed the fleet and undo
      // the departure the player just made (the seed is a test fixture, not the game).
      if (sessionStorage.getItem("yard-captains")) return;
      sessionStorage.setItem("yard-captains", "1");
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 200000, world: worldJson }));
    },
    [JSON.stringify(fleet), JSON.stringify(world)],
  );

const browser = await chromium.launch();
try {
  /* -------------------------------------------------- A and B: the yard entered by hash */

  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await seed(page);
  await page.goto(`http://localhost:8765/index.html#flota:${A.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  const listed = await page.locator("#fleet-list .fleet-item").evaluateAll((rows) =>
    rows.map((row) => row.dataset.shipId));
  check(
    listed.includes(ship2.id) && listed.includes(escort.id),
    `A: entering ${A.id} by hash must list the hulls moored there, it lists ${JSON.stringify(listed)}`,
  );
  check(
    !listed.includes(ship1.id) && !listed.includes(ship3.id),
    `A: the yard must not list a captain of another water, it lists ${JSON.stringify(listed)}`,
  );

  const tag = await page.locator(`.fleet-item[data-ship-id="${ship2.id}"] .fleet-tag`).textContent().catch(() => null);
  check(
    (tag ?? "").trim() === "capitana",
    `B: the captain of this yard must read as capitana, the row says ${JSON.stringify(tag)}`,
  );
  check(
    (await page.locator(`.fleet-item[data-ship-id="${ship2.id}"] [data-captain]`).count()) === 0,
    "B: a captain must not be offered the promote button",
  );
  check(
    (await page.locator(`.fleet-item[data-ship-id="${escort.id}"] [data-captain]`).count()) === 1,
    "B: a hull that is not a captain must still be offered the promote button",
  );

  /* ------------------------------------- B, buying: the new hull is capitana of this yard */

  const fresh = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  fresh.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await fresh.addInitScript(
    ([fleetJson, worldJson]) => {
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 200000, world: worldJson }));
    },
    [JSON.stringify({ v: 1, captainId: ship1.id, ships: [ship1] }), JSON.stringify(world)],
  );
  await fresh.goto(`http://localhost:8765/index.html#comprar:${A.id}`, { waitUntil: "networkidle" });
  await fresh.waitForTimeout(600);
  await fresh.fill("#ship-name", "RecienComprada");
  await fresh.waitForTimeout(200);
  if (!(await fresh.locator("#launch-btn").isDisabled())) await fresh.click("#launch-btn");
  await fresh.waitForTimeout(500);
  await fresh.click('.screen-tab[data-screen="flota"]');
  await fresh.waitForTimeout(400);
  const bought = await fresh.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    const ship = stored.ships.find((entry) => entry.name === "RecienComprada");
    return ship ? { id: ship.id, commandId: ship.commandId, yardId: ship.yardId } : null;
  });
  check(Boolean(bought), "B: the purchase must be stored in the fleet");
  if (bought) {
    check(bought.commandId === bought.id, `B: a hull bought in a yard nobody commands must command it, got ${bought.commandId}`);
    const boughtTag = await fresh.locator(`.fleet-item[data-ship-id="${bought.id}"] .fleet-tag`).textContent().catch(() => null);
    check(
      (boughtTag ?? "").trim() === "capitana",
      `B: the new captain of this yard must read as capitana, the row says ${JSON.stringify(boughtTag)}`,
    );
  }
  await fresh.close();

  /* ----------------------------------- C and D: she sails from her yard, and lands beside it */

  const row = page.locator(`.fleet-item[data-ship-id="${ship2.id}"] [data-refit]`);
  if ((await row.count()) === 0) {
    failures.push(`C: the yard does not list the captain to sail her (${A.id})`);
  } else {
    await row.click();
    await page.waitForTimeout(250);
  }
  const sail = page.locator("#set-sail-btn");
  check(!(await sail.isDisabled()), `C: the sail button must be usable for the captain of ${A.id}`);
  if ((await row.count()) > 0 && !(await sail.isDisabled())) {
    await Promise.all([page.waitForURL(/sea\.html/, { timeout: 8000 }), sail.click()]);
    // The sea publishes its world on a 3 s autosave (`setInterval(saveGame, 3000)` in
    // `src/ui/sea.js`), and the fixture already seeded a game record with a world of her own.
    // Waiting for "there is a world" therefore reads the FIXTURE, not the sea's: it is true
    // before the sea has written anything. Wait for the sea's own record to carry the
    // squadron that just sailed, which is the only thing this rule claims.
    await page.waitForFunction(
      (id) => {
        try {
          const world = JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world);
          return (world.squadrons ?? []).some((entry) => entry?.id === id);
        } catch {
          return false;
        }
      },
      ship2.id,
      { timeout: 15000 },
    );
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => ({
      fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
      world: JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world),
    }));
    const at = Object.fromEntries(after.fleet.ships.map((ship) => [ship.id, ship.yardId]));
    check(at[ship2.id] === null, `C: the captain the player sailed must leave ${A.id}, she is at ${at[ship2.id]}`);
    check(at[escort.id] === null, `C: her marked hull sails with her, she is at ${at[escort.id]}`);
    check(at[ship3.id] === B.id, `C: another yard's captain must stay moored, she is at ${at[ship3.id]}`);
    check(after.fleet.captainId === ship1.id, `C: sailing a yard's captain must not move the fleet's helm, it reads ${after.fleet.captainId}`);

    const squadron = (after.world.squadrons ?? []).find((entry) => entry.id === ship2.id);
    check(Boolean(squadron), `D: the sea must show the captain who just sailed, it holds ${JSON.stringify((after.world.squadrons ?? []).map((entry) => entry.id))}`);
    if (squadron) {
      check(
        squadron.ship.x === A.x && squadron.ship.y === A.y,
        `D: she must be placed at ${A.id}'s anchor (${A.x},${A.y}), she is at (${Math.round(squadron.ship.x)},${Math.round(squadron.ship.y)})`,
      );
    }
    check(
      after.world.ship.id === ship1.id && after.world.ship.x === world.ship.x && after.world.ship.y === world.ship.y,
      `D: the fleet's captain must keep her station, she is at (${Math.round(after.world.ship.x)},${Math.round(after.world.ship.y)})`,
    );
  }
  await page.close();

  if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: a yard's captain reads as capitana, sails from her own yard and lands at its anchor");
