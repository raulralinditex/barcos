import test from "node:test";
import assert from "node:assert/strict";

import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import {
  addShip,
  captainShip,
  deserializeFleet,
  serializeFleet,
  setCaptain,
  withShipCondition,
} from "../src/model/fleet.js";
import {
  REPAIR,
  damagedFleetShips,
  needsRepair,
  repairCost,
  repairFee,
  repairFleetShip,
  repairShip,
} from "../src/model/repair.js";

const ship = (overrides = {}) =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "zabra",
        batteries: [
          { pieceId: "falconete", qty: 3, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
          { pieceId: "falconete", qty: 3, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
        ],
        crew: { marino: 12, artillero: 4, soldado: 6 },
        days: 30,
        cargoKg: 0,
        ballastKg: 0,
        equipmentKg: 0,
        reserveKg: 0,
      },
      12000,
    ),
    { name: "Zabra" },
  );

const empty = () => ({ ships: [], captainId: null });

/* ---------------------------------------------------------------- S23 condition lives on the ship */

test("S23: a shipyard ship carries its own condition and the crew that is alive", () => {
  const runtime = ship();
  assert.deepEqual(runtime.condition, { hull: 100, rigging: 100, crew: 100, morale: 100 });
  assert.deepEqual(runtime.crewAlive, { marino: 12, artillero: 4, soldado: 6 });
});

test("S23: damage survives a round trip through the fleet save", () => {
  let fleet = addShip(empty(), ship());
  const id = captainShip(fleet).id;

  fleet = withShipCondition(fleet, id, {
    condition: { hull: 42, rigging: 61, crew: 73, morale: 90 },
    crewAlive: { marino: 9, artillero: 3, soldado: 4 },
  });

  const reopened = deserializeFleet(serializeFleet(fleet));
  const back = captainShip(reopened);
  assert.deepEqual(back.condition, { hull: 42, rigging: 61, crew: 73, morale: 90 });
  assert.deepEqual(back.crewAlive, { marino: 9, artillero: 3, soldado: 4 });
});

test("S23: the damage stays with its own hull when the player changes captain", () => {
  let fleet = addShip(addShip(empty(), ship()), ship());
  const [first, second] = fleet.ships;

  fleet = withShipCondition(fleet, first.id, {
    condition: { hull: 30, rigging: 100, crew: 100, morale: 100 },
    crewAlive: first.crew,
  });
  fleet = setCaptain(fleet, second.id);

  const reopened = deserializeFleet(serializeFleet(fleet));
  const hurt = reopened.ships.find((s) => s.id === first.id);
  const fresh = reopened.ships.find((s) => s.id === second.id);
  assert.equal(hurt.condition.hull, 30);
  assert.equal(fresh.condition.hull, 100);
});

test("S23: a fleet saved before the condition lived on the ship still opens", () => {
  const legacy = ship();
  delete legacy.condition;
  delete legacy.crewAlive;

  const reopened = deserializeFleet(
    JSON.stringify({ v: 1, ships: [legacy], captainId: legacy.id }),
  );
  const back = captainShip(reopened);
  assert.deepEqual(back.condition, { hull: 100, rigging: 100, crew: 100, morale: 100 });
  assert.deepEqual(back.crewAlive, { marino: 12, artillero: 4, soldado: 6 });
});

test("S23: an unknown ship id leaves the fleet untouched", () => {
  const fleet = addShip(empty(), ship());
  const same = withShipCondition(fleet, "ship-nope", {
    condition: { hull: 1, rigging: 1, crew: 1, morale: 1 },
    crewAlive: {},
  });
  assert.deepEqual(same.ships[0].condition, { hull: 100, rigging: 100, crew: 100, morale: 100 });
});

/* ---------------------------------------------------------------- S22 repair at the home port */

test("S22: repairing a damaged ship restores hull, rigging and crew and charges the flat fee", () => {
  const hurt = {
    ...ship(),
    condition: { hull: 35, rigging: 58, crew: 70, morale: 40 },
    crewAlive: { marino: 6, artillero: 2, soldado: 2 },
  };
  const purse = 5000;

  const result = repairShip(hurt, purse);

  assert.equal(result.repaired, true);
  assert.equal(result.spent, repairFee());
  assert.equal(result.gold, purse - repairFee());
  assert.deepEqual(result.ship.condition, { hull: 100, rigging: 100, crew: 100, morale: 100 });
  assert.deepEqual(result.ship.crewAlive, hurt.crew);
  // the rest of the hull is untouched: repairing is not a rebuild
  assert.equal(result.ship.id, hurt.id);
  assert.equal(result.ship.paidGold, hurt.paidGold);
  assert.deepEqual(result.ship.batteries, hurt.batteries);
});

test("S22: the fee is flat, so a wrecked hull and a scratched one pay the same", () => {
  const wrecked = { ...ship(), condition: { hull: 5, rigging: 10, crew: 41, morale: 0 } };
  const scratched = { ...ship(), condition: { hull: 96, rigging: 100, crew: 100, morale: 100 } };

  assert.equal(repairCost(wrecked), repairCost(scratched));
  assert.equal(repairCost(wrecked), REPAIR.fee);
});

test("S22: an undamaged ship needs no repair and pays nothing", () => {
  const sound = ship();
  assert.equal(needsRepair(sound), false);
  assert.equal(repairCost(sound), 0);

  const result = repairShip(sound, 5000);
  assert.equal(result.repaired, false);
  assert.equal(result.spent, 0);
  assert.equal(result.gold, 5000);
  assert.equal(result.reason, "no-damage");
});

test("S22: without enough gold nothing changes and the player is told why", () => {
  const hurt = { ...ship(), condition: { hull: 50, rigging: 50, crew: 50, morale: 50 } };
  const result = repairShip(hurt, REPAIR.fee - 1);

  assert.equal(result.repaired, false);
  assert.equal(result.reason, "unaffordable");
  assert.equal(result.spent, 0);
  assert.equal(result.gold, REPAIR.fee - 1);
  assert.deepEqual(result.ship.condition, hurt.condition);
  assert.equal(result.missing, 1);
});

test("S22: repairing restores the bought crew, not the survivors", () => {
  const hurt = {
    ...ship(),
    condition: { hull: 80, rigging: 80, crew: 25, morale: 50 },
    crewAlive: { marino: 3, artillero: 1, soldado: 1 },
  };
  const result = repairShip(hurt, 5000);
  assert.deepEqual(result.ship.crewAlive, hurt.crew);
  assert.equal(result.ship.condition.crew, 100);
});

/* ---------------------------------------------------------------- S24 repairing the rest of the fleet */

const hurtShip = (overrides = {}) => ({
  ...ship(),
  condition: { hull: 45, rigging: 50, crew: 60, morale: 70 },
  crewAlive: { marino: 5, artillero: 2, soldado: 3 },
  ...overrides,
});

/** Captain plus two other hulls, each with its own id and its own damage. */
function fleetOfThree() {
  let fleet = empty();
  const captain = hurtShip({ condition: { hull: 80, rigging: 100, crew: 100, morale: 100 } });
  const hurt = hurtShip();
  const sound = ship();
  fleet = addShip(fleet, captain);
  fleet = { ...fleet, ships: [...fleet.ships, hurt, sound], captainId: captain.id };
  return { fleet, captain, hurt, sound };
}

test("S24: the port list holds only the damaged ships that are not the captain", () => {
  const { fleet, hurt } = fleetOfThree();
  const listed = damagedFleetShips(fleet).map((s) => s.id);

  assert.deepEqual(listed, [hurt.id]);
  assert.equal(
    damagedFleetShips(fleet).some((s) => s.id === fleet.captainId),
    false,
    "the captain is repaired with R, not from the fleet list",
  );
});

test("S24: repairing one fleet ship touches only that hull and charges the flat fee once", () => {
  const { fleet, captain, hurt, sound } = fleetOfThree();
  const purse = 5000;

  const result = repairFleetShip(fleet, hurt.id, purse);

  assert.equal(result.repaired, true);
  assert.equal(result.reason, "repaired");
  assert.equal(result.spent, REPAIR.fee);
  assert.equal(result.gold, purse - REPAIR.fee);

  const repaired = result.fleet.ships.find((s) => s.id === hurt.id);
  assert.deepEqual(repaired.condition, { hull: 100, rigging: 100, crew: 100, morale: 100 });
  assert.deepEqual(repaired.crewAlive, hurt.crew);

  // the captain and the other hulls are exactly what they were
  assert.deepEqual(
    result.fleet.ships.find((s) => s.id === captain.id),
    captain,
    "the captain was touched by a fleet repair",
  );
  assert.deepEqual(
    result.fleet.ships.find((s) => s.id === sound.id),
    sound,
    "an untouched ship changed",
  );
  assert.equal(result.fleet.captainId, fleet.captainId);
  assert.equal(result.fleet.ships.length, 3);
});

test("S24: without enough gold the fleet repair changes nothing and reports the missing gold", () => {
  const { fleet, hurt } = fleetOfThree();
  const purse = REPAIR.fee - 30;

  const result = repairFleetShip(fleet, hurt.id, purse);

  assert.equal(result.repaired, false);
  assert.equal(result.reason, "unaffordable");
  assert.equal(result.spent, 0);
  assert.equal(result.gold, purse);
  assert.equal(result.missing, 30);
  assert.deepEqual(result.fleet, fleet, "an unaffordable repair changed the fleet");
});

test("S24: a sound fleet ship pays nothing", () => {
  const { fleet, sound } = fleetOfThree();

  const result = repairFleetShip(fleet, sound.id, 5000);

  assert.equal(result.repaired, false);
  assert.equal(result.reason, "no-damage");
  assert.equal(result.spent, 0);
  assert.equal(result.gold, 5000);
  assert.deepEqual(result.fleet, fleet);
});

test("S24: an unknown ship id changes neither the fleet nor the purse", () => {
  const { fleet } = fleetOfThree();

  const result = repairFleetShip(fleet, "ship-nope", 5000);

  assert.equal(result.repaired, false);
  assert.equal(result.spent, 0);
  assert.equal(result.gold, 5000);
  assert.deepEqual(result.fleet, fleet);
});

test("S24: the captain is not repaired through the fleet entry", () => {
  const { fleet, captain } = fleetOfThree();

  const result = repairFleetShip(fleet, captain.id, 5000);

  assert.equal(result.repaired, false);
  assert.equal(result.spent, 0);
  assert.equal(result.gold, 5000);
  assert.deepEqual(result.fleet, fleet);
});
