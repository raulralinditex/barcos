import test from "node:test";
import assert from "node:assert/strict";
import {
  BOARDING,
  boardingOdds,
  canBoard,
  deckFire,
  garrisonSurrenderPct,
  soldiersAboard,
} from "../src/model/boarding.js";

/**
 * S160: the soldiers earn their keep.
 *
 * The player asked for it (verbatim): "vamos a darles una mecanica a los soldados", and chose
 * all three of the offered mechanics: "las tres". On the capture, which today demands nothing:
 * "Sí: la captura pasa a exigir soldados".
 *
 * The three are one number: the soldiers you carry are the ones who board, the ones who shoot
 * from the deck and the ones who hold your own deck against a boarding.
 */

const combatant = (extra = {}) => ({
  crew: { marino: 20, artillero: 6, soldado: 10 },
  crewMin: 20,
  initialCrew: 36,
  condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
  status: "fighting",
  ...extra,
});

/* ------------------------------------------------------- S160-C: deck fire */

test("S160-C: soldiers aboard fire light arms, and only inside their own reach", () => {
  const ship = combatant();
  const near = deckFire(ship, 80);
  const far = deckFire(ship, BOARDING.deckRangeM + 1);

  assert.ok(near.crew > 0, "soldiers in range must put fire on the enemy deck");
  assert.equal(near.hull, 0, "a musket does not hole a hull");
  assert.equal(far.crew, 0, "outside their reach they hit nothing");
  assert.equal(far.hull, 0);
  assert.equal(far.rigging, 0);
});

test("S160-C: a hull with no soldiers puts no deck fire, and no soldiers means no fire", () => {
  const empty = combatant({ crew: { marino: 20, artillero: 6, soldado: 0 } });
  const fire = deckFire(empty, 60);
  assert.equal(fire.crew, 0);
  assert.equal(fire.hull, 0);
  assert.equal(fire.rigging, 0);
  // A broken record never throws and never invents damage.
  for (const broken of [null, {}, { crew: null }, { crew: { soldado: "muchos" } }]) {
    assert.doesNotThrow(() => deckFire(broken, 60));
    assert.equal(deckFire(broken, 60).crew, 0);
  }
});

test("S160-C: more soldiers hit harder, and the fire is capped", () => {
  const few = deckFire(combatant({ crew: { soldado: 5 } }), 60);
  const many = deckFire(combatant({ crew: { soldado: 60 } }), 60);
  const absurd = deckFire(combatant({ crew: { soldado: 5000 } }), 60);

  assert.ok(many.crew > few.crew, "more muskets must put more lead on the deck");
  assert.ok(absurd.crew <= BOARDING.deckFireMax, `the fire must have a declared ceiling, got ${absurd.crew}`);
});

test("S160-C: a dead or surrendered ship does not fire from her deck", () => {
  for (const status of ["sunk", "surrendered"]) {
    assert.equal(deckFire(combatant({ status }), 40).crew, 0);
  }
});

/* ------------------------------------------------- S160-D: your own garrison */

test("S160-D: soldiers aboard make a hull harder to break, and a broken crew surrenders anyway", () => {
  const defended = garrisonSurrenderPct(combatant({ crew: { marino: 20, soldado: 40 } }));
  const bare = garrisonSurrenderPct(combatant({ crew: { marino: 20, soldado: 0 } }));

  assert.ok(defended < BOARDING.baseSurrenderPct, "soldiers must lower the threshold, not raise it");
  assert.equal(bare, BOARDING.baseSurrenderPct, "with no soldiers the hull breaks where it always did");
  // It has a floor: a hull full of soldiers still strikes at some point.
  const wall = garrisonSurrenderPct(combatant({ crew: { marino: 20, soldado: 100_000 } }));
  assert.ok(wall >= BOARDING.minSurrenderPct, `the threshold must have a floor, got ${wall}`);
});

test("S160-D: a broken garrison record changes nothing", () => {
  for (const broken of [null, {}, { crew: null }]) {
    assert.equal(garrisonSurrenderPct(broken), BOARDING.baseSurrenderPct);
  }
});

/* -------------------------------------------------------- S160-B: boarding */

test("S160-B: a prize needs soldiers, and the odds are the soldiers against her crew", () => {
  // A prize is a hull that has already struck her colours.
  const prize = combatant({ status: "surrendered", crew: { marino: 8, artillero: 2, soldado: 3 } });

  // No soldiers aboard: the prize is looted, never taken.
  const empty = canBoard(combatant({ crew: { marino: 20, artillero: 6, soldado: 0 } }), prize);
  assert.equal(empty.allowed, false);
  assert.equal(empty.reason, "no-soldiers");

  // Soldiers aboard, but not enough against what she still has on deck.
  const weak = canBoard(combatant({ crew: { soldado: 2 } }), prize);
  assert.equal(weak.allowed, false);
  assert.equal(weak.reason, "outnumbered");

  // Enough of them: the prize is taken.
  const strong = canBoard(combatant({ crew: { soldado: 40 } }), prize);
  assert.equal(strong.allowed, true);
  assert.equal(strong.reason, "taken");
});

test("S160-B: a hull still fighting or already sunk is no prize", () => {
  const mine = combatant({ crew: { soldado: 40 } });
  for (const status of ["fighting", "sunk"]) {
    const prize = combatant({ status });
    const result = canBoard(mine, prize);
    assert.equal(result.allowed, false, `a ${status} hull must not be boardable`);
  }
  assert.equal(canBoard(mine, combatant({ status: "surrendered" })).allowed, true);
  assert.equal(canBoard(mine, null).allowed, false);
  assert.equal(canBoard(null, combatant({ status: "surrendered" })).allowed, false);
});

test("S160-B: the odds read as a share, so the panel can say how close it was", () => {
  const prize = combatant({ crew: { marino: 10, artillero: 2, soldado: 4 } });
  const odds = boardingOdds(combatant({ crew: { soldado: 16 } }), prize);
  assert.ok(odds.ratio > 0, "the odds must be a real number");
  assert.equal(odds.mine, 16);
  assert.equal(odds.theirs, 16, "every man on her deck counts, not only her soldiers");
});

/* ------------------------------------------------------------- S160-E/F */

test("S160-E: the soldiers aboard are the one number all three mechanics read", () => {
  const ship = combatant({ crew: { marino: 20, artillero: 6, soldado: 12 } });
  assert.equal(soldiersAboard(ship), 12);
  assert.equal(soldiersAboard({ crew: { soldado: 0 } }), 0);
  assert.equal(soldiersAboard(null), 0);
  assert.equal(soldiersAboard({ crew: { soldado: 7.9 } }), 7);
});

test("S160-G: a hull with no soldiers behaves as it always did, minus the capture", () => {
  const bare = combatant({ crew: { marino: 20, artillero: 6, soldado: 0 } });
  // No deck fire, no garrison help, and no prize to take: exactly what the game did before.
  assert.equal(deckFire(bare, 30).crew, 0);
  assert.equal(garrisonSurrenderPct(bare), BOARDING.baseSurrenderPct);
  assert.equal(canBoard(bare, combatant({ crew: { soldado: 1 } })).allowed, false);
});
