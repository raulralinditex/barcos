import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSeaFleet } from "../src/model/fleet.js";

/**
 * S151: the sea saves what it owns, not the whole fleet.
 *
 * The sea keeps a copy of the fleet from the moment it opens, and its autosave used to
 * write that copy back whole. Cargo bought in the yard afterwards was overwritten with
 * the value the sea remembered: the player watched her hold empty itself and the port's
 * stock return to rest without selling a barrel.
 */

const hull = (id, extra = {}) => ({
  id,
  name: id,
  hullId: "galeon-pequeno",
  speedKn: 8,
  capacityKg: 112500,
  days: 45,
  condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
  crewAlive: { marino: 34 },
  yardId: "puerto-casa",
  sails: true,
  ...extra,
});

const fleetOf = (ships, captainId = ships[0]?.id ?? null) => ({ ships, captainId });

test("S151: a hold bought in the yard survives the sea autosave", () => {
  // The yard bought six barrels after the sea opened, so the stored sheet has them and
  // the sea's copy still remembers an empty hold.
  const stored = fleetOf([
    hull("a", { manifest: [{ commodityId: "sal", units: 6, kg: 1920 }], cargoKg: 1920 }),
  ]);
  const live = fleetOf([hull("a", { manifest: [], cargoKg: 0 })]);

  const merged = mergeSeaFleet(stored, live);

  assert.deepEqual(merged.ships[0].manifest, [{ commodityId: "sal", units: 6, kg: 1920 }]);
  assert.equal(merged.ships[0].cargoKg, 1920);
});

test("S151: a hull bought after the sea opened is not deleted", () => {
  const stored = fleetOf([hull("a"), hull("bought-later")]);
  const live = fleetOf([hull("a")]);

  const merged = mergeSeaFleet(stored, live);

  assert.deepEqual(merged.ships.map((ship) => ship.id), ["a", "bought-later"]);
});

test("S151: the sea's own loot is written when the voyage loaded it", () => {
  const stored = fleetOf([hull("a", { manifest: [], cargoKg: 0 })]);
  const live = fleetOf([hull("a", { manifest: [{ commodityId: "plata", units: 3, kg: 900 }], cargoKg: 900 })]);

  const merged = mergeSeaFleet(stored, live, { holdsChanged: ["a"] });

  assert.deepEqual(merged.ships[0].manifest, [{ commodityId: "plata", units: 3, kg: 900 }]);
  assert.equal(merged.ships[0].cargoKg, 900);
});

test("S151: condition, crew and mooring come from the voyage", () => {
  const stored = fleetOf([hull("a")]);
  const live = fleetOf([
    hull("a", {
      condition: { hull: 41, rigging: 22, crew: 63, morale: 70 },
      crewAlive: { marino: 11 },
      yardId: null,
    }),
  ]);

  const merged = mergeSeaFleet(stored, live);

  assert.equal(merged.ships[0].condition.hull, 41);
  assert.equal(merged.ships[0].condition.rigging, 22);
  assert.deepEqual(merged.ships[0].crewAlive, { marino: 11 });
  assert.equal(merged.ships[0].yardId, null);
});

test("S151: a refit done in port is not undone by the sea's copy", () => {
  // The yard renamed her and put new guns on her after the sea opened.
  const stored = fleetOf([hull("a", { name: "Renombrada", batteries: [{ pieceId: "culebrina", qty: 4 }], days: 30 })]);
  const live = fleetOf([hull("a", { name: "a", batteries: [{ pieceId: "minion", qty: 2 }], days: 45 })]);

  const merged = mergeSeaFleet(stored, live);

  assert.equal(merged.ships[0].name, "Renombrada");
  assert.deepEqual(merged.ships[0].batteries, [{ pieceId: "culebrina", qty: 4 }]);
  assert.equal(merged.ships[0].days, 30);
});

test("S151: a lost hull is dropped and a captured prize is appended", () => {
  const stored = fleetOf([hull("a"), hull("lost")]);
  const live = fleetOf([hull("a"), hull("prize")]);

  const merged = mergeSeaFleet(stored, live, { removed: ["lost"] });

  assert.deepEqual(merged.ships.map((ship) => ship.id), ["a", "prize"]);
  assert.equal(merged.captainId, "a");
});

test("S151: the captain falls back when the stored one is gone", () => {
  const stored = fleetOf([hull("a"), hull("b")], "a");
  const live = fleetOf([hull("b")], "b");

  const merged = mergeSeaFleet(stored, live, { removed: ["a"] });

  assert.deepEqual(merged.ships.map((ship) => ship.id), ["b"]);
  assert.equal(merged.captainId, "b");
});

test("S151: a wreck's lost hold is written, because she went down with it", () => {
  // S116: a hull kept as a wreck loses her cargo, and that is the voyage's doing. Without
  // claiming the hold the merge would keep the goods the stored sheet remembers, and
  // floating her again would bring back a cargo that is at the bottom.
  const stored = fleetOf([hull("a", { manifest: [{ commodityId: "sal", units: 6, kg: 1920 }], cargoKg: 1920 })]);
  const live = fleetOf([hull("a", { manifest: [], cargoKg: 0 })]);

  const merged = mergeSeaFleet(stored, live, { holdsChanged: ["a"] });

  assert.deepEqual(merged.ships[0].manifest, []);
  assert.equal(merged.ships[0].cargoKg, 0);
});

test("S151: once the sheet agrees, the sea stops claiming the hold", () => {
  // The claim is spent by the write that publishes it. If it survived, the sea would keep
  // overwriting a purchase made after the prize was taken: the reported bug again, only
  // one step later. This pins the two-step rule the sea follows.
  let stored = fleetOf([hull("a", { manifest: [], cargoKg: 0 })]);
  const live = fleetOf([hull("a", { manifest: [{ commodityId: "plata", units: 3, kg: 900 }], cargoKg: 900 })]);

  const firstWrite = mergeSeaFleet(stored, live, { holdsChanged: ["a"] });
  assert.equal(firstWrite.ships[0].cargoKg, 900);

  // The yard then buys salt on top of the prize; the sea no longer claims the hold.
  stored = fleetOf([
    hull("a", {
      manifest: [
        { commodityId: "plata", units: 3, kg: 900 },
        { commodityId: "sal", units: 4, kg: 1280 },
      ],
      cargoKg: 2180,
    }),
  ]);
  const secondWrite = mergeSeaFleet(stored, live, { holdsChanged: [] });

  assert.equal(secondWrite.ships[0].cargoKg, 2180);
  assert.equal(secondWrite.ships[0].manifest.length, 2);
});

test("S151: broken input yields a sane fleet and never throws", () => {
  for (const [stored, live, options] of [
    [null, null, undefined],
    [undefined, undefined, {}],
    [{}, {}, { removed: "nope", holdsChanged: 3 }],
    [{ ships: "nope" }, { ships: 42 }, { removed: [null, 7] }],
    [fleetOf([hull("a"), hull("a")]), fleetOf([hull("a")]), { removed: [] }],
    [fleetOf([hull("a")]), fleetOf([null, hull("a")]), { removed: [] }],
  ]) {
    const merged = mergeSeaFleet(stored, live, options);
    assert.ok(Array.isArray(merged.ships), "ships is always an array");
    assert.equal(new Set(merged.ships.map((ship) => ship.id)).size, merged.ships.length, "no duplicate hulls");
  }
  const empty = mergeSeaFleet(null, null);
  assert.deepEqual(empty, { ships: [], captainId: null });
});
