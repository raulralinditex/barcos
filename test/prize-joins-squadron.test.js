/**
 * S139: a captured hull joins the squadron at once, not on the next reload.
 *
 * User report (verbatim): "cuando un buque enemigo es capturado, aparece en la pantalla
 * como nuestro, ahora no aparece hasta que llega al astillero"
 *
 * The sea builds its live escort list once, when the screen loads. A prize is added to the
 * fleet and saved, but the live list never heard about her, so she only appeared after
 * sailing back to a yard and reloading the sea. The fix is a model function the sea calls
 * when a hull joins: it says whether the new hull must sail with the captain and where she
 * enters the formation.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { prizeJoiningSquadron } from "../src/model/formation.js";

const captain = { id: "cap", x: 100, y: 50, heading: 0 };
const prize = { id: "prize", name: "Presa", speedKn: 6, turnFactor: 0.8 };

test("S139: a prize joins the squadron with the captain's station line", () => {
  const joined = prizeJoiningSquadron([], captain, prize, 1);
  assert.equal(joined.id, "prize");
  assert.equal(joined.name, "Presa");
  assert.equal(joined.currentSpeedKn, 0);
  // She appears near the captain, not at the origin: she is in the formation.
  assert.ok(Math.hypot(joined.x - captain.x, joined.y - captain.y) < 600);
});

test("S139: she keeps her own speed and turn factor", () => {
  const joined = prizeJoiningSquadron([], captain, prize, 2);
  assert.equal(joined.speedKn, prize.speedKn);
  assert.equal(joined.turnFactor, prize.turnFactor);
});

test("S139: a hull already in the squadron is not added twice", () => {
  const existing = [{ id: "prize" }];
  assert.equal(prizeJoiningSquadron(existing, captain, prize, 1), null);
});

test("S139: a broken prize or captain never throws and joins nothing", () => {
  for (const [line, cap, hull] of [
    [null, captain, prize],
    [[], null, prize],
    [[], captain, null],
    [[], captain, { name: "sin id" }],
  ]) {
    assert.equal(prizeJoiningSquadron(line, cap, hull, 1), null);
  }
});
