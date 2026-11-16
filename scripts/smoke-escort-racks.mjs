import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for an escort's racks surviving the sea save (S122).
 *
 * The hole S121 left open: rearming writes the rounds back into the sea save's
 * `combat.escorts[id].pieces`, but the sea never wrote those pieces in the first place
 * and never read them back. So an escort came out of a fight dry, the yard sold her the
 * rounds back, and the next voyage rigged her out of the fleet sheet as if nothing had
 * happened — the rearm was paid for and forgotten.
 *
 * Two things are proved here, both against the save the next voyage is built from:
 *   an escort's racks are written down, so a dry gun stays dry across a reload;
 *   and the rounds the yard sold come back with her, so the rearm was not wasted.
 */

const build = (hullId, name, shots) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries: [
          { pieceId: "minion", qty: 1, side: "babor", shotsPerPiece: shots, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 1, side: "estribor", shotsPerPiece: shots, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 0,
        ballastKg: 0,
        equipmentKg: 0,
        reserveKg: 0,
      },
      12000,
    ),
    { name },
  );

const captain = build("galeon-pequeno", "Capitana", 25);
const escort = build("barca-costera", "Escolta", 25);
escort.id = "escolta-1";
const fleet = { v: 1, ships: [captain, escort], captainId: captain.id };

const world = {
  v: 1,
  seed: 202602,
  rngState: 202602,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: Math.PI, currentSpeedKn: 0, speedKn: captain.speedKn },
  encounters: [],
};

/** Her two guns came home empty: the fight is over, the racks are not. */
const dryEscort = {
  condition: escort.condition,
  crew: escort.crew,
  pieces: [
    { pieceId: "minion", side: "babor", ammoId: "bala-hierro", shotsLeft: 0, reloadTimer: 0 },
    { pieceId: "minion", side: "estribor", ammoId: "bala-hierro", shotsLeft: 0, reloadTimer: 0 },
  ],
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.addInitScript(({ fleet, world, dryEscort, escortId }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:autofire:v1", "0");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify(fleet));
    localStorage.setItem(
      "barcos:game:v1",
      JSON.stringify({
        gold: 5000,
        world: JSON.stringify(world),
        combat: {
          player: { condition: fleet.ships[0].condition, crew: fleet.ships[0].crew, pieces: [] },
          escorts: { [escortId]: dryEscort },
        },
      }),
    );
  }, { fleet, world, dryEscort, escortId: escort.id });

  /* ------------------------------------- her dry racks are written down and read back */

  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  // The sea autosaves every three seconds: give it one round of that to say what she sails.
  await page.waitForTimeout(4200);

  const saved = await page.evaluate((escortId) => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return game?.combat?.escorts?.[escortId] ?? null;
  }, escort.id);

  assert.ok(saved, "the sea save carries the escort's combat record");
  assert.ok(Array.isArray(saved.pieces), "the escort's racks are in the sea save at all (S122)");
  assert.deepEqual(
    saved.pieces.map((gun) => gun.shotsLeft),
    [0, 0],
    "a gun that came home dry stays dry: the fleet sheet must not re-rig her for free",
  );

  /* --------------------------------- the rounds the yard sold come back with her (S121) */

  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.click('.screen-tab[data-screen="flota"]');
  await page.waitForTimeout(200);
  await page.locator(`.fleet-item[data-ship-id="${escort.id}"] [data-refit]`).click();
  await page.waitForTimeout(200);

  const rearm = page.locator("#fleet-rearm-btn");
  assert.equal(await rearm.isVisible(), true, "the dry escort owes rounds, so the yard offers them");
  const goldBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1")).gold);
  await rearm.click();
  await page.waitForTimeout(300);
  const goldAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1")).gold);
  assert.ok(goldAfter < goldBefore, "the yard charged for the rounds");

  // Back to sea: what she sails with is what the yard sold her, not the builder's default.
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(4200);
  const rearmed = await page.evaluate((escortId) => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return game?.combat?.escorts?.[escortId]?.pieces ?? null;
  }, escort.id);
  assert.deepEqual(
    rearmed?.map((gun) => gun.shotsLeft),
    [25, 25],
    "the rounds she was sold are the rounds she sails with",
  );

  assert.deepEqual(errors, [], `the screens threw: ${errors.join(" | ")}`);
  console.log("smoke-escort-racks OK — a dry escort stays dry until the yard sells her rounds");
} finally {
  await browser.close();
}
