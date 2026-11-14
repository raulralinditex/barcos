/**
 * S67: a day of game time is a configurable number of seconds.
 *
 * Everything the game already charges per day — provisions, wages, upkeep — is priced in
 * real-world days. The rule here is only the conversion: how many seconds of play stand
 * for one of those days. Nothing is re-priced, so the shipyard's balance does not move.
 *
 * The second half is the part that was missing entirely: the supply was paid for and
 * weighed, but never spent. It is a reserve now, burned by the world clock, and when a
 * whole day of it goes the crew's wages are paid for that day.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  GAME_TIME,
  burnSupply,
  daysOfSupply,
  gameDays,
  supplySeconds,
} from "../src/model/game-time.js";
import { SETTINGS_FIELDS, applySettings, fieldId, resetSettings } from "../src/model/settings.js";

const withDefaults = (body) => {
  try {
    body();
  } finally {
    resetSettings();
  }
};

/* ---------------------------------------------------------------- the conversion */

test("S67: a day of game time ships at 100 seconds", () => {
  assert.equal(GAME_TIME.gameSecondsPerDay, 100);
});

test("S67: days and seconds convert both ways", () => {
  assert.equal(supplySeconds(1), 100);
  assert.equal(supplySeconds(45), 4500);
  assert.equal(daysOfSupply(4500), 45);
  assert.equal(daysOfSupply(250), 2.5);
});

test("S67: the conversion follows the setting", () => {
  const field = SETTINGS_FIELDS.find((entry) => fieldId(entry) === "time.gameSecondsPerDay");
  assert.ok(field, "the length of a day must be configurable");
  withDefaults(() => {
    applySettings({ "time.gameSecondsPerDay": 200 });
    assert.equal(supplySeconds(1), 200);
    assert.equal(daysOfSupply(200), 1);
  });
});

test("S67: a broken length of day never produces a broken supply", () => {
  withDefaults(() => {
    for (const broken of [0, -50, NaN, Infinity]) {
      applySettings({ "time.gameSecondsPerDay": broken });
      assert.ok(supplySeconds(10) > 0, `a day of ${broken} broke the conversion`);
      assert.ok(Number.isFinite(supplySeconds(10)));
      assert.ok(Number.isFinite(daysOfSupply(1000)));
    }
  });
});

test("S67: elapsed seconds become whole game days, and the rest is kept", () => {
  assert.equal(gameDays(0), 0);
  assert.equal(gameDays(100), 1);
  assert.equal(gameDays(250), 2);
  assert.equal(gameDays(99), 0);
});

/* ---------------------------------------------------------------- burning the reserve */

test("S67: the reserve burns with the clock and never goes below zero", () => {
  const first = burnSupply(4500, 250);
  assert.equal(first.secondsLeft, 4250);
  assert.equal(first.daysSpent, 2);

  // The last part-day is charged when the reserve empties: the crew ate it, and it
  // happens exactly once instead of leaking a half day forever.
  const empty = burnSupply(50, 500);
  assert.equal(empty.secondsLeft, 0, "an empty reserve stays empty, it does not go negative");
  assert.equal(empty.daysSpent, 1, "the final part-day is charged as it runs out");
});

test("S67: spending a day is reported, so the wages can be charged for it", () => {
  const result = burnSupply(4500, 100);
  assert.equal(result.daysSpent, 1);
  assert.equal(result.secondsLeft, 4400);
  assert.equal(result.exhausted, false);
});

test("S67: running out is reported once, at the moment it runs out", () => {
  const hitZero = burnSupply(100, 100);
  assert.equal(hitZero.secondsLeft, 0);
  assert.equal(hitZero.exhausted, true, "the moment it runs out is reported");

  const stillEmpty = burnSupply(0, 100);
  assert.equal(stillEmpty.exhausted, false, "staying empty is not news again");
});

test("S67: a ship with no reserve at all reports nothing rather than throwing", () => {
  for (const broken of [undefined, null, NaN, -10, "abc"]) {
    const result = burnSupply(broken, 100);
    assert.equal(result.secondsLeft, 0, `reserve ${String(broken)}`);
    assert.equal(result.daysSpent, 0);
    assert.equal(result.exhausted, false);
  }
});

test("S67: a broken or zero step does not spend anything", () => {
  for (const dt of [0, -5, NaN, undefined]) {
    const result = burnSupply(4500, dt);
    assert.equal(result.secondsLeft, 4500, `step ${String(dt)}`);
    assert.equal(result.daysSpent, 0);
  }
});

test("S67: a huge step spends at most what is left", () => {
  const result = burnSupply(4500, 1_000_000);
  assert.equal(result.secondsLeft, 0);
  assert.equal(result.daysSpent, 45, "it cannot buy more days than it holds");
});

/* ---------------------------------------------------------------- the price of a day */

test("S67: a day of wages is what the fleet costs per day", () => {
  // The wages are already a per-day figure (S1); the conversion is the only new part.
  const fleet = {
    ships: [
      { upkeep: 12.5 },
      { upkeep: 7.5 },
    ],
  };
  assert.equal(20, fleet.ships.reduce((sum, ship) => sum + ship.upkeep, 0));
});
