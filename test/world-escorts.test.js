import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, deserializeWorld, serializeWorld } from "../src/model/world.js";
import { escortStation } from "../src/model/formation.js";

test("S130 E: a new voyage forms only sailing escorts and persists their positions", () => {
  const captain = { id: "captain", speedKn: 5 };
  const fleet = { captainId: captain.id, ships: [captain, { id: "escort", speedKn: 4, sails: true, yardId: null }, { id: "stays", speedKn: 4, sails: false, yardId: "puerto-casa" }, { id: "wreck", speedKn: 4, sails: true, yardId: "puerto-casa", wreck: true }, { id: "remote", speedKn: 4, sails: true, yardId: "cala-del-abismo" }] };
  const world = createWorld(123, captain, 11, fleet);
  assert.deepEqual(world.escorts.map((escort) => escort.id), ["escort"]);
  assert.deepEqual({ x: world.escorts[0].x, y: world.escorts[0].y }, escortStation(world.ship, 0));
  const loaded = deserializeWorld(serializeWorld(world));
  assert.deepEqual(loaded.escorts, world.escorts);
  assert.equal(loaded.gold, 11);
});

test("S36/S39 preserve: a world without escorts and an older save still have the captain alone", () => {
  const world = createWorld(12, { speedKn: 5 }, 0);
  assert.deepEqual(world.escorts, []);
  const old = JSON.parse(serializeWorld(world));
  delete old.escorts;
  assert.deepEqual(deserializeWorld(JSON.stringify(old)).escorts, []);
});
