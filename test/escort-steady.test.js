/**
 * S96: an escort keeps station without hunting around it.
 *
 * Measured before this rule, with the captain holding a steady 6.00 kn: the escort's
 * speed sawed between 5.64 and 6.44 kn on a ~2 s cycle, and coming into station it
 * braked to 3.15 kn. The player sees that as the escorts weaving instead of following.
 *
 * Two causes, both pinned here:
 *   1. the speed target was `captain + closing`, and `closing` fell to zero inside the
 *      tolerance, so the target dropped *below* the captain's speed and the escort braked;
 *   2. inside the tolerance the escort stopped steering altogether, so a hull that was
 *      pointed the wrong way sailed off its station in a straight line and had to come
 *      back — the loop the player described as "hacen muchas bolutas".
 */

import test from "node:test";
import assert from "node:assert/strict";

import { ESCORT, escortStation, stepEscort } from "../src/model/formation.js";
import { stepHull } from "../src/model/world.js";

const DT = 1 / 30;
const CAPTAIN_SPEED = 6;

/** Sail a captain straight for `seconds`, carrying one escort, and report the run. */
function runInFormation({ seconds = 20, startEscort = null } = {}) {
  let captain = { x: 0, y: 0, heading: 0, currentSpeedKn: CAPTAIN_SPEED, speedKn: CAPTAIN_SPEED, turnFactor: 1 };
  let escort = startEscort ?? {
    id: "e",
    x: -120,
    y: 0,
    heading: 0,
    currentSpeedKn: CAPTAIN_SPEED,
    speedKn: CAPTAIN_SPEED,
    turnFactor: 1,
  };
  const speeds = [];
  const distances = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i += 1) {
    captain = stepHull(captain, { throttle: 1 }, DT);
    const station = escortStation(captain, 0);
    escort = stepEscort(escort, station, { wind: null, captainSpeedKn: captain.currentSpeedKn }, DT);
    speeds.push(escort.currentSpeedKn);
    distances.push(Math.hypot(station.x - escort.x, station.y - escort.y));
  }
  return { captain, escort, speeds, distances };
}

test("S96: an escort in formation does not saw its throttle", () => {
  // The rule: once the station is held, the escort matches the captain instead of
  // hunting. Measured before: 5.64..6.44 kn, a 0.80 kn band on a steady 6.00 kn captain.
  const { speeds } = runInFormation({ seconds: 20 });
  const settled = speeds.slice(Math.round(10 / DT)); // after it has settled in
  const min = Math.min(...settled);
  const max = Math.max(...settled);
  assert.ok(
    max - min < 0.25,
    `the escort's speed still saws between ${min.toFixed(2)} and ${max.toFixed(2)} kn (band ${(max - min).toFixed(2)})`,
  );
});

test("S96: an escort in formation does not brake below the captain", () => {
  // Braking is what makes it fall out of the line and then lunge to catch up.
  const { speeds } = runInFormation({ seconds: 20 });
  const settled = speeds.slice(Math.round(10 / DT));
  const min = Math.min(...settled);
  assert.ok(
    min > CAPTAIN_SPEED * 0.85,
    `the escort braked to ${min.toFixed(2)} kn with a captain at ${CAPTAIN_SPEED.toFixed(2)} kn`,
  );
});

test("S96: an escort on station still corrects its heading", () => {
  // Inside the tolerance the escort used to stop steering entirely: a hull pointed
  // 90 degrees off its station sailed sideways out of the line and had to come back.
  const { distances } = runInFormation({
    seconds: 25,
    startEscort: { id: "e", x: -120, y: 0, heading: Math.PI / 2, currentSpeedKn: CAPTAIN_SPEED, speedKn: CAPTAIN_SPEED, turnFactor: 1 },
  });
  const worst = Math.max(...distances.slice(Math.round(10 / DT)));
  assert.ok(
    worst <= ESCORT.farM,
    `the escort wandered ${worst.toFixed(0)} m from its station instead of holding it`,
  );
});

test("S96: a station that has been lost is still recovered", () => {
  // The dead band must not turn into a refusal to work: an escort left far astern has
  // to close the gap, or the fleet would sail away from it.
  const { distances, escort, captain } = runInFormation({
    seconds: 40,
    startEscort: { id: "e", x: -600, y: 300, heading: 0, currentSpeedKn: 0, speedKn: CAPTAIN_SPEED, turnFactor: 1 },
  });
  const station = escortStation(captain, 0);
  const final = Math.hypot(station.x - escort.x, station.y - escort.y);
  assert.ok(final < 60, `the escort never regained its station (${final.toFixed(0)} m away)`);
  assert.ok(Math.max(...distances) > 100, "the fixture never actually lost the station");
});
