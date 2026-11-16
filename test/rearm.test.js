/**
 * S121: a hull that ran out of rounds stopped firing for ever.
 *
 * The player's report, verbatim: "despues de librar varias batallas y teniendo todo
 * correctamente el barco a dejado de disparar".
 *
 * Firing spends `shotsLeft` and a gun at zero is filtered out of `firingPieces`, so it
 * stops existing as a gun. Nothing put rounds back. This is the rule that closes that
 * hole, and the one that lets the player carry more ammunition than the builder's default.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createPlayerCombatant, fireBroadside } from "../src/model/combat.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import {
  REARM,
  isOutOfAmmo,
  loadoutOf,
  rearmQuote,
  rearmShip,
  roundsPerGun,
} from "../src/model/rearm.js";

const shipWith = (shotsPerPiece, qty = 2) =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "galeon-pequeno",
        batteries: [{ pieceId: "minion", qty, side: "babor", shotsPerPiece, ammoId: "bala-hierro" }],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 0,
        ballastKg: 0,
        equipmentKg: 0,
        reserveKg: 0,
      },
      999999,
    ),
    { name: "Prueba" },
  );

/** Fire the whole allowance dry, reloading between volleys so the fight is not the limit. */
function fireUntilDry(combatant) {
  let volleys = 0;
  const rnd = () => 0.99;
  while (volleys < 500) {
    for (const gun of combatant.pieces) gun.reloadTimer = 0;
    const { volley } = fireBroadside(combatant, "babor", 100, rnd);
    if (volley.length === 0) break;
    volleys += 1;
  }
  return volleys;
}

test("S121: the bug — a hull that fires her allowance dry stops firing for ever", () => {
  const ship = shipWith(5);
  const live = createPlayerCombatant(ship);
  assert.equal(fireUntilDry(live), 5, "five rounds per gun is five volleys");
  assert.equal(isOutOfAmmo(live), true, "her racks are empty");
  // Reloading does not help: the gun has no round to fire, so it is not a gun any more.
  for (const gun of live.pieces) gun.reloadTimer = 0;
  assert.deepEqual(fireBroadside(live, "babor", 100, () => 0.99).volley, []);
});

test("S121: the yard quotes exactly the rounds that are missing, and nothing when full", () => {
  const ship = shipWith(10);
  const live = createPlayerCombatant(ship);
  // A fresh hull owes nothing: her racks are as full as her loadout says.
  assert.deepEqual(
    { rounds: rearmQuote(ship, live).rounds, cost: rearmQuote(ship, live).cost, rearmable: rearmQuote(ship, live).rearmable },
    { rounds: 0, cost: 0, rearmable: false },
  );

  fireUntilDry(live);
  const quote = rearmQuote(ship, live);
  assert.equal(quote.rounds, 20, "two guns of ten rounds, both dry");
  assert.ok(quote.cost > 0, "rounds are not free");
  assert.equal(quote.lines.length, 1, "one line per battery");
  assert.equal(quote.lines[0].rounds, 20);
});

test("S121: a half-spent rack costs half as much as a dry one", () => {
  const ship = shipWith(10);
  const live = createPlayerCombatant(ship);
  // Spend half: five volleys of ten rounds per gun is 10 per gun, so fire four volleys.
  for (let i = 0; i < 4; i += 1) {
    for (const gun of live.pieces) gun.reloadTimer = 0;
    fireBroadside(live, "babor", 100, () => 0.99);
  }
  const half = rearmQuote(ship, live);
  fireUntilDry(live);
  const dry = rearmQuote(ship, live);
  assert.ok(half.rounds > 0 && half.rounds < dry.rounds, `${half.rounds} must sit between 0 and ${dry.rounds}`);
  assert.ok(half.cost < dry.cost, "a half-spent rack must cost less than a dry one");
});

test("S121: rearming pays the yard and puts the rounds back, and the guns speak again", () => {
  const ship = shipWith(5);
  const live = createPlayerCombatant(ship);
  fireUntilDry(live);
  const quote = rearmQuote(ship, live);
  const result = rearmShip(ship, live, 100000);
  assert.ok(result, "the yard re-arms a hull that owes rounds and can pay");
  assert.equal(result.gold, 100000 - quote.cost);
  // The live racks are full and the guns fire again.
  assert.equal(isOutOfAmmo(result.live), false);
  for (const gun of result.live.pieces) gun.reloadTimer = 0;
  assert.ok(fireBroadside(result.live, "babor", 100, () => 0.99).volley.length > 0, "she must fire again");
  // The loadout is what the next voyage is built from (S23), so it is what was topped up.
  assert.equal(result.ship.batteries[0].shotsPerPiece, 5);
});

test("S121: rearming twice pays once, and a refused rearm changes nothing", () => {
  const ship = shipWith(5);
  const live = createPlayerCombatant(ship);
  fireUntilDry(live);
  const once = rearmShip(ship, live, 100000);
  const twice = rearmShip(once.ship, once.live, once.gold);
  assert.equal(twice, null, "a hull with full racks owes nothing");
  assert.equal(once.gold, 100000 - once.quote.cost, "the second attempt must not charge");

  // No purse, no rounds.
  const poor = rearmShip(ship, live, 0);
  assert.equal(poor, null, "a hull that cannot pay is not re-armed");
  assert.equal(live.pieces[0].shotsLeft, 0, "a refused rearm must not touch the live racks");
});

test("S121: the player may load more ammunition than the builder's default", () => {
  const ship = shipWith(5);
  const live = createPlayerCombatant(ship);
  fireUntilDry(live);
  const heavy = rearmShip(ship, live, 100000, { roundsPerGun: 150 });
  assert.ok(heavy);
  assert.equal(heavy.ship.batteries[0].shotsPerPiece, 150, "she carries the allowance asked for");
  assert.equal(heavy.live.pieces[0].shotsLeft, 150);
  // And that allowance really is more volleys than before.
  const heavyVolleys = fireUntilDry(heavy.live);
  assert.ok(heavyVolleys > 5, `150 rounds must outlast the 5 she had, she fired ${heavyVolleys}`);
});

test("S121: the allowance is capped, and junk resolves to no rounds", () => {
  assert.equal(roundsPerGun("minion", 5000), REARM.maxRoundsPerGun, "the allowance is a cap, not a suggestion");
  assert.equal(roundsPerGun("minion", 0), 0);
  assert.equal(roundsPerGun("minion", -10), 0);
  assert.equal(roundsPerGun("minion", "basura"), 0);
  assert.equal(roundsPerGun("no-existe", 10), 0);
  // A hull with no guns owes nothing, and is never reported as dry.
  assert.equal(rearmQuote({ batteries: [] }, null).rearmable, false);
  assert.equal(isOutOfAmmo({ pieces: [] }), false);
});

test("S121: the loadout is read back from the hull, clamped to the allowance", () => {
  const ship = shipWith(999);
  const loadout = loadoutOf(ship);
  assert.equal(loadout.length, 1);
  assert.equal(loadout[0].shotsPerPiece, REARM.maxRoundsPerGun, "a hand-edited save cannot carry a million rounds");
  assert.deepEqual(loadoutOf(null), []);
});

test("S121: a hull in port with no live combat owes nothing", () => {
  // The fleet sheet has no racks: only the sea knows what is left in them.
  const ship = shipWith(10);
  assert.equal(rearmQuote(ship, null).rearmable, false);
});
