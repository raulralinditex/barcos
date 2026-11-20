/**
 * S166: the chart moves the view, and the view is not the captain.
 *
 * The player asked for it (verbatim): "en el mar, tenemos un panel redondo con una miniatura
 * de todo el mapa, cuando en ese panel cliqueas un punto, mostrar esa parte del mapa en
 * pantalla". So the camera stops being welded to the ship: a click on the chart looks at that
 * piece of sea, and the helm keeps steering the same hull from wherever it is.
 *
 * Two rules have to survive the change, and they are what this file pins: looking somewhere
 * else must never MOVE the captain, and the view has to be able to come back to her.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { WORLD } from "../src/model/world.js";
import { clampCamera, cameraFor, isFollowingCaptain } from "../src/model/sea-camera.js";

test("S166: by default the camera follows the captain", () => {
  const camera = cameraFor({ ship: { x: 900, y: 300 }, camera: null });
  assert.equal(camera.x, 900);
  assert.equal(camera.y, 300);
  assert.equal(isFollowingCaptain({ ship: { x: 900, y: 300 }, camera: null }), true);
});

test("S166: a looked-at point becomes the camera, and the captain does not move", () => {
  const ship = { x: 900, y: 300 };
  const camera = cameraFor({ ship, camera: { x: -2000, y: 1800 } });
  assert.equal(camera.x, -2000);
  assert.equal(camera.y, 1800);
  assert.equal(ship.x, 900, "looking elsewhere must not move the hull");
  assert.equal(ship.y, 300, "looking elsewhere must not move the hull");
  assert.equal(isFollowingCaptain({ ship, camera: { x: -2000, y: 1800 } }), false);
});

test("S166: the view cannot leave the known sea", () => {
  const camera = clampCamera({ x: 99999, y: -99999 }, WORLD.radiusM);
  assert.equal(camera.x, WORLD.radiusM, "the view stops at the edge of the chart");
  assert.equal(camera.y, -WORLD.radiusM);
});

test("S166: a broken camera falls back to following the captain", () => {
  const ship = { x: 900, y: 300 };
  for (const camera of [null, undefined, {}, { x: NaN, y: 0 }, { x: 0, y: Infinity }]) {
    assert.deepEqual(
      cameraFor({ ship, camera }),
      { x: 900, y: 300 },
      `a broken camera (${JSON.stringify(camera)}) must follow the captain`,
    );
  }
});

test("S166: asking to follow again is a null camera, which is the default", () => {
  const camera = cameraFor({ ship: { x: 1, y: 2 }, camera: null });
  assert.equal(isFollowingCaptain({ ship: { x: 1, y: 2 }, camera: null }), true);
  assert.deepEqual(camera, { x: 1, y: 2 });
});
