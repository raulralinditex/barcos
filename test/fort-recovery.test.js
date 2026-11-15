/**
 * S91-S94: retaking a shipyard that fell into enemy hands.
 *
 * S74 left the yard able to strike and to close the port, but nothing in the game could
 * ever bring her back: `status` only travelled one way. The player was locked out of her
 * own harbour for the rest of the save. The rule here is the way back — break the garrison
 * the enemy left in her and she is yours again.
 *
 * Everything is pinned through the public functions the sea screen calls, so the screen
 * cannot drift away from the rule.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  damageFort,
  damageOccupiedFort,
  fortCaptured,
  fortHeldByEnemy,
  fortOccupierCondition,
  fortRecovered,
  occupyFort,
  portClosed,
  createFortCombatant,
  occupierReadyGuns,
  occupierFire,
  FORT,
} from "../src/model/fort.js";
import { COMBAT } from "../src/model/combat.js";

/** A yard already taken: her garrison broke and the enemy walked in. */
function capturedYard() {
  const fort = createFortCombatant();
  damageFort(fort, { hull: 0, rigging: 0, crew: 100_000 });
  assert.equal(fortCaptured(fort), true, "the fixture has to be a captured yard");
  occupyFort(fort);
  return fort;
}

/* ---------------------------------------------------------------- the occupation */

test("S93: taking the yard installs a garrison the player has to break", () => {
  const fort = capturedYard();
  assert.equal(fortHeldByEnemy(fort), true);
  assert.equal(fortOccupierCondition(fort), 100, "the occupiers start at full strength");
  assert.equal(fortRecovered(fort), false, "she is not ours yet");
});

test("S93: occupying a yard that is still fighting does nothing", () => {
  // Fail closed: only a yard that actually fell can be occupied, or the sea could
  // "occupy" her own harbour and hand the player a fight she never lost.
  const fort = createFortCombatant();
  const before = fortOccupierCondition(fort);
  occupyFort(fort);
  assert.equal(fortOccupierCondition(fort), before);
  assert.equal(fortHeldByEnemy(fort), false);
});

test("S93: occupying twice does not reset the fight", () => {
  const fort = capturedYard();
  damageOccupiedFort(fort, { hull: 0, rigging: 0, crew: 50 });
  const worn = fortOccupierCondition(fort);
  occupyFort(fort);
  assert.equal(fortOccupierCondition(fort), worn, "a second call must not heal the occupiers");
});

/* ---------------------------------------------------------------- breaking them */

test("S93: fire on a taken yard wears the occupiers down", () => {
  const fort = capturedYard();
  damageOccupiedFort(fort, { hull: 0, rigging: 0, crew: 30 });
  assert.ok(fortOccupierCondition(fort) < 100);
  assert.equal(fortRecovered(fort), false, "one volley does not retake a fortress");
});

test("S93: the yard's own hull is untouched while she is taken", () => {
  // Retaking her is breaking a garrison, not bombarding your own harbour into rubble.
  // Without this the player could "recover" a fortification that no longer exists.
  const fort = capturedYard();
  const hull = fort.condition.hull;
  damageOccupiedFort(fort, { hull: 10_000, rigging: 0, crew: 60 });
  assert.equal(fort.condition.hull, hull);
  assert.notEqual(fort.status, "sunk");
});

test("S93: breaking the occupying garrison takes the yard back", () => {
  const fort = capturedYard();
  damageOccupiedFort(fort, { hull: 0, rigging: 0, crew: 100_000 });
  assert.equal(fortRecovered(fort), true);
  assert.equal(fortHeldByEnemy(fort), false);
  assert.equal(portClosed(fort), false, "the port opens again");
});

test("S94: a recovered yard is not a fresh one", () => {
  // She comes back with the hull she had: retaking her is not a free rebuild, or losing
  // her would be the cheapest repair in the game.
  const fort = capturedYard();
  fort.condition.hull = 40;
  damageOccupiedFort(fort, { hull: 0, rigging: 0, crew: 100_000 });
  assert.equal(fort.condition.hull, 40);
});

test("S94: a recovered yard does not strike again on the spot", () => {
  // She struck *because* her garrison was below the threshold, so handing her back with
  // that same garrison would surrender her in the very next status refresh and the
  // player would be locked out again — the soft-lock this whole rule exists to remove.
  // The men who retook her stay to hold her.
  const fort = capturedYard();
  assert.ok(fort.condition.crew <= COMBAT.surrenderCrewPct, "the fixture struck for a reason");
  damageOccupiedFort(fort, { hull: 0, rigging: 0, crew: 100_000 });
  assert.ok(fort.condition.crew > COMBAT.surrenderCrewPct, `crew at ${fort.condition.crew}`);
  assert.equal(fort.status, "fighting");
  assert.equal(portClosed(fort), false);
});

test("S93: a yard that is already ours takes no siege damage", () => {
  const fort = createFortCombatant();
  const before = fortOccupierCondition(fort);
  const result = damageOccupiedFort(fort, { hull: 0, rigging: 0, crew: 100 });
  assert.equal(fortOccupierCondition(fort), before);
  assert.equal(result.casualties, 0);
});

test("S93: sieging a missing yard does not throw", () => {
  for (const broken of [null, undefined, {}]) {
    assert.equal(fortHeldByEnemy(broken), false);
    assert.equal(fortRecovered(broken), false);
    assert.equal(damageOccupiedFort(broken, { hull: 0, rigging: 0, crew: 10 }).casualties, 0);
  }
});

/* ---------------------------------------------------------------- they shoot back */

test("S93: the occupiers man their guns", () => {
  const fort = capturedYard();
  assert.ok(occupierReadyGuns(fort, "babor").length > 0, "a taken yard is not a silent one");
});

test("S93: a yard in our hands has no occupiers to fire", () => {
  const fort = createFortCombatant();
  assert.deepEqual(occupierReadyGuns(fort, "babor"), []);
  assert.equal(occupierFire(fort, "babor", 100, () => 0.5).volley.length, 0);
});

test("S93: their fire spends their rounds", () => {
  const fort = capturedYard();
  const ready = occupierReadyGuns(fort, "babor");
  const before = ready.map((p) => p.shotsLeft);
  const { volley } = occupierFire(fort, "babor", 100, () => 0.5);
  assert.ok(volley.length > 0);
  ready.forEach((p, index) => {
    assert.equal(p.shotsLeft, before[index] - 1);
  });
});
