/**
 * The fleet sailing in formation (S36).
 *
 * The captain's ship is `world.ship`; every other marked hull is an escort that keeps
 * its own station relative to her. The rules that matter:
 *   - the formation is a set of offsets that rotate with the captain's heading;
 *   - an escort steers and accelerates towards its station, never teleports;
 *   - it stays on its station even if it falls behind, which is a real consequence.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ESCORT,
  createEscort,
  escortStation,
  formationOffset,
  stepEscort,
  stationsFor,
} from "../src/model/formation.js";
import {
  createWorld,
  deserializeWorld,
  serializeWorld,
  updateWorld,
} from "../src/model/world.js";

const captain = { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: 6 };

/* ---------------------------------------------------------------- the stations */

test("S36: the first escort rides astern of the captain", () => {
  const offset = formationOffset(0);
  // Heading 0 points east, so astern is west: negative x, no y.
  assert.ok(offset.x < 0, `the first station should be behind the captain, got x=${offset.x}`);
  assert.ok(Math.abs(offset.y) < 1e-9, `the first station should be on the centreline, got y=${offset.y}`);
});

test("S36: the second and third stations are on opposite beams", () => {
  const second = formationOffset(1);
  const third = formationOffset(2);
  assert.ok(Math.abs(second.y) > 0 && Math.abs(third.y) > 0, "both should be off the centreline");
  assert.equal(Math.sign(second.y), -Math.sign(third.y), "they must sit on opposite sides");
});

test("S36: no two escorts share a station", () => {
  const seen = new Set();
  for (let index = 0; index < 8; index += 1) {
    const offset = formationOffset(index);
    const key = `${Math.round(offset.x)},${Math.round(offset.y)}`;
    assert.ok(!seen.has(key), `two escorts share station ${key}`);
    seen.add(key);
  }
});

test("S36: the stations rotate with the captain's heading", () => {
  // Heading 0 points east and positive angles turn clockwise on screen, so PI/2 is
  // due south and astern of a southbound captain is north: negative y.
  const station = escortStation({ ...captain, heading: Math.PI / 2 }, 0);
  assert.ok(station.y < 0, `astern of a southbound ship should be north, got y=${station.y}`);
  assert.ok(Math.abs(station.x) < 1e-6, `the station should stay on the centreline, got x=${station.x}`);

  // And the opposite way round: northbound, astern is south, positive y.
  const north = escortStation({ ...captain, heading: -Math.PI / 2 }, 0);
  assert.ok(north.y > 0, `astern of a northbound ship should be south, got y=${north.y}`);
});

test("S36: a station is offset from the captain, not on top of her", () => {
  const station = escortStation({ ...captain, x: 500, y: -200 }, 1);
  const distance = Math.hypot(station.x - 500, station.y + 200);
  assert.ok(distance > 50, `the station sits on the captain (${distance} m)`);
});

test("S36: the stations a fleet of n escorts needs are exactly n", () => {
  assert.deepEqual(stationsFor(0), []);
  assert.equal(stationsFor(1).length, 1);
  assert.equal(stationsFor(4).length, 4);
});

/* ---------------------------------------------------------------- following */

test("S36: an escort steers towards its station", () => {
  // It cannot reverse: to reach a station dead astern it has to come about first,
  // so the proof is that it closes the gap over time, not within one tick.
  let escort = createEscort({ id: "a", speedKn: 6 }, { x: 0, y: 0, heading: 0 });
  // Well away from its own station, so it has to actually sail there.
  escort = { ...escort, x: 200, y: 200 };
  const station = { x: -100, y: 0 };
  const before = Math.hypot(escort.x - station.x, escort.y - station.y);
  let gotUnderWay = false;
  for (let i = 0; i < 300; i += 1) {
    escort = stepEscort(escort, station, { wind: null }, 0.1);
    if (escort.currentSpeedKn > 0) gotUnderWay = true;
  }
  const after = Math.hypot(escort.x - station.x, escort.y - station.y);
  assert.ok(after < before * 0.3, `the escort did not close on its station: ${before.toFixed(0)} -> ${after.toFixed(0)} m`);
  assert.ok(gotUnderWay, "the escort never got under way");
});

test("S36: an escort never jumps: one tick moves it a bounded distance", () => {
  const escort = createEscort({ id: "a", speedKn: 6 }, { x: 0, y: 0, heading: 0 });
  const far = { x: 5000, y: 0 };
  const next = stepEscort(escort, far, { wind: null }, 0.1);
  const moved = Math.hypot(next.x - escort.x, next.y - escort.y);
  assert.ok(moved < 100, `the escort jumped ${moved.toFixed(0)} m in one tick`);
});

test("S36: an escort on station and at rest stays put", () => {
  const escort = { ...createEscort({ id: "a", speedKn: 6 }, { x: 0, y: 0, heading: 0 }), x: 0, y: 0 };
  const next = stepEscort(escort, { x: 0, y: 0 }, { wind: null }, 1);
  assert.ok(Math.hypot(next.x, next.y) < 1e-6, "an escort on station drifted away");
});

test("S36: an escort turning towards its station does not spin past it", () => {
  let escort = createEscort({ id: "a", speedKn: 6 }, { x: 0, y: 0, heading: 0 });
  const station = { x: 0, y: -200 }; // straight north
  for (let i = 0; i < 400; i += 1) escort = stepEscort(escort, station, { wind: null }, 0.1);
  const distance = Math.hypot(escort.x - station.x, escort.y - station.y);
  assert.ok(distance < 120, `the escort never reached its station (${distance.toFixed(0)} m away)`);
});

test("S36: an escort keeps inside the world edge", () => {
  const escort = { ...createEscort({ id: "a", speedKn: 6 }, { x: 0, y: 0, heading: 0 }), x: 99_000, y: 0 };
  const next = stepEscort(escort, { x: 200_000, y: 0 }, { wind: null }, 1);
  assert.ok(Math.hypot(next.x, next.y) <= 99_000, "the escort left the sea");
});

test("S36: a broken escort or station never throws", () => {
  for (const broken of [undefined, null, {}, { x: "a", y: null }]) {
    assert.doesNotThrow(() => stepEscort(broken, broken, { wind: null }, 0.1));
    assert.doesNotThrow(() => stepEscort(createEscort({ id: "a" }), broken, { wind: null }, 0.1));
  }
});

/* ---------------------------------------------------------------- the world */

test("S36: a new world has no escorts until the fleet says so", () => {
  const world = createWorld(1, { speedKn: 6 }, 0);
  assert.deepEqual(world.escorts, []);
});

test("S36: escorts follow the captain through updateWorld", () => {
  const world = createWorld(7, { speedKn: 6 }, 0);
  world.escorts = [createEscort({ id: "a", speedKn: 6 }, world.ship, 0)];
  let next = world;
  for (let i = 0; i < 200; i += 1) next = updateWorld(next, { throttle: 1 }, 0.1);
  const escort = next.escorts[0];
  const station = escortStation(next.ship, 0);
  const distance = Math.hypot(escort.x - station.x, escort.y - station.y);
  assert.ok(distance < 150, `the escort did not hold station (${distance.toFixed(0)} m away)`);
  assert.ok(distance > 0, "the escort sat exactly on its station");
});

test("S36: escorts survive the autosave round trip", () => {
  const world = createWorld(3, { speedKn: 6 }, 0);
  world.escorts = [
    { ...createEscort({ id: "a", speedKn: 6 }, world.ship), x: 300, y: 40, heading: 1, currentSpeedKn: 4 },
  ];
  const back = deserializeWorld(serializeWorld(world));
  assert.equal(back.escorts.length, 1);
  assert.equal(back.escorts[0].id, "a");
  assert.ok(Math.abs(back.escorts[0].x - 300) < 1e-6);
});

test("S39: a save from before this feature opens with no escorts", () => {
  const world = createWorld(3, { speedKn: 6 }, 0);
  const old = JSON.parse(serializeWorld(world));
  delete old.escorts;
  const back = deserializeWorld(JSON.stringify(old));
  assert.deepEqual(back.escorts, []);
});

test("S36: the escort tuning is declared, not scattered", () => {
  assert.ok(ESCORT.stationM > 0, "the station distance must be positive");
  assert.ok(ESCORT.catchUpSpeed > 1, "an escort needs a way to catch up");
});
