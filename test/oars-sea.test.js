/**
 * S159-A/B/D/E/F: the oars reach the sea.
 *
 * The model already knew how fast a hull rows, how the effort is spent and how much the
 * oars sharpen the helm; what it never got was the record that says so. `stepHull` reads
 * `input.oars`, `stepEscort` reads `input.oars`, and `updateWorld` was passing neither, so
 * every hull in the real game sailed with `oarKn = 0` and the fatigue never happened.
 *
 * These tests pin the wiring through the public sea functions: the effort per hull lives
 * in `world.oarEffort`, it advances with the step, and it reaches the physics.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createWorld, updateWorld, serializeWorld, deserializeWorld } from "../src/model/world.js";
import { OARS } from "../src/model/oars.js";
import { toRuntimeShip } from "../src/model/shipyard.js";
import { buildShip } from "../src/model/shipyard.js";

/** A hull with banks of oars, built through the real shipyard so the fields are real. */
const galleass = (over = {}) =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "galeaza",
        batteries: [{ pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 10, ammoId: "bala-hierro" }],
        crew: { marino: 40, artillero: 8, soldado: 20, remero: 300 },
        days: 45,
        cargoKg: 0,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
        ...over,
      },
      40000,
    ),
    { name: "Galeaza" },
  );

/**
 * A wind dead ahead. The sea always starts her captain on heading 0 and this file never turns
 * the helm, so a wind blowing towards -x meets her bow-on. It is built here and not from
 * `ship.heading`, which a runtime hull does not carry.
 */
const HEAD_WIND = { direction: Math.PI, strengthKn: 20 };

/** A hull with no banks: she must behave exactly as she did before the rule existed. */
const patache = () =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "gran-galeon",
        batteries: [{ pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 10, ammoId: "bala-hierro" }],
        crew: { marino: 60, artillero: 12, soldado: 30 },
        days: 45,
        cargoKg: 0,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      40000,
    ),
    { name: "Galeón" },
  );

const sea = (ship) => {
  const world = createWorld(7, ship, 0, null);
  return { ...world, encounters: [], ship: { ...world.ship, currentSpeedKn: 0 } };
};

test("S159-A: a hull with banks makes way under her oars when the sail alone is slower", () => {
  const ship = galleass();
  // A wind from dead ahead: the sail factor is at its worst, so the oars are the faster way.
  const headWind = HEAD_WIND;
  let world = sea(ship);
  for (let i = 0; i < 60; i += 1) {
    world = updateWorld(world, { throttle: 1, turn: 0, wind: headWind }, 1);
  }
  assert.ok(
    world.ship.currentSpeedKn > 0.5,
    `a galleass must still make way against a head wind, she made ${world.ship.currentSpeedKn} kn`,
  );
});

test("S159-A: a hull with no banks gains nothing from the oars", () => {
  const ship = patache();
  const headWind = HEAD_WIND;
  let withOars = sea(ship);
  let withoutOars = sea(ship);
  for (let i = 0; i < 60; i += 1) {
    withOars = updateWorld(withOars, { throttle: 1, turn: 0, wind: headWind }, 1);
    withoutOars = updateWorld({ ...withoutOars, oarEffort: {} }, { throttle: 1, turn: 0, wind: headWind }, 1);
  }
  assert.ok(
    Math.abs(withOars.ship.currentSpeedKn - withoutOars.ship.currentSpeedKn) < 1e-9,
    `a hull with no banks must sail the same with or without an effort record: ${withOars.ship.currentSpeedKn} vs ${withoutOars.ship.currentSpeedKn}`,
  );
});

test("S159-D: the effort falls while rowing and comes back while resting", () => {
  const ship = galleass();
  const headWind = HEAD_WIND;
  let world = sea(ship);
  assert.equal(world.oarEffort?.[ship.id] ?? 1, 1, "a fresh crew starts at full effort");

  // Rowing into the wind: the effort must fall.
  for (let i = 0; i < Math.ceil(OARS.sprintS); i += 1) {
    world = updateWorld(world, { throttle: 1, turn: 0, wind: headWind }, 1);
  }
  const spent = world.oarEffort[ship.id];
  assert.ok(spent < 1, `a crew that rowed for ${OARS.sprintS}s must be tired, effort is ${spent}`);
  assert.ok(spent > 0, `the effort must not reach zero in one sprint, it is ${spent}`);

  // With a fair wind the sail alone carries her, so the crew rests and the effort comes
  // back. The wind is built from the world's own heading: the hull has been sailing for
  // ninety seconds and her bow is not where it started.
  const fairWind = { direction: world.ship.heading, strengthKn: 12 };
  for (let i = 0; i < Math.ceil(OARS.recoverS) + 20; i += 1) {
    world = updateWorld(world, { throttle: 1, turn: 0, wind: fairWind }, 1);
  }
  assert.ok(
    world.oarEffort[ship.id] > spent,
    `a resting crew must recover, ${spent} -> ${world.oarEffort[ship.id]}`,
  );
});

test("S159-D: the effort of every crew survives the autosave", () => {
  const ship = galleass();
  const headWind = HEAD_WIND;
  let world = sea(ship);
  for (let i = 0; i < 30; i += 1) {
    world = updateWorld(world, { throttle: 1, turn: 0, wind: headWind }, 1);
  }
  assert.ok(world.oarEffort?.[ship.id] !== undefined, "the crew must have an effort on record to save");
  const back = deserializeWorld(serializeWorld(world));
  assert.ok(back, "a sea save must load");
  assert.deepEqual(back.oarEffort, world.oarEffort, "the effort of every crew must survive the save");
});

test("S159-I: an old save with no effort record opens with rested crews and sails as before", () => {
  const ship = patache();
  const world = sea(ship);
  const saved = JSON.parse(serializeWorld(world));
  delete saved.oarEffort;
  const back = deserializeWorld(JSON.stringify(saved));
  assert.ok(back, "a save written before the rule must still load");
  assert.deepEqual(back.oarEffort, {}, "a missing record is every crew fresh, not a crash");
  // And she sails: the first step moves her.
  const next = updateWorld(back, { throttle: 1, turn: 0 }, 1);
  assert.ok(next.ship.x !== back.ship.x || next.ship.y !== back.ship.y, "the hull must still sail");
});

test("S159-E: the sea publishes what the captain's oars are doing, and nothing for a hull without banks", () => {
  const withBanks = sea(galleass());
  const stepped = updateWorld(withBanks, { throttle: 1, turn: 0, wind: HEAD_WIND }, 1);
  assert.ok(stepped.oarReading, "a hull with banks must publish her oar reading");
  assert.equal(typeof stepped.oarReading.rowing, "boolean", "the reading says whether the oars are pulling");
  assert.ok(stepped.oarReading.speedKn > 0, `the reading says how fast the oars pull, got ${stepped.oarReading.speedKn}`);

  // A hull with no banks publishes nothing: the HUD has no row to fill (S159-H).
  const without = updateWorld(sea(patache()), { throttle: 1, turn: 0, wind: HEAD_WIND }, 1);
  assert.equal(without.oarReading, null, "a hull with no banks must publish no oar reading");
});

test("S159-A: an escort with banks rows too, not only the captain", () => {
  // The player's squadron is the captain plus her escorts, and both hulls make way under the
  // same physics. An escort used to be built without her hull or her crew, so a hull with
  // banks rowed nothing at all while her captain rowed fine.
  const captain = galleass();
  const escort = galleass();
  const world = createWorld(
    11,
    captain,
    0,
    {
      captainId: captain.id,
      ships: [
        { ...captain, commandId: captain.id, yardId: null },
        { ...escort, commandId: captain.id, yardId: null },
      ],
    },
  );
  assert.equal(world.escorts.length, 1, "the escort must be afloat");
  const stepped = updateWorld({ ...world, encounters: [] }, { throttle: 1, turn: 0, wind: HEAD_WIND }, 1);
  assert.ok(
    stepped.oarEffort?.[escort.id] !== undefined,
    `the escort's crew must have an effort on record, got ${JSON.stringify(stepped.oarEffort)}`,
  );
});

test("S159-D: the effort record follows the hull, so a hull that leaves takes her row with her", () => {
  // A prize joins the squadron and later goes down, or a hull is sold in a yard. Nobody
  // pruned the map: measured, forty prizes through one voyage left forty-one entries for the
  // one hull still afloat, and the sea save carried all of them forever.
  let world = sea(galleass());
  const captainId = world.ship.id;
  const seen = [];
  for (let i = 0; i < 5; i += 1) {
    const prize = galleass();
    seen.push(prize.id);
    world = {
      ...world,
      escorts: [
        {
          id: prize.id,
          x: 100,
          y: 100,
          heading: 0,
          currentSpeedKn: 0,
          speedKn: prize.speedKn,
          hullId: prize.hullId,
          loadFraction: 0.1,
          crew: { marino: 40, remero: 300 },
        },
      ],
    };
    world = updateWorld(world, { throttle: 1, turn: 0, wind: HEAD_WIND }, 1);
    // She leaves the squadron: nothing else about her is kept anywhere either.
    world = { ...world, escorts: [] };
    world = updateWorld(world, { throttle: 1, turn: 0, wind: HEAD_WIND }, 1);
  }
  assert.deepEqual(
    Object.keys(world.oarEffort ?? {}),
    [captainId],
    `only the hull still afloat must keep an effort record, got ${JSON.stringify(Object.keys(world.oarEffort ?? {}))}`,
  );
  // And the effort of the hull that IS afloat survives: the pruning must not reset the crew.
  assert.ok(world.oarEffort[captainId] < 1, `the captain's own effort must survive, it is ${world.oarEffort[captainId]}`);
});
