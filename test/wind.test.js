import test from "node:test";
import assert from "node:assert/strict";

import {
  WIND,
  compassPoint,
  normalizeAngle,
  windAt,
  windEffect,
  windForecast,
  windVector,
} from "../src/model/wind.js";

const SEED = 424242;

/* ---------------------------------------------------------------- S16 determinism */

test("S16: the same sea and moment always give the same wind", () => {
  const a = windAt(SEED, 37.5);
  const b = windAt(SEED, 37.5);
  assert.deepEqual(a, b);
});

test("S16: different seeds blow differently", () => {
  const a = windAt(1, 30);
  const b = windAt(2, 30);
  assert.notDeepEqual(a, b);
});

test("S16: the wind changes over time", () => {
  const early = windAt(SEED, 0);
  const later = windAt(SEED, 60);
  const changed =
    Math.abs(early.strengthKn - later.strengthKn) > 0.01 ||
    Math.abs(early.direction - later.direction) > 0.01;
  assert.ok(changed, "the wind must not be frozen for a whole voyage");
});

/* ---------------------------------------------------------------- S16 smoothness */

test("S16: the wind is continuous, never jumping between frames", () => {
  // Walk a full two minutes in 1/30 s steps and check no frame-to-frame jump.
  let previous = windAt(SEED, 0);
  for (let frame = 1; frame <= 120 * 30; frame += 1) {
    const now = windAt(SEED, frame / 30);
    const strengthJump = Math.abs(now.strengthKn - previous.strengthKn);
    // the shortest way round, so a wrap at 0/2PI is not mistaken for a jump
    const delta = Math.abs(((now.direction - previous.direction + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    assert.ok(strengthJump < 0.5, `strength jumped ${strengthJump} kn in one frame`);
    assert.ok(delta < 0.1, `direction jumped ${delta} rad in one frame`);
    previous = now;
  }
});

test("S16: the wind is continuous across control-point boundaries", () => {
  // Exactly at a segment edge the two neighbouring curves must agree.
  for (let segment = 0; segment < 5; segment += 1) {
    const edge = segment * WIND.segmentS;
    const before = windAt(SEED, edge - 0.001);
    const after = windAt(SEED, edge + 0.001);
    assert.ok(Math.abs(before.strengthKn - after.strengthKn) < 0.01);
    assert.ok(Math.abs(before.direction - after.direction) < 0.01);
  }
});

/* ---------------------------------------------------------------- S16 bounds */

test("S16: the wind never dies and never becomes a hurricane", () => {
  for (let t = 0; t < 3600; t += 7) {
    const wind = windAt(SEED, t);
    assert.ok(
      wind.strengthKn >= WIND.minStrengthKn - 1e-9,
      `strength ${wind.strengthKn} below the floor at ${t}s`,
    );
    assert.ok(
      wind.strengthKn <= WIND.maxStrengthKn + 1e-9,
      `strength ${wind.strengthKn} above the ceiling at ${t}s`,
    );
    assert.ok(wind.strength >= 0 && wind.strength <= 1);
  }
});

test("S16: the direction is always a real bearing", () => {
  for (let t = 0; t < 600; t += 3) {
    const { direction } = windAt(SEED, t);
    assert.ok(direction >= 0 && direction < Math.PI * 2);
  }
});

test("S16: a negative or nonsense time does not break the model", () => {
  for (const t of [-5, -1000, NaN, undefined, null]) {
    const wind = windAt(SEED, t);
    assert.ok(Number.isFinite(wind.direction));
    assert.ok(Number.isFinite(wind.strengthKn));
  }
});

/* ---------------------------------------------------------------- S18 forecast */

test("S18: the forecast is the wind 10 seconds later, exactly", () => {
  assert.equal(WIND.forecastS, 10);
  for (const t of [0, 5, 17.3, 120]) {
    assert.deepEqual(windForecast(SEED, t), windAt(SEED, t + 10));
  }
});

test("S18: the forecast is not the present, or it would be useless", () => {
  const now = windAt(SEED, 0);
  const soon = windForecast(SEED, 0);
  const differs =
    Math.abs(now.strengthKn - soon.strengthKn) > 1e-9 ||
    Math.abs(now.direction - soon.direction) > 1e-9;
  assert.ok(differs);
});

/* ---------------------------------------------------------------- S17 effect */

test("S17: a following wind speeds the ship up, a head wind slows it", () => {
  const wind = { direction: 0, strengthKn: 15, strength: 1 };
  const astern = windEffect(wind, 0); // ship pointing where the wind blows
  const ahead = windEffect(wind, Math.PI); // ship pointing into the wind
  const beam = windEffect(wind, Math.PI / 2); // wind on the beam

  assert.ok(astern.speedFactor > 1, "following wind must add speed");
  assert.ok(ahead.speedFactor < 1, "head wind must cost speed");
  assert.ok(Math.abs(beam.speedFactor - 1) < 1e-9, "beam wind is neutral for speed");
});

test("S17: the speed swing stays inside the declared limits", () => {
  const wind = { direction: 0, strengthKn: WIND.maxStrengthKn, strength: 1 };
  assert.ok(windEffect(wind, 0).speedFactor <= 1 + WIND.maxSpeedBonus + 1e-9);
  assert.ok(windEffect(wind, Math.PI).speedFactor >= 1 - WIND.maxSpeedPenalty - 1e-9);
});

test("S17: a calm wind barely moves the ship's speed", () => {
  const calm = { direction: 0, strengthKn: WIND.minStrengthKn, strength: 0 };
  assert.equal(windEffect(calm, 0).speedFactor, 1);
  assert.equal(windEffect(calm, Math.PI).speedFactor, 1);
});

test("S17: the sideways drift peaks with the wind on the beam", () => {
  const wind = { direction: 0, strengthKn: 20, strength: 1 };
  const astern = windEffect(wind, 0).driftFactor;
  const beam = windEffect(wind, Math.PI / 2).driftFactor;
  assert.ok(Math.abs(astern) < 1e-9, "no drift when running before the wind");
  assert.ok(beam > 0, "drift with the wind on the beam");
  assert.ok(beam <= WIND.driftFactor + 1e-9);
});

test("S17: a stronger wind drifts the hull harder", () => {
  const weak = windEffect({ direction: 0, strengthKn: 5, strength: 0.1 }, Math.PI / 2);
  const strong = windEffect({ direction: 0, strengthKn: 20, strength: 1 }, Math.PI / 2);
  assert.ok(strong.driftFactor > weak.driftFactor);
});

test("S17: the wind vector points the way the wind blows", () => {
  const wind = { direction: Math.PI / 2, strengthKn: 10, strength: 0.5 };
  const vector = windVector(wind);
  assert.ok(Math.abs(vector.x) < 1e-9);
  assert.ok(Math.abs(vector.y - 10) < 1e-9);
});

/* ---------------------------------------------------------------- helpers */

test("normalizeAngle wraps into [0, 2PI)", () => {
  assert.ok(Math.abs(normalizeAngle(-Math.PI / 2) - (Math.PI * 3) / 2) < 1e-9);
  assert.ok(Math.abs(normalizeAngle(Math.PI * 2 + 1) - 1) < 1e-9);
});

test("compassPoint names the cardinal sectors", () => {
  assert.equal(compassPoint(0), "E");
  assert.equal(compassPoint(Math.PI / 2), "S");
  assert.equal(compassPoint(Math.PI), "O");
  assert.equal(compassPoint((Math.PI * 3) / 2), "N");
});
