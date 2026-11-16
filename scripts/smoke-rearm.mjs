import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { rearmQuote } from "../src/model/rearm.js";

/**
 * Browser smoke for rearming at the yard (S121). Needs the local server on 8765.
 *
 * The player's report, verbatim: "despues de librar varias batallas y teniendo todo
 * correctamente el barco a dejado de disparar". Firing spends `shotsLeft` and a gun at
 * zero stops being a gun, and nothing in the game put rounds back. This proves the two
 * halves the fix promises:
 *
 *   the yard sells the missing rounds back, at the price the model quotes, and writes
 *   them into the sea save's racks — not only into the fleet sheet;
 *   the sea says it out loud when a hull's guns are dry, instead of going silent.
 *
 * The price is never a magic number: the expected one is computed with `rearmQuote`, the
 * same call the screen makes, so the screen and the model must agree.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
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
  { name: "Capitana" },
);
ship.condition = { hull: 100, rigging: 100, crew: 100, morale: 100 };

/** Her four guns came back from a fight with ten rounds each: sixty rounds are owed. */
const racks = (shotsLeft) => ({
  player: {
    condition: ship.condition,
    crew: { marino: 34, artillero: 10, soldado: 26 },
    pieces: [
      { pieceId: "minion", side: "babor", ammoId: "bala-hierro", shotsLeft, reloadTimer: 0 },
      { pieceId: "minion", side: "babor", ammoId: "bala-hierro", shotsLeft, reloadTimer: 0 },
      { pieceId: "minion", side: "estribor", ammoId: "bala-hierro", shotsLeft, reloadTimer: 0 },
      { pieceId: "minion", side: "estribor", ammoId: "bala-hierro", shotsLeft, reloadTimer: 0 },
    ],
  },
});

const world = {
  v: 1,
  seed: 202601,
  rngState: 202601,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: Math.PI, currentSpeedKn: 0, speedKn: ship.speedKn },
  encounters: [],
};

const browser = await chromium.launch();
try {
  /* ------------------------------------------- the yard sells the rounds back (S121) */

  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, locale: "es-AR" });
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  await page.addInitScript(({ ship, world, combat }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem(
      "barcos:game:v1",
      JSON.stringify({ gold: 5000, combat, world: JSON.stringify(world) }),
    );
  }, { ship, world, combat: racks(10) });

  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.click('.screen-tab[data-screen="flota"]');
  await page.waitForTimeout(200);
  await page.locator(`.fleet-item[data-ship-id="${ship.id}"] [data-refit]`).click();
  await page.waitForTimeout(200);

  const quote = rearmQuote(ship, racks(10).player);
  assert.equal(quote.rounds, 60, "four guns with ten rounds each owe sixty");
  assert.ok(quote.cost > 0, "the yard does not give the powder away");

  const button = page.locator("#fleet-rearm-btn");
  assert.equal(await button.isVisible(), true, "a hull owing rounds offers the rearm button");
  assert.equal(await button.isDisabled(), false, "five thousand doblones cover the rearm");
  const label = await button.textContent();
  assert.ok(label.includes("60"), `the button names the sixty missing rounds: "${label}"`);
  assert.ok(label.includes("Rearmar"), `the button says what it does: "${label}"`);

  const goldBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1")).gold);
  assert.equal(goldBefore, 5000);

  await button.click();
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => ({
    game: JSON.parse(localStorage.getItem("barcos:game:v1")),
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    notice: document.querySelector("#purchase-notice").textContent,
    buttonVisible: !document.querySelector("#fleet-rearm-btn").hidden,
  }));

  assert.equal(after.game.gold, 5000 - quote.cost, "the yard charges exactly what it quoted");
  assert.ok(after.notice.includes("60"), `the player is told the rounds went back: "${after.notice}"`);
  assert.deepEqual(
    after.game.combat.player.pieces.map((gun) => gun.shotsLeft),
    [25, 25, 25, 25],
    "the racks are written into the sea save, which is what the next voyage is built from",
  );
  assert.deepEqual(
    after.fleet.ships[0].batteries.map((battery) => battery.shotsPerPiece),
    [25, 25],
    "and the fleet sheet keeps the allowance she was built with",
  );
  assert.equal(after.buttonVisible, false, "a hull with full racks owes nothing, so the button is gone");

  // Paying twice for the same rounds would be the real bug: a second click must be free.
  await page.evaluate(() => document.querySelector("#fleet-rearm-btn").click());
  await page.waitForTimeout(200);
  const again = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1")).gold);
  assert.equal(again, 5000 - quote.cost, "rearming twice pays once");

  // The loadout survives a reload: the fleet sheet, not the screen, is what she sails from.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")));
  assert.deepEqual(
    reloaded.ships[0].batteries.map((battery) => battery.shotsPerPiece),
    [25, 25],
    "a reload keeps the rounds the player paid for",
  );

  /* --------------------------------------------- the sea says the guns are dry (S121) */

  const dry = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  const dryErrors = [];
  dry.on("pageerror", (error) => dryErrors.push(error.message));
  await dry.addInitScript(({ ship, world, combat }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem(
      "barcos:game:v1",
      JSON.stringify({ gold: 0, combat, world: JSON.stringify(world) }),
    );
  }, { ship, world, combat: racks(0) });

  await dry.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await dry.waitForTimeout(2500);
  const banner = await dry.locator("#banner").textContent();
  assert.ok(
    banner.includes("Sin munición") && banner.includes("Capitana"),
    `the sea names the dry hull instead of going silent: "${banner}"`,
  );

  assert.deepEqual(errors, [], `the fleet screen threw: ${errors.join(" | ")}`);
  assert.deepEqual(dryErrors, [], `the sea screen threw: ${dryErrors.join(" | ")}`);

  console.log(`smoke-rearm OK — ${quote.rounds} rounds for ${quote.cost} doblones`);
} finally {
  await browser.close();
}
