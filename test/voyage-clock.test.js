/**
 * The voyage clock: what the sea panel must show and charge.
 *
 * User request (verbatim): "tenemos muchos valores que dependen de los dias transcurridos,
 * aparejo.carga.suministro, aparejo.dotacion.doblones por dia etc, en el mar, vamos a hacer
 * un panel con el contador inverso empezando en los dias de suministro y disminuyendo segun
 * van pasando los dias (segundos por configuracion) solo cuentan los segundos que nos
 * pasamos en la pantalla de mar. asi, cada dia en mar, nuestros doblones van disminuyendo
 * segun el coste diario de la dotacion etc, etc"
 *
 * Decision taken: the whole fleet pays her daily upkeep, hulls moored elsewhere included.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { GAME_TIME, burnSupply, supplySeconds } from "../src/model/game-time.js";
import { voyageClock } from "../src/model/voyage-clock.js";

test("the clock counts down the supply days left, in game days", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  const clock = voyageClock({ supplyLeftS: supplySeconds(45), upkeep: 120, gold: 1000 });
  assert.equal(clock.daysLeft, 45);
  assert.equal(clock.upkeep, 120);
  // The reserve is spent in whole days: the first day of the voyage is not yet spent.
  assert.equal(clock.goldPerDay, 120);
  assert.equal(clock.goldIn, Math.floor(1000 / 120));
  assert.equal(clock.empty, false);
});

test("a part day counts as a day of supply left, never as zero", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  assert.equal(voyageClock({ supplyLeftS: 50, upkeep: 10, gold: 0 }).daysLeft, 1);
  assert.equal(voyageClock({ supplyLeftS: 0, upkeep: 10, gold: 0 }).daysLeft, 0);
  assert.equal(voyageClock({ supplyLeftS: 0, upkeep: 10, gold: 0 }).empty, true);
});

test("the clock follows the configured length of a game day", () => {
  GAME_TIME.gameSecondsPerDay = 25;
  assert.equal(voyageClock({ supplyLeftS: 100, upkeep: 5, gold: 0 }).daysLeft, 4);
  GAME_TIME.gameSecondsPerDay = 100;
  assert.equal(voyageClock({ supplyLeftS: 100, upkeep: 5, gold: 0 }).daysLeft, 1);
});

test("the purse is what the supply is worth: it runs out before the crew starves", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  // 10 days of supply, 100 a day, 250 in the purse: she can pay for 2 days and a half.
  const clock = voyageClock({ supplyLeftS: supplySeconds(10), upkeep: 100, gold: 250 });
  assert.equal(clock.goldIn, 2);
  assert.equal(clock.daysLeft, 10);
});

test("a broken or missing clock never throws and never lies", () => {
  for (const input of [null, undefined, {}, { supplyLeftS: "x", upkeep: "y", gold: NaN }]) {
    const clock = voyageClock(input);
    assert.equal(clock.daysLeft, 0);
    assert.equal(clock.upkeep, 0);
    assert.equal(clock.goldIn, Infinity);
  }
});

test("burning the supply still charges one day per whole day crossed", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  const after = burnSupply(supplySeconds(45), 100);
  assert.equal(after.daysSpent, 1);
  assert.equal(after.secondsLeft, supplySeconds(44));
});
