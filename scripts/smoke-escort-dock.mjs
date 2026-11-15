import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { repairCost } from "../src/model/repair.js";

/**
 * Browser smoke: an escort repaired in the shipyard stays repaired when the fleet puts
 * to sea again (S23, S45). The sea save of the last voyage wins over the fleet sheet on
 * boot, so the shipyard has to patch it too, not only the captain's part of it.
 * Needs the local server on 8765.
 */

const build = (hullId, name) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
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
    { name },
  );

const captain = build("galeon-pequeno", "Captain");
const escort = build("zabra", "Escort");
escort.id = `${escort.id}-escort`;
const hurt = { hull: 40, rigging: 55, crew: 100, morale: 100 };
escort.condition = { ...hurt };
const fleet = { v: 1, captainId: captain.id, ships: [captain, { ...escort, sails: true }] };

// The sea save of the last voyage: it still carries the escort's old damage.
const seaSave = {
  gold: 5000,
  combat: { escorts: { [escort.id]: { condition: { ...hurt }, crew: { ...escort.crew } } } },
};

const browser = await chromium.launch();
const failures = [];
const errors = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(
  ([fleetJson, saveJson]) => {
    if (localStorage.getItem("smoke:seeded")) return;
    localStorage.setItem("smoke:seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", saveJson);
  },
  [JSON.stringify(fleet), JSON.stringify(seaSave)],
);

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const before = await page.evaluate(() => ({
  fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
  game: JSON.parse(localStorage.getItem("barcos:game:v1")),
}));
assert.deepEqual(before.fleet.ships.find((entry) => entry.id === escort.id).condition, hurt);
assert.equal(before.game.gold, 5000);
assert.deepEqual(before.game.combat.escorts[escort.id].condition, hurt);
assert.equal(await page.locator("#dock-dialog").isHidden(), true);
// The flota room owns this control now (S105).
await page.click('.screen-tab[data-screen="flota"]').catch(() => {});

const button = page.locator(`.fleet-item[data-ship-id="${escort.id}"] [data-repair]`);
assert.equal(await button.count(), 1, "the escort must have a fleet repair button");
await button.click();
await page.waitForTimeout(400);
const repaired = await page.evaluate(() => ({
  fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
  game: JSON.parse(localStorage.getItem("barcos:game:v1")),
}));
assert.equal(repaired.game.gold, 5000 - repairCost(escort), "escort repair charges once");
assert.deepEqual(repaired.fleet.ships.find((entry) => entry.id === captain.id).condition, before.fleet.ships.find((entry) => entry.id === captain.id).condition);
assert.equal(repaired.game.combat.escorts[escort.id].condition.hull, 100);
assert.equal(repaired.game.combat.escorts[escort.id].condition.rigging, 100);
const inFleet = await page.evaluate((id) => {
  const ships = JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships;
  return ships.find((ship) => ship.id === id)?.condition?.hull;
}, escort.id);
if (inFleet !== 100) failures.push(`the shipyard did not repair the escort's fleet entry (hull ${inFleet})`);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const atSea = await page.evaluate((id) => {
  window.dispatchEvent(new Event("beforeunload"));
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return game.combat?.escorts?.[id]?.condition ?? null;
}, escort.id);
if (!atSea) failures.push("the escort is not at sea");
else {
  if (atSea.hull !== 100) failures.push(`the repaired escort sailed with its old hull: ${atSea.hull}`);
  if (atSea.rigging !== 100) failures.push(`the repaired escort sailed with its old rigging: ${atSea.rigging}`);
}

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
assert.deepEqual(failures, [], failures.join("\n"));
console.log("SMOKE OK: an escort repaired in the shipyard sails repaired");
