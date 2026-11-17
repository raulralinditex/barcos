/**
 * S133-B: a shipyard's name is editable and stored per yard id.
 *
 * Player's request (verbatim): "cada astillero tendra un nombre diferente que podremos
 * editar". Decision (verbatim): "En el selector del título" — the name is edited from the
 * title bar's yard selector.
 *
 * The model is storage-free: it takes the map of custom names and returns a new one. An
 * empty or whitespace name is no name at all, so the shipped one comes back. A name never
 * changes a yard's id or her data.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { SHIPYARDS, shipyardById } from "../src/data/naval-data.js";
import {
  normaliseYardName,
  parseYardNames,
  serialiseYardNames,
  withYardName,
  yardDisplayName,
  yardNameOf,
} from "../src/model/shipyard-names.js";

const home = "puerto-casa";
const abyss = "cala-del-abismo";

/** The shipped catalogue, as the app's translator would read it. */
const translate = (key) => ({ "shipyard.puerto-casa": "Puerto de casa", "shipyard.cala-del-abismo": "Cala del abismo" }[key] ?? key);

const homeYard = shipyardById(home);
const abyssYard = shipyardById(abyss);

test("S133-B: a custom name is stored per yard id", () => {
  const names = withYardName({}, home, "Puerto Viejo");
  assert.equal(yardNameOf(names, home), "Puerto Viejo");
  assert.equal(yardDisplayName(homeYard, names, translate), "Puerto Viejo");
  // The other yard keeps the name she shipped with.
  assert.equal(yardDisplayName(abyssYard, names, translate), "Cala del abismo");
});

test("S133-B: a stored name is trimmed, and inner spaces collapse", () => {
  assert.equal(normaliseYardName("   Cala   del   Sur  "), "Cala del Sur");
  assert.equal(yardNameOf(withYardName({}, abyss, "  Cala  del Sur "), abyss), "Cala del Sur");
});

test("S133-B: an empty or whitespace name falls back to the shipped one", () => {
  const named = withYardName({}, home, "Puerto Viejo");
  for (const empty of ["", "   ", "\n\t "]) {
    const names = withYardName(named, home, empty);
    assert.equal(yardNameOf(names, home), "");
    assert.equal(yardDisplayName(homeYard, names, translate), "Puerto de casa");
  }
});

test("S133-B: names survive serialization, and a broken save is no names", () => {
  const names = withYardName(withYardName({}, home, "Puerto Viejo"), abyss, "Cala del Sur");
  const restored = parseYardNames(serialiseYardNames(names));
  assert.deepEqual(restored, names);
  assert.equal(yardDisplayName(abyssYard, restored, translate), "Cala del Sur");
  assert.deepEqual(parseYardNames("not json"), {});
  assert.deepEqual(parseYardNames("[]"), {});
  assert.deepEqual(parseYardNames("null"), {});
});

test("S133-B: a name never changes a yard's id or her data", () => {
  const before = JSON.parse(JSON.stringify(SHIPYARDS));
  const names = withYardName(withYardName({}, home, "Puerto Viejo"), abyss, "Cala del Sur");
  assert.deepEqual(SHIPYARDS, before);
  assert.equal(shipyardById(home).id, home);
  assert.equal(shipyardById(abyss).id, abyss);
  // An unknown yard id is refused instead of inventing a yard.
  assert.deepEqual(withYardName(names, "no-existe", "Fantasma"), names);
  assert.deepEqual(parseYardNames(JSON.stringify({ "no-existe": "Fantasma" })), {});
});
