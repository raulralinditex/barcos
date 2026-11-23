/**
 * S169: what happens to one of our hulls when she goes to the bottom.
 *
 * The player's rule, verbatim: "barco nuestro hundido, no aparece en el astillero, quitamos
 * la opcion de 'Un barco hundido queda como naufragio' y siempre queda como naufragio, y
 * desaparece en el astillero". One outcome and no switch: the hull leaves the fleet and the
 * sea keeps a wreck where she went down, which is collected by sailing over it.
 *
 * This file replaces `test/sinking.test.js` and `test/wreck-yard.test.js`, retired with the
 * player's explicit approval: both pinned the switch and the yard refloat that S169 removes.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { isWreck, ownWreck } from "../src/model/sinking.js";
import { deserializeFleet, serializeFleet } from "../src/model/fleet.js";
import { SETTINGS_FIELDS } from "../src/model/settings.js";
import { SETTINGS_BRANCHES } from "../src/model/settings-branches.js";
import { wreckPrize } from "../src/model/combat.js";
import { es } from "../src/i18n/es.js";
import { en } from "../src/i18n/en.js";

const ship = (over = {}) => ({
  id: "s1",
  name: "Perla",
  hullId: "galeon-pequeno",
  speedKn: 5,
  paidGold: 10000,
  capacityKg: 40000,
  cargoKg: 0,
  condition: { hull: 40, rigging: 100, crew: 100, morale: 100 },
  ...over,
});
const zone = { id: "costera", lootFactor: 1 };

/* ------------------------------------------------- S169-A: the switch is gone */

test("S169-A: there is no wreck switch on the settings screen any more", () => {
  const ids = SETTINGS_FIELDS.map((field) => `${field.group}.${field.key}`);
  assert.ok(
    !ids.includes("sinking.keepWreck"),
    `the removed switch is still declared: ${ids.filter((id) => id.startsWith("sinking.")).join(", ")}`,
  );
  // The block is gone with it, and no branch may keep naming a group that no longer exists.
  const groups = new Set(SETTINGS_FIELDS.map((field) => field.group));
  for (const branch of SETTINGS_BRANCHES) {
    for (const group of branch.groups) {
      assert.ok(groups.has(group), `the branch "${branch.id}" names a block that does not exist: ${group}`);
    }
  }
});

test("S169-A: the labels of the removed switch are gone from both languages", () => {
  for (const key of ["settings.sinking.keepWreck", "settings.group.sinking", "fleet.wreck",
    "fleet.wreckHint", "fleet.refloat", "fleet.refloated", "fleet.refloatShort"]) {
    assert.equal(es[key], undefined, `Spanish still carries ${key}`);
    assert.equal(en[key], undefined, `English still carries ${key}`);
  }
});

/* ------------------------------------------------- S169-C/D: the wreck in the water */

test("S169-C: a sunk hull of ours leaves a wreck where she went down", () => {
  const wreck = ownWreck(ship(), { x: 1200, y: -400, heading: 1.5 }, zone, 7);
  assert.equal(wreck.id, 7);
  assert.equal(wreck.type, "wreck");
  assert.equal(wreck.x, 1200);
  assert.equal(wreck.y, -400);
  assert.equal(wreck.heading, 1.5);
  assert.equal(wreck.zoneId, "costera");
  // The prize is the one a defeated enemy of that hull would have paid: losing a hull costs
  // the hull, and the wreck gives back the same share an enemy's does.
  assert.equal(wreck.gold, wreckPrize({ hullId: "galeon-pequeno" }, zone));
  assert.ok(wreck.gold > 0, "a wreck must be worth collecting");
});

test("S169-C: the prize follows the zone, as an enemy's wreck does", () => {
  const coastal = ownWreck(ship(), { x: 0, y: 0 }, { id: "costera", lootFactor: 1 }, 1);
  const abyss = ownWreck(ship(), { x: 0, y: 0 }, { id: "abismo", lootFactor: 5 }, 2);
  assert.ok(abyss.gold > coastal.gold, `deep water must pay more: ${abyss.gold} vs ${coastal.gold}`);
  assert.equal(abyss.zoneId, "abismo");
});

test("S169-C: a hull with no position leaves no wreck, and neither does junk", () => {
  assert.equal(ownWreck(null, { x: 0, y: 0 }, zone, 1), null);
  assert.equal(ownWreck(ship(), null, zone, 1), null);
  assert.equal(ownWreck(ship(), { x: NaN, y: 0 }, zone, 1), null);
  assert.equal(ownWreck(ship(), { x: 0, y: Infinity }, zone, 1), null);
  // A wreck with no id could never be collected or told apart from another: it is no wreck.
  assert.equal(ownWreck(ship(), { x: 0, y: 0 }, zone, null), null);
});

test("S169-D: the wreck is a plain encounter, so it rides in the sea save like any other", () => {
  const wreck = ownWreck(ship(), { x: 300, y: 200 }, zone, 12);
  // It carries nothing of the fleet entry: no name, no condition, no hold. It is a point in
  // the water with a prize, which is what keeps it from being mistaken for a ship.
  assert.deepEqual(Object.keys(wreck).sort(), ["gold", "heading", "id", "type", "x", "y", "zoneId"]);
  assert.equal(JSON.parse(JSON.stringify(wreck)).x, 300);
});

/* ------------------------------------------------- S169-B/E: the hull leaves the sheet */

test("S169-E: a save that still holds a yard wreck loses her on load", () => {
  const fleet = {
    v: 1,
    captainId: "captain",
    ships: [
      ship({ id: "captain", yardId: "puerto-casa" }),
      ship({ id: "drowned", yardId: "puerto-casa", wreck: true, sails: false }),
    ],
  };
  const loaded = deserializeFleet(JSON.stringify(fleet));
  assert.deepEqual(loaded.ships.map((entry) => entry.id), ["captain"]);
  assert.equal(loaded.captainId, "captain");
});

test("S169-E: a fleet whose only hull was a wreck loads empty, not with a ghost", () => {
  const fleet = { v: 1, captainId: "drowned", ships: [ship({ id: "drowned", wreck: true })] };
  const loaded = deserializeFleet(JSON.stringify(fleet));
  assert.deepEqual(loaded.ships, []);
  assert.equal(loaded.captainId, null);
});

test("S169-E: a normal hull round-trips untouched, wreck flag and all", () => {
  const fleet = { v: 1, captainId: "a", ships: [ship({ id: "a", yardId: "puerto-casa" })] };
  const loaded = deserializeFleet(serializeFleet(fleet));
  assert.deepEqual(loaded.ships.map((entry) => entry.id), ["a"]);
  assert.equal(loaded.ships[0].wreck, undefined, "a live hull must never carry the wreck flag");
});

test("S169-E: isWreck reads the old flag and nothing else", () => {
  assert.equal(isWreck({ wreck: true }), true);
  assert.equal(isWreck({ wreck: false }), false);
  assert.equal(isWreck({ wreck: "true" }), false, "only the boolean the old save wrote counts");
  assert.equal(isWreck({}), false);
  assert.equal(isWreck(null), false);
});
