import test from "node:test";
import assert from "node:assert/strict";

import {
  WIND,
  compassPoint,
  normalizeAngle,
  windAt,
  windEffect,
  windForecast,
  windTargetOfDay,
  windVector,
} from "../src/model/wind.js";
import { GAME_TIME } from "../src/model/game-time.js";

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
  // Exactly at a day's edge the two neighbouring curves must agree (S146: the control
  // points are one game day apart, not one `segmentS`).
  const day = GAME_TIME.gameSecondsPerDay;
  for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
    const edge = dayIndex * day;
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

/* ---------------------------------------------------------------- S146: the wind turns once a day */

const degreesBetween = (a, b) => {
  const delta = Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return (delta * 180) / Math.PI;
};

test("S146: the wind no longer carries a segment of its own", () => {
  // "eliminamos el valor de cambio de viento": a day is the unit, and the day already has
  // an owner on the settings screen (`time.gameSecondsPerDay`). One number, one owner.
  assert.equal(WIND.segmentS, undefined, "the wind must not keep a segment length of its own");
});

test("S146: the day's target is the wind the day is closing on", () => {
  const day = GAME_TIME.gameSecondsPerDay;
  for (const dayIndex of [0, 1, 7]) {
    const start = dayIndex * day;
    const target = windTargetOfDay(SEED, start);
    assert.equal(target.day, dayIndex, `the target of day ${dayIndex} must be that day`);
    // At the end of the day the wind has arrived at the target it was given.
    const end = windAt(SEED, start + day * 0.999);
    assert.ok(
      degreesBetween(end.direction, target.direction) < 1,
      `day ${dayIndex}: the wind must arrive at its target, off by ${degreesBetween(end.direction, target.direction).toFixed(2)}°`,
    );
  }
});

test("S146: across the day the wind drifts towards the target, it does not jump", () => {
  // "durante el dia va cambiando lentamente acercandose a ese valor": the distance to the
  // day's target must shrink as the day goes on, and never grow.
  const day = GAME_TIME.gameSecondsPerDay;
  const target = windTargetOfDay(SEED, 0).direction;
  let previous = degreesBetween(windAt(SEED, 0).direction, target);
  for (let step = 1; step <= 20; step += 1) {
    const distance = degreesBetween(windAt(SEED, (step / 20) * day).direction, target);
    assert.ok(
      distance <= previous + 1e-9,
      `the wind must close on the target: step ${step} went from ${previous.toFixed(2)}° to ${distance.toFixed(2)}°`,
    );
    previous = distance;
  }
  assert.ok(previous < 1, `by the end of the day the wind must be at its target, off by ${previous.toFixed(2)}°`);
});

test("S146: a new day leaves from where the last one ended", () => {
  // No midnight jump: the wind at the last instant of a day and the first instant of the
  // next are the same wind, which is what makes the change a drift instead of a snap.
  const day = GAME_TIME.gameSecondsPerDay;
  for (const dayIndex of [0, 1, 2, 5]) {
    const end = windAt(SEED, (dayIndex + 1) * day - 0.001);
    const start = windAt(SEED, (dayIndex + 1) * day + 0.001);
    assert.ok(
      degreesBetween(end.direction, start.direction) < 0.01,
      `day ${dayIndex + 1} must start where day ${dayIndex} ended`,
    );
    assert.ok(Math.abs(end.strengthKn - start.strengthKn) < 0.01, "the strength must not jump either");
  }
});

test("S146: the length of a day is the setting's, read live", () => {
  // The player asked for the change to happen "una vez al dia de juego(segundos
  // configurables)": moving the day on the screen must move the wind with it.
  const saved = GAME_TIME.gameSecondsPerDay;
  try {
    GAME_TIME.gameSecondsPerDay = 40;
    const shortDay = windTargetOfDay(SEED, 0);
    const shortEnd = windAt(SEED, 40 * 0.999);
    assert.ok(degreesBetween(shortEnd.direction, shortDay.direction) < 1, "a 40 s day must close on its target");

    GAME_TIME.gameSecondsPerDay = 300;
    const longDay = windTargetOfDay(SEED, 0);
    const longEnd = windAt(SEED, 300 * 0.999);
    assert.ok(degreesBetween(longEnd.direction, longDay.direction) < 1, "a 300 s day must close on its target");

    // At t = 100 s a 40 s day is already on day 2 and a 300 s day is still on day 0, so
    // the two are closing on different targets: the length really is being read.
    GAME_TIME.gameSecondsPerDay = 40;
    const shortDayLater = windTargetOfDay(SEED, 100);
    GAME_TIME.gameSecondsPerDay = 300;
    const longDayLater = windTargetOfDay(SEED, 100);
    assert.equal(shortDayLater.day, 2, "a 40 s day must be on day 2 after 100 s");
    assert.equal(longDayLater.day, 0, "a 300 s day must still be on day 0 after 100 s");
    assert.notEqual(
      Math.round(shortDayLater.direction * 1000),
      Math.round(longDayLater.direction * 1000),
      "the day length must change which target the wind is closing on",
    );
  } finally {
    GAME_TIME.gameSecondsPerDay = saved;
  }
});

test("S146: a broken day length falls back to the shipped one, never a NaN", () => {
  const saved = GAME_TIME.gameSecondsPerDay;
  try {
    for (const broken of [0, -10, NaN, "abc", undefined, null]) {
      GAME_TIME.gameSecondsPerDay = broken;
      const wind = windAt(SEED, 50);
      assert.ok(Number.isFinite(wind.direction), `a day of ${String(broken)} broke the direction`);
      assert.ok(Number.isFinite(wind.strengthKn), `a day of ${String(broken)} broke the strength`);
    }
  } finally {
    GAME_TIME.gameSecondsPerDay = saved;
  }
});
