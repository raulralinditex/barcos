/**
 * The branches of the settings screen (S143).
 *
 * What is pinned here is the invariant the menu hangs on, not its painting: every block of
 * `SETTINGS_FIELDS` belongs to exactly one branch, no branch names a block that does not
 * exist, and a saved selection always resolves to something the screen can show.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { SETTINGS_FIELDS } from "../src/model/settings.js";
import {
  SETTINGS_BRANCHES,
  branchOfGroup,
  resolveSelection,
  selectionKey,
} from "../src/model/settings-branches.js";

const groups = () => [...new Set(SETTINGS_FIELDS.map((field) => field.group))];

test("S143-A: every settings block belongs to exactly one branch", () => {
  for (const group of groups()) {
    const owners = SETTINGS_BRANCHES.filter((branch) => branch.groups.includes(group));
    assert.equal(owners.length, 1, `block «${group}» must belong to one branch, it has ${owners.length}`);
  }
});

test("S143-A: no branch names a block that does not exist", () => {
  const known = new Set(groups());
  for (const branch of SETTINGS_BRANCHES) {
    for (const group of branch.groups) {
      assert.ok(known.has(group), `branch «${branch.id}» names «${group}», which is not a block`);
    }
  }
});

test("S143-A: the five branches carry the twenty-two blocks between them", () => {
  const declared = SETTINGS_BRANCHES.flatMap((branch) => branch.groups);
  assert.equal(declared.length, groups().length, "a block is listed twice across branches");
  assert.deepEqual([...declared].sort(), groups().sort());
  assert.equal(SETTINGS_BRANCHES.length, 5, "the agreed grouping has five branches");
});

test("S143-A: a branch has an id and an i18n key of its own", () => {
  const ids = SETTINGS_BRANCHES.map((branch) => branch.id);
  assert.deepEqual(ids, [...new Set(ids)], "branch ids must be unique");
  for (const branch of SETTINGS_BRANCHES) {
    assert.match(branch.id, /^[a-z][a-z0-9-]*$/, `«${branch.id}» is not an id`);
    assert.match(branch.label, /^settings\.branch\.[a-z]+$/, `«${branch.label}» is not an i18n key`);
  }
});

test("S143-A: the catalogue is a branch of its own and owns no field block", () => {
  const catalogue = SETTINGS_BRANCHES.filter((branch) => branch.catalogue);
  assert.equal(catalogue.length, 1, "exactly one branch owns the catalogue");
  assert.deepEqual(catalogue[0].groups, [], "the catalogue is not a block of fields");
});

test("S143-A: every block resolves to its branch", () => {
  for (const group of groups()) {
    const branch = branchOfGroup(group);
    assert.ok(branch, `block «${group}» has no branch`);
    assert.ok(branch.groups.includes(group));
  }
  assert.equal(branchOfGroup("no-such-block"), null);
});

test("S143-C: a saved selection resolves to a branch, or to one of its blocks", () => {
  assert.deepEqual(resolveSelection("fight"), { branch: "fight", group: null });
  assert.deepEqual(resolveSelection("fight/danger"), { branch: "fight", group: "danger" });
  assert.deepEqual(resolveSelection("  sea  "), { branch: "sea", group: null });
});

test("S143-C: an unreadable selection falls back to the first branch, never to an empty screen", () => {
  const first = SETTINGS_BRANCHES[0].id;
  for (const saved of ["", "   ", null, undefined, 42, {}, "nope", "nope/nope"]) {
    assert.deepEqual(resolveSelection(saved), { branch: first, group: null }, `«${saved}» must fall back`);
  }
});

test("S143-C: a block of another branch is not a selection of this one", () => {
  // «danger» belongs to the fight, so asking for it under the sea shows the sea instead of
  // lighting up one branch and painting a foreign block.
  assert.deepEqual(resolveSelection("sea/danger"), { branch: "sea", group: null });
  assert.deepEqual(resolveSelection("catalogue/danger"), { branch: "catalogue", group: null });
});

test("S143-C: the selection round-trips through the string the screen stores", () => {
  for (const saved of ["sea", "fight", "fight/danger", "trade/yardMarkets", "catalogue"]) {
    assert.equal(selectionKey(resolveSelection(saved)), saved, `«${saved}» must round-trip`);
  }
  assert.equal(selectionKey({ branch: "sea", group: "danger" }), "sea");
  assert.equal(selectionKey(null), SETTINGS_BRANCHES[0].id);
});
