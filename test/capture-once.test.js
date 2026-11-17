/**
 * S139: an enemy is defeated once, never in a loop.
 *
 * Measured bug (user report): "cuando un buque enemigo es capturado, aparece en la pantalla
 * como nuestro, ahora no aparece hasta que llega al astillero". The prize never showed
 * because the live squadron did not hear about her; when that was fixed, the real defect
 * behind it became visible: `resolveDefeatedEnemies` drops the captured hull, `updateWorld`
 * immediately tops the zone's enemy count back up, and the same encounter returns with
 * `status: "surrendered"` intact, so she is captured again on every frame (122 prizes in
 * 800 ms, measured in the browser).
 *
 * The rule: a defeated enemy leaves the sea for good. The level's quota (S140) decides how
 * many hostiles a level has, and a finished fight never comes back.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createWorld, updateWorld } from "../src/model/world.js";
import { defeatedEnemyIds, markDefeated } from "../src/model/world.js";

const ship = { speedKn: 6, x: 210, y: 70, heading: 0, currentSpeedKn: 0 };

const seaWith = (encounters) => ({
  ...createWorld(11, ship, 0),
  encounters,
  defeated: undefined,
});

const surrendered = (id) => ({
  id,
  type: "enemy",
  x: 300,
  y: 120,
  hullId: "patache",
  zoneId: "costera",
  drift: { heading: 0, speedKn: 1 },
  combat: { status: "surrendered", condition: { hull: 30, rigging: 40, crew: 5, morale: 10 }, crew: {}, pieces: [] },
});

test("S139: a defeated enemy is remembered as done, by id", () => {
  const world = markDefeated(seaWith([surrendered(7)]), 7);
  assert.deepEqual([...defeatedEnemyIds(world)], [7]);
});

test("S139: the sea never brings a defeated enemy back", () => {
  let world = markDefeated(seaWith([surrendered(7)]), 7);
  world = { ...world, encounters: world.encounters.filter((entry) => entry.id !== 7) };
  // Many ticks: the zone's density top-up used to put her straight back.
  for (let i = 0; i < 200; i += 1) world = updateWorld(world, {}, 0.05);
  const back = world.encounters.filter((entry) => entry.id === 7);
  assert.deepEqual(back, [], "the defeated enemy came back to the sea");
});

test("S139: a defeated id is never capturable twice", () => {
  let world = markDefeated(seaWith([]), 7);
  for (let i = 0; i < 50; i += 1) world = updateWorld(world, {}, 0.05);
  const capturable = world.encounters.filter(
    (entry) => entry.id === 7 && entry.combat?.status === "surrendered",
  );
  assert.deepEqual(capturable, [], "the same prize was capturable again");
});

test("S139: marking the same enemy twice changes nothing", () => {
  let world = markDefeated(seaWith([]), 7);
  world = markDefeated(world, 7);
  assert.deepEqual([...defeatedEnemyIds(world)], [7]);
});

test("S139: broken input never throws", () => {
  for (const input of [null, {}, { encounters: null }]) {
    assert.deepEqual([...defeatedEnemyIds(input)], []);
    assert.ok(markDefeated(input, "x"));
  }
});
