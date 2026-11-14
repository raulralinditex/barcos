/**
 * S66: a safe zone around the shipyard.
 *
 * The home port is where a player repairs, resupplies and thinks. An enemy sail that
 * wanders in turns that into a place you cannot use, so the water near the yard is
 * closed to hostiles: they do not enter it, and they do not fire into it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SAFE_ZONE,
  clampToSafeZone,
  insideSafeZone,
  safeZoneRadiusM,
  spawnOutsideSafeZone,
} from "../src/model/world.js";
import { SETTINGS_FIELDS, applySettings, fieldId, resetSettings } from "../src/model/settings.js";

const withDefaults = (body) => {
  try {
    body();
  } finally {
    resetSettings();
  }
};

/* ---------------------------------------------------------------- the zone itself */

test("S66: the zone ships at a radius around the home port", () => {
  assert.ok(Number.isFinite(SAFE_ZONE.safeZoneM));
  assert.ok(SAFE_ZONE.safeZoneM > 0);
  // The port is 110 m; the zone has to cover the quay and its approach, but not swallow
  // the whole coastal band (1200 m), or there would be nowhere near home to fight.
  assert.ok(SAFE_ZONE.safeZoneM >= 200, `a ${SAFE_ZONE.safeZoneM} m zone does not protect the approach`);
  assert.ok(SAFE_ZONE.safeZoneM < 600, `a ${SAFE_ZONE.safeZoneM} m zone eats the coastal band`);
});

test("S66: the home port is inside the zone, and the open sea is not", () => {
  assert.equal(insideSafeZone({ x: 0, y: 0 }), true, "the yard itself is safe");
  assert.equal(insideSafeZone({ x: 100, y: 0 }), true);
  const radius = safeZoneRadiusM();
  assert.equal(insideSafeZone({ x: 0, y: radius + 1 }), false, "the open sea is not");
});

test("S66: the edge counts as inside, so a hostile cannot sit on the line", () => {
  const radius = safeZoneRadiusM();
  assert.equal(insideSafeZone({ x: radius, y: 0 }), true);
  assert.equal(insideSafeZone({ x: radius + 0.5, y: 0 }), false);
});

test("S66: a broken position never counts as safe", () => {
  // Fail closed: if the position is unknown, treat the ship as exposed rather than
  // handing out protection that was never earned.
  for (const broken of [null, undefined, {}, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    assert.equal(insideSafeZone(broken), false, `position ${JSON.stringify(broken)}`);
  }
});

test("S66: the radius is a setting, so the zone can be widened or closed", () => {
  const field = SETTINGS_FIELDS.find((entry) => fieldId(entry) === "world.safeZoneM");
  assert.ok(field, "the safe zone must be configurable");
  assert.equal(field.group, "world");
  withDefaults(() => {
    applySettings({ "world.safeZoneM": 1500 });
    assert.equal(safeZoneRadiusM(), 1500);
    assert.equal(insideSafeZone({ x: 1400, y: 0 }), true);
    assert.equal(insideSafeZone({ x: 1600, y: 0 }), false);
    applySettings({ "world.safeZoneM": 0 });
    assert.equal(safeZoneRadiusM(), 0);
    assert.equal(insideSafeZone({ x: 0, y: 0 }), false, "a zero zone protects nothing");
  });
});

/* ---------------------------------------------------------------- keeping them out */

test("S66: an enemy inside the zone is pushed out to its edge", () => {
  const pushed = clampToSafeZone({ x: 200, y: 0 });
  assert.ok(Math.abs(Math.hypot(pushed.x, pushed.y) - safeZoneRadiusM()) < 1e-6);
  assert.equal(insideSafeZone(pushed), true, "the edge is the closest it may stand");
});

test("S66: an enemy already outside is left exactly where it is", () => {
  const far = { x: 2000, y: 500 };
  assert.deepEqual(clampToSafeZone(far), far);
});

test("S66: an enemy pushed out keeps its bearing from the yard", () => {
  // It must be shoved straight back the way it came, not sideways.
  const pushed = clampToSafeZone({ x: 0, y: 100 });
  assert.ok(Math.abs(pushed.x) < 1e-9, `x should stay on the axis, got ${pushed.x}`);
  assert.ok(pushed.y > 0, "it should be pushed north, the way it came");
});

test("S66: an enemy exactly at the yard is pushed somewhere valid, not NaN", () => {
  const pushed = clampToSafeZone({ x: 0, y: 0 });
  assert.ok(Number.isFinite(pushed.x) && Number.isFinite(pushed.y), "the push must not produce NaN");
  assert.ok(Math.hypot(pushed.x, pushed.y) >= safeZoneRadiusM() - 1e-6);
});

test("S66: a broken position is left alone instead of becoming NaN", () => {
  const broken = { x: NaN, y: 5 };
  const result = clampToSafeZone(broken);
  assert.equal(result, broken, "a broken position comes back untouched, not turned into a new NaN");
  assert.ok(Number.isNaN(result.x));
});

test("S66: a spawn is never placed inside the zone", () => {
  withDefaults(() => {
    applySettings({ "world.safeZoneM": 800 });
    // Try many points: every one of them must land outside.
    for (let i = 0; i < 200; i += 1) {
      const angle = (i / 200) * Math.PI * 2;
      const point = spawnOutsideSafeZone(angle, 100);
      assert.equal(insideSafeZone(point), false, `angle ${angle} spawned inside the zone`);
      assert.ok(
        Math.hypot(point.x, point.y) > safeZoneRadiusM(),
        `angle ${angle} spawned on the line instead of outside it`,
      );
    }
  });
});

test("S66: a spawn already outside the zone keeps its distance", () => {
  const far = spawnOutsideSafeZone(0, 3000);
  assert.ok(Math.abs(Math.hypot(far.x, far.y) - 3000) < 1e-6);
});
