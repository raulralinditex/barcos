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
  damagedShips,
  needsRepair,
  damageShare,
  repairCost,
  shipValue,
  repairFleetShip,
  repairReport,
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

test("S22/S40: repairing a damaged ship restores hull, rigging and crew and charges its share", () => {
  const hurt = {
    ...ship(),
    condition: { hull: 35, rigging: 58, crew: 70, morale: 40 },
    crewAlive: { marino: 6, artillero: 2, soldado: 2 },
  };
  const purse = 5000;

  const result = repairShip(hurt, purse);

  assert.equal(result.repaired, true);
  assert.equal(result.spent, repairCost(hurt));
  assert.equal(result.gold, purse - repairCost(hurt));
  assert.deepEqual(result.ship.condition, { hull: 100, rigging: 100, crew: 100, morale: 100 });
  assert.deepEqual(result.ship.crewAlive, hurt.crew);
  // the rest of the hull is untouched: repairing is not a rebuild
  assert.equal(result.ship.id, hurt.id);
  assert.equal(result.ship.paidGold, hurt.paidGold);
  assert.deepEqual(result.ship.batteries, hurt.batteries);
});

test("S40: the cost is proportional to the damage", () => {
  const wrecked = { ...ship(), condition: { hull: 0, rigging: 0, crew: 0, morale: 0 } };
  const half = { ...ship(), condition: { hull: 50, rigging: 50, crew: 50, morale: 50 } };
  const scratched = { ...ship(), condition: { hull: 96, rigging: 100, crew: 100, morale: 100 } };

  assert.ok(repairCost(wrecked) > repairCost(half), "a wreck must cost more than a half-wreck");
  assert.ok(repairCost(half) > repairCost(scratched), "half damage must cost more than a scratch");
  // The worst segment decides: one shredded segment is enough to need the whole job.
  assert.equal(repairCost(wrecked), Math.round(wrecked.paidGold * REPAIR.shareOfPrice));
});

test("S40: a full repair costs a declared share of the hull's value, 20 % by default", () => {
  assert.equal(REPAIR.shareOfPrice, 0.2);
  const wrecked = { ...ship(), paidGold: 5_000, condition: { hull: 0, rigging: 0, crew: 0, morale: 0 } };
  assert.equal(repairCost(wrecked), 1_000, "20 % of a 5,000 hull");
});

test("S40: the cost follows the value of the hull, not the size of the damage alone", () => {
  const damage = { hull: 50, rigging: 100, crew: 100, morale: 100 };
  const cheap = repairCost({ ...ship(), paidGold: 1_000, condition: damage });
  const dear = repairCost({ ...ship(), paidGold: 10_000, condition: damage });
  assert.equal(dear, cheap * 10, `a ten times dearer hull should cost ten times more (${cheap} vs ${dear})`);
});

test("S40: a hull with no recorded price falls back to its hull price instead of charging nothing", () => {
  const wrecked = { ...ship(), paidGold: 0, condition: { hull: 0, rigging: 0, crew: 0, morale: 0 } };
  assert.ok(repairCost(wrecked) > 0, "an old save must still quote a repair");
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

test("S45: the captain spends half the cost to repair half of every missing segment", () => {
  const hurt = {
    ...ship(), paidGold: 1000,
    condition: { hull: 20, rigging: 40, crew: 60, morale: 80 },
    crewAlive: { marino: 5, artillero: 1, soldado: 3 },
  };
  const cost = repairCost(hurt);
  assert.equal(cost, 160);
  const result = repairShip(hurt, cost / 2);
  assert.equal(result.repaired, true);
  assert.equal(result.partial, true);
  assert.equal(result.fraction, 0.5);
  assert.equal(result.spent, 80);
  assert.equal(result.gold, 0);
  assert.equal(result.missing, 80);
  assert.deepEqual(result.ship.condition, { hull: 60, rigging: 70, crew: 80, morale: 90 });
  assert.deepEqual(result.ship.crewAlive, { marino: 9, artillero: 3, soldado: 5 });
  assert.deepEqual(hurt.condition, { hull: 20, rigging: 40, crew: 60, morale: 80 });
});

test("S45: zero or invalid gold spends nothing and leaves the captain unchanged", () => {
  const hurt = { ...ship(), paidGold: 1000, condition: { hull: 20, rigging: 40, crew: 60, morale: 80 } };
  for (const gold of [0, -50, NaN, undefined]) {
    const result = repairShip(hurt, gold);
    assert.equal(result.repaired, false);
    assert.equal(result.reason, "unaffordable");
    assert.equal(result.spent, 0);
    assert.equal(result.gold, 0);
    assert.equal(result.missing, repairCost(hurt));
    assert.deepEqual(result.ship, hurt);
  }
});

test("S45: proportional crew replenishment rounds to whole men and caps at the bought complement", () => {
  const hurt = {
    ...ship(), paidGold: 1000,
    condition: { hull: 0, rigging: 50, crew: 50, morale: 100 },
    crewAlive: { marino: 11, artillero: 8, soldado: 1 },
  };
  const result = repairShip(hurt, 50);
  assert.equal(result.fraction, 0.25);
  assert.deepEqual(result.ship.condition, { hull: 25, rigging: 62.5, crew: 62.5, morale: 100 });
  assert.deepEqual(result.ship.crewAlive, { marino: 11, artillero: 4, soldado: 2 });
  assert.equal(result.gold, 0);
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

test("S24: repairing one fleet ship touches only that hull and charges its share once", () => {
  const { fleet, captain, hurt, sound } = fleetOfThree();
  const purse = 5000;
  const expected = repairCost(hurt);

  const result = repairFleetShip(fleet, hurt.id, purse);

  assert.equal(result.repaired, true);
  assert.equal(result.reason, "repaired");
  assert.equal(result.spent, expected);
  assert.equal(result.gold, purse - expected);

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

test("S45: a fleet ship is partially repaired, persisted and charged only the available gold", () => {
  const { fleet, hurt, captain, sound } = fleetOfThree();
  const cost = repairCost(hurt);
  const purse = cost / 2;
  const result = repairFleetShip(fleet, hurt.id, purse);
  assert.equal(result.repaired, true);
  assert.equal(result.partial, true);
  assert.equal(result.fraction, 0.5);
  assert.equal(result.spent, purse);
  assert.equal(result.gold, 0);
  assert.equal(result.missing, cost - purse);
  const reopened = deserializeFleet(serializeFleet(result.fleet));
  const fixed = reopened.ships.find((entry) => entry.id === hurt.id);
  assert.deepEqual(fixed.condition, { hull: 72.5, rigging: 75, crew: 80, morale: 85 });
  assert.deepEqual(fixed.crewAlive, { marino: 9, artillero: 3, soldado: 5 });
  assert.deepEqual(result.fleet.ships.find((entry) => entry.id === captain.id), captain);
  assert.deepEqual(result.fleet.ships.find((entry) => entry.id === sound.id), sound);
  assert.deepEqual(fleet.ships.find((entry) => entry.id === hurt.id), hurt);
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

/* ---------------------------------------------------------------- S25 the dock dialog */

test("S25: the report lists only the damaged segments, the men and the flat fee", () => {
  const hurt = {
    ...ship(),
    condition: { hull: 42, rigging: 100, crew: 60, morale: 100 },
    crewAlive: { marino: 6, artillero: 2, soldado: 3 },
  };

  const report = repairReport(hurt);

  assert.deepEqual(report.damaged, ["hull", "crew"]);
  assert.equal(report.hull, 42);
  assert.equal(report.rigging, 100);
  assert.equal(report.crew, 60);
  assert.equal(report.crewAlive, 11, "the survivors are counted as men, not as a share");
  assert.equal(report.crewBought, 22);
  assert.equal(report.cost, repairCost(hurt), "the dialog shows the proportional fee of S40");
});

test("S25: a sound ship has nothing to list and costs nothing", () => {
  const report = repairReport(ship());

  assert.deepEqual(report.damaged, []);
  assert.equal(report.cost, 0);
  assert.equal(report.hull, 100);
  assert.equal(report.rigging, 100);
  assert.equal(report.crew, 100);
});

test("S25: the dialog list holds the captain and the damaged hulls, never a sound one", () => {
  const { fleet, captain, hurt } = fleetOfThree();

  assert.deepEqual(damagedShips(fleet).map((s) => s.id), [captain.id, hurt.id]);
  // the port list of S24 is untouched: it still leaves the captain to the R key
  assert.deepEqual(damagedFleetShips(fleet).map((s) => s.id), [hurt.id]);
});

test("S25: the shipyard repairs the captain through the fleet entry and leaves the rest alone", () => {
  const { fleet, captain, hurt, sound } = fleetOfThree();
  const purse = 5000;

  // by default the captain is still refused, exactly as S24 shipped it
  const refused = repairFleetShip(fleet, captain.id, purse);
  assert.equal(refused.repaired, false);
  assert.equal(refused.reason, "captain");
  assert.equal(refused.gold, purse);
  assert.deepEqual(refused.fleet, fleet);

  const result = repairFleetShip(fleet, captain.id, purse, { allowCaptain: true });
  assert.equal(result.repaired, true);
  assert.equal(result.reason, "repaired");
  assert.equal(result.spent, repairCost(captain));
  assert.equal(result.gold, purse - result.spent);

  const repaired = result.fleet.ships.find((s) => s.id === captain.id);
  assert.deepEqual(repaired.condition, { hull: 100, rigging: 100, crew: 100, morale: 100 });
  assert.deepEqual(repaired.crewAlive, captain.crew);
  assert.deepEqual(result.fleet.ships.find((s) => s.id === hurt.id), hurt, "another hull changed");
  assert.deepEqual(result.fleet.ships.find((s) => s.id === sound.id), sound, "a sound hull changed");
  assert.equal(result.fleet.captainId, fleet.captainId);
});

test("S45: the shipyard partially repairs and persists the captain with its purse", () => {
  const { fleet, captain, hurt } = fleetOfThree();
  const cost = repairCost(captain);
  const purse = cost / 2;
  const result = repairFleetShip(fleet, captain.id, purse, { allowCaptain: true });
  assert.equal(result.repaired, true);
  assert.equal(result.partial, true);
  assert.equal(result.fraction, 0.5);
  assert.equal(result.spent, purse);
  assert.equal(result.missing, cost - purse);
  assert.equal(result.gold, 0);
  const reopened = deserializeFleet(serializeFleet(result.fleet));
  assert.deepEqual(captainShip(reopened).condition, { hull: 90, rigging: 100, crew: 100, morale: 100 });
  assert.deepEqual(result.fleet.ships.find((entry) => entry.id === hurt.id), hurt);
  assert.deepEqual(reopened.ships.find((entry) => entry.id === hurt.id).condition, hurt.condition);
  assert.deepEqual(captainShip(fleet), captain);
});
