/**
 * S77: the doubloons a new game starts with are a setting.
 *
 * `STARTING_GOLD` stays the shipped constant (twelve thousand) because the balance tests
 * are written against it; the live value the shipyard reads is `START.gold`, which the
 * settings screen can change. What must never happen is a start so poor that a whole
 * country cannot buy a single hull.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { COUNTRIES, HULLS, START, STARTING_GOLD } from "../src/data/naval-data.js";
import { minimumShipPrice } from "../src/model/economy.js";
import { SETTINGS_FIELDS, applySettings, fieldId, normaliseSettings, resetSettings } from "../src/model/settings.js";

const withDefaults = (body) => {
  try {
    body();
  } finally {
    resetSettings();
  }
};

const FIELD = "prices.startGold";
const field = () => SETTINGS_FIELDS.find((entry) => fieldId(entry) === FIELD);

test("S77: the live starting purse ships equal to the constant", () => {
  assert.equal(STARTING_GOLD, 12000, "the balance tests are written against twelve thousand");
  assert.equal(START.gold, STARTING_GOLD);
});

test("S77: the starting purse is a setting with a range around the shipped value", () => {
  assert.ok(field(), "the starting doubloons must be configurable");
  assert.ok(field().min < STARTING_GOLD && STARTING_GOLD < field().max);
});

test("S77: a changed value reaches the live purse and leaves the constant alone", () => {
  withDefaults(() => {
    applySettings({ [FIELD]: 20000 });
    assert.equal(START.gold, 20000);
    assert.equal(STARTING_GOLD, 12000, "the shipped constant must not move");
  });
});

test("S77: resetting restores the shipped purse", () => {
  applySettings({ [FIELD]: 30000 });
  resetSettings();
  assert.equal(START.gold, STARTING_GOLD);
});

test("S77: an out-of-range purse is clamped, never rejected", () => {
  withDefaults(() => {
    applySettings({ [FIELD]: 1 });
    assert.equal(START.gold, field().min);
    applySettings({ [FIELD]: 1e12 });
    assert.equal(START.gold, field().max);
  });
});

test("S77: a broken purse falls back to the shipped value", () => {
  withDefaults(() => {
    for (const broken of [undefined, null, NaN, Infinity, "abc", {}]) {
      const applied = applySettings({ [FIELD]: broken });
      assert.equal(applied[FIELD], STARTING_GOLD, `value ${String(broken)}`);
    }
  });
});

test("S77: a settings blob that predates this field still loads", () => {
  assert.equal(normaliseSettings({ "wind.maxSpeedBonus": 0.5 })[FIELD], STARTING_GOLD);
});

test("S77: even the poorest allowed start can buy a hull in every country", () => {
  // The minimum is what protects the player from a soft-lock: a purse below the cheapest
  // playable hull of a country leaves that country's captain with nothing to buy.
  const minimum = field().min;
  for (const country of COUNTRIES) {
    const cheapest = Math.min(
      ...HULLS.filter((hull) => hull.countries.includes(country)).map((hull) => minimumShipPrice(hull.id)),
    );
    assert.ok(
      cheapest <= minimum,
      `${country}: the cheapest ship costs ${Math.round(cheapest)}, more than the minimum start of ${minimum}`,
    );
  }
});
