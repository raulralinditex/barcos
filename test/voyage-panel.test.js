import test from "node:test";
import assert from "node:assert/strict";
import { COMMODITIES } from "../src/data/naval-data.js";
import { buyCargo, sellCargo, withHold } from "../src/model/commerce.js";
import { fleetUpkeep } from "../src/model/fleet.js";
import { GAME_TIME, burnSupply, supplySeconds } from "../src/model/game-time.js";
import { applyRefit, configFromShip } from "../src/model/refit.js";
import { repairFleetShip } from "../src/model/repair.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { voyageClock } from "../src/model/voyage-clock.js";

const config = {
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45, cargoKg: 0, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
};

const makeShip = () => ({
  ...toRuntimeShip(buildShip(config), { name: "Capitana" }), id: "captain",
  condition: { hull: 50, rigging: 100, crew: 100, morale: 100 },
});

test("S131: repair, unchanged refit and trading leave the hull's provision days alone", () => {
  const ship = makeShip();
  const fleet = { captainId: ship.id, ships: [ship] };
  const repaired = repairFleetShip(fleet, ship.id, 100000, { allowCaptain: true });
  assert.equal(repaired.repaired, true);
  assert.equal(repaired.fleet.ships[0].days, 45);
  const refitted = applyRefit(repaired.fleet.ships[0], configFromShip(repaired.fleet.ships[0]), repaired.gold);
  assert.equal(refitted.applied, true);
  assert.equal(refitted.ship.days, 45);
  const id = COMMODITIES[0].id;
  const purchase = buyCargo({ ...refitted.ship, gold: refitted.gold }, id, 1, "costera");
  assert.ok(purchase);
  const loaded = withHold(refitted.ship, purchase.hold);
  const sale = sellCargo({ manifest: loaded.manifest, gold: purchase.gold }, id, 1, "costera");
  assert.ok(sale);
  assert.equal(loaded.days, 45);
  assert.equal(withHold(loaded, sale.hold).days, 45);
});

test("S131: sea burn alone advances the voyage clock and whole-fleet daily charges", () => {
  const previous = GAME_TIME.gameSecondsPerDay;
  try {
    GAME_TIME.gameSecondsPerDay = 100;
    const captain = makeShip();
    const fleet = { captainId: captain.id, ships: [captain, { ...captain, id: "moored", sails: false, yardId: "puerto-casa" }] };
    const upkeep = fleetUpkeep(fleet);
    const gold = upkeep * 10;
    const initial = voyageClock({ supplyLeftS: supplySeconds(captain.days), upkeep, gold });
    assert.equal(initial.daysLeft, 45);
    assert.equal(initial.goldIn, 10);
    assert.equal(upkeep, captain.upkeep * 2);
    const partial = burnSupply(initial.secondsLeft, 50);
    assert.equal(partial.daysSpent, 0);
    assert.equal(voyageClock({ supplyLeftS: partial.secondsLeft, upkeep, gold }).daysLeft, 45);
    const burned = burnSupply(partial.secondsLeft, 150);
    assert.equal(burned.daysSpent, 2);
    const after = voyageClock({ supplyLeftS: burned.secondsLeft, upkeep, gold: gold - burned.daysSpent * upkeep });
    assert.equal(after.secondsLeft, initial.secondsLeft - 200);
    assert.equal(after.daysLeft, 43);
    assert.equal(after.goldIn, 8);
  } finally {
    GAME_TIME.gameSecondsPerDay = previous;
  }
});
