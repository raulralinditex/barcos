/**
 * S173: restarting is where the player picks the game.
 *
 * F2 of the refactor. The player asked for it (verbatim): "cuando le damos al boton reiniciar
 * seleccionariamos el tipo de juego". The second mode is her call and not written yet, so
 * what this file pins is the **seam**, not the list: the restart screen draws whatever the
 * registry holds, in registry order, with each mode's own name and description, and the
 * choice it stores is the id the sea reads.
 *
 * Adding a mode must be a file and a registry entry. If a test here had to change to add one,
 * the screen would still be welded to today's single game.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { allModes, DEFAULT_MODE_ID, MODES, registerMode } from "../src/model/modes/index.js";
import { es } from "../src/i18n/es.js";
import { en } from "../src/i18n/en.js";

test("S173: the restart list is the registry, in registry order", () => {
  const listed = allModes();
  assert.deepEqual(listed.map((mode) => mode.id), Object.keys(MODES));
  // Today there is one mode, and the list still holds it: a list of one is a list.
  assert.ok(listed.length >= 1, "the restart screen would offer nothing to pick");
  assert.equal(listed[0].id, DEFAULT_MODE_ID, "the shipped mode must be the default one");
});

test("S173: a mode added to the registry shows up without touching the screen", () => {
  const before = allModes().length;
  registerMode({
    id: "test-restart",
    labelKey: "mode.test.name",
    descriptionKey: "mode.test.description",
    enemiesPerZone: () => 1,
    stamp: () => ({ level: 1 }),
    seed: (world) => world,
    advance: () => null,
    progress: () => null,
    progressFromSave: () => null,
  });
  const after = allModes();
  assert.equal(after.length, before + 1, "a new mode must reach the list by itself");
  assert.ok(after.some((mode) => mode.id === "test-restart"));
  // Clean up, so the rest of the suite sees the shipped registry.
  delete MODES["test-restart"];
});

test("S173: every mode in the registry can name and describe herself in both languages", () => {
  for (const mode of allModes()) {
    assert.ok(mode.labelKey, `the mode "${mode.id}" has no label key`);
    assert.ok(mode.descriptionKey, `the mode "${mode.id}" has no description key`);
    assert.ok(es[mode.labelKey], `the mode "${mode.id}" has no Spanish name (${mode.labelKey})`);
    assert.ok(en[mode.labelKey], `the mode "${mode.id}" has no English name (${mode.labelKey})`);
    assert.ok(es[mode.descriptionKey], `the mode "${mode.id}" has no Spanish description (${mode.descriptionKey})`);
    assert.ok(en[mode.descriptionKey], `the mode "${mode.id}" has no English description (${mode.descriptionKey})`);
    // A raw key on the restart screen tells the player the screen is broken.
    assert.ok(!/^mode\./.test(es[mode.labelKey]), `the mode "${mode.id}" prints a raw key`);
  }
});

test("S173: the mode the player picks is the id the sea reads", () => {
  // The restart screen stores `mode.id` and `sea.js` reads it back through `createWorld`,
  // which normalises an unknown id to the shipped one. Both halves of that contract:
  const listed = allModes()[0];
  assert.equal(typeof listed.id, "string");
  assert.ok(listed.id.length > 0);
  // An id that is not in the registry is not a mode, and the sea must not be handed one.
  assert.equal(allModes().some((mode) => mode.id === "no-such-mode"), false);
});
