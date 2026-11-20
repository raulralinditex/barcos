/**
 * The fleet room shows the ship+rig panels only for the hull the player picked.
 *
 * The player reported it (verbatim): "en la pantalla tu flota del astillero, no mostrar el
 * panel de aparejo si no hay ninguna nave seleccionada". The panels followed the ROOM, not
 * the selection: `showScreen` moved them into the fleet room and left them visible, so the
 * room greeted the player with the captain's rig and guns before she had chosen anything —
 * numbers belonging to a hull she had not asked about.
 *
 * The rule is about the selection, so it is stated here as a pure function and the screen
 * only reads it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { showsBuilderPanels } from "../src/model/fleet-panels.js";

test("fleet: with no hull picked, the ship and rig panels stay out of the way", () => {
  assert.equal(
    showsBuilderPanels({ screen: "flota", hasSelection: false }),
    false,
    "the fleet room must show no rig panel while nothing is selected",
  );
});

test("fleet: with a hull picked, the fleet room shows them", () => {
  assert.equal(showsBuilderPanels({ screen: "flota", hasSelection: true }), true);
});

test("fleet: the rooms that never take them still do not", () => {
  // The yard, the market and the settings are reading rooms (S145/S147).
  for (const screen of ["configuracion", "astillero", "mercado"]) {
    assert.equal(
      showsBuilderPanels({ screen, hasSelection: true }),
      false,
      `the ${screen} room must not take the builder panels, even with a hull picked`,
    );
  }
});

test("fleet: the buying and refit rooms keep them, selection or not", () => {
  // Comprar is where a hull is built from scratch: it has no fleet selection to make and
  // must keep the panels, or the room would have nothing to build with.
  for (const screen of ["comprar"]) {
    assert.equal(showsBuilderPanels({ screen, hasSelection: false }), true);
    assert.equal(showsBuilderPanels({ screen, hasSelection: true }), true);
  }
});

test("fleet: a broken input shows nothing rather than throwing", () => {
  assert.equal(showsBuilderPanels(null), false);
  assert.equal(showsBuilderPanels({}), false);
  assert.equal(showsBuilderPanels({ screen: "sala-que-no-existe", hasSelection: true }), false);
});
