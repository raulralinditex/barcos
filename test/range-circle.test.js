/**
 * S68: the range circle, and the effective range it has to tell the truth about.
 *
 * The catalogue already declared a `rangeFactor` per ammunition — chain shot and
 * hailshot do not carry as far as iron — but nothing read it, so the range a gun could
 * actually reach ignored the round it was loaded with. A circle drawn from the piece's
 * bare range would have painted that same lie on the water. So the range is fixed first
 * and the circle is drawn from the real number.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  effectiveRangeM,
  firingPieces,
  hitProbability,
  rangeCircleM,
  sideRangeM,
  createPlayerCombatant,
} from "../src/model/combat.js";
import { ammoById, pieceById } from "../src/data/naval-data.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { SETTINGS_FIELDS, applySettings, fieldId, resetSettings } from "../src/model/settings.js";

const withDefaults = (body) => {
  try {
    body();
  } finally {
    resetSettings();
  }
};

const runtime = (batteries) =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "galeon-pequeno",
        batteries,
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 6000,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      12000,
    ),
    { name: "Golden Hind" },
  );

/* ---------------------------------------------------------------- the real range */

test("S68: iron carries the gun's full range", () => {
  const piece = pieceById("media-culebrina-9");
  assert.equal(effectiveRangeM(piece, "bala-hierro"), piece.rangeM);
});

test("S68: chain shot and hailshot do not carry as far as iron", () => {
  const piece = pieceById("media-culebrina-9");
  const iron = effectiveRangeM(piece, "bala-hierro");
  const chain = effectiveRangeM(piece, "cadena");
  const hail = effectiveRangeM(piece, "metralla");
  assert.ok(chain < iron, `chain ${chain} should be shorter than iron ${iron}`);
  assert.ok(hail < chain, `hailshot ${hail} should be the shortest`);
  assert.ok(Math.abs(chain - piece.rangeM * ammoById("cadena").rangeFactor) < 1e-9);
});

test("S68: a round the piece cannot fire falls back to its full range", () => {
  // Fail open here, not closed: this only draws and gates range, and a gun asked about a
  // round it does not carry must not silently become useless.
  const piece = pieceById("medio-canon-32");
  assert.equal(effectiveRangeM(piece, "cadena"), piece.rangeM);
  assert.equal(effectiveRangeM(piece, "no-existe"), piece.rangeM);
  assert.equal(effectiveRangeM(piece, null), piece.rangeM);
});

test("S68: a broken piece or round never produces NaN", () => {
  for (const [piece, ammo] of [[null, "bala-hierro"], [undefined, "cadena"], [{}, "metralla"]]) {
    const range = effectiveRangeM(piece, ammo);
    assert.ok(Number.isFinite(range), `piece ${String(piece)} gave ${range}`);
  }
});

test("S68: hit probability follows the round that is loaded", () => {
  const piece = pieceById("media-culebrina-9");
  const chainRange = effectiveRangeM(piece, "cadena");
  const ironRange = effectiveRangeM(piece, "bala-hierro");

  // A distance the iron reaches and the chain shot does not.
  const far = (ironRange + chainRange) / 2;
  assert.ok(hitProbability(piece, far, 1) > 0, "iron reaches it");
  assert.equal(hitProbability(piece, far, 1, "cadena"), 0, "chain shot does not");
  assert.ok(hitProbability(piece, far, 1, "bala-hierro") > 0);
});

test("S68: the guns that can fire at a distance follow the round too", () => {
  const combatant = createPlayerCombatant(
    runtime([
      { pieceId: "media-culebrina-9", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
    ]),
  );
  const piece = pieceById("media-culebrina-9");
  const far = piece.rangeM * 0.8;
  assert.ok(firingPieces(combatant, "babor", far).length > 0, "iron reaches 80 % of the range");

  combatant.pieces.forEach((p) => {
    p.ammoId = "cadena";
    p.reloadTimer = 0;
  });
  assert.equal(firingPieces(combatant, "babor", far).length, 0, "chain shot cannot");
});

/* ---------------------------------------------------------------- the circle */

test("S68: the circle is drawn at the shortest gun of the beam", () => {
  const combatant = createPlayerCombatant(
    runtime([
      { pieceId: "media-culebrina-9", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
      { pieceId: "falconete", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
    ]),
  );
  const expected = Math.min(
    pieceById("media-culebrina-9").rangeM,
    pieceById("falconete").rangeM,
  );
  assert.equal(sideRangeM(combatant, "babor"), expected, "the circle must not promise the short gun's reach");
});

test("S68: the circle follows the round loaded in that beam", () => {
  const combatant = createPlayerCombatant(
    runtime([{ pieceId: "media-culebrina-9", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" }]),
  );
  const iron = sideRangeM(combatant, "babor");
  combatant.pieces.forEach((p) => {
    p.ammoId = "metralla";
  });
  const hail = sideRangeM(combatant, "babor");
  assert.ok(hail < iron, `hailshot ${hail} should shrink the circle from ${iron}`);
});

test("S68: a beam with no guns has no circle", () => {
  const combatant = createPlayerCombatant(
    runtime([{ pieceId: "media-culebrina-9", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" }]),
  );
  assert.equal(sideRangeM(combatant, "estribor"), 0);
});

test("S68: the swivels answer for the beam, like they do for everything else", () => {
  const combatant = createPlayerCombatant(
    runtime([
      { pieceId: "media-culebrina-9", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
      { pieceId: "verso", qty: 1, side: "swivel", shotsPerPiece: 40, ammoId: "metralla" },
    ]),
  );
  // The swivel is short-ranged, so it decides the circle of whichever beam it answers.
  // Hailshot is the verso's own round, so its 180 m are the hailshot range itself (S68).
  assert.ok(sideRangeM(combatant, "babor") <= pieceById("verso").rangeM + 1e-9);
});

test("S68: the circle can be hidden, and that is a setting", () => {
  const field = SETTINGS_FIELDS.find((entry) => fieldId(entry) === "combat.showRange");
  assert.ok(field, "the range circle must be switchable");
  withDefaults(() => {
    applySettings({ "combat.showRange": 1 });
    assert.equal(rangeCircleM(createPlayerCombatant(runtime([
      { pieceId: "media-culebrina-9", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
    ])), "babor"), sideRangeM(createPlayerCombatant(runtime([
      { pieceId: "media-culebrina-9", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
    ])), "babor"));

    applySettings({ "combat.showRange": 0 });
    assert.equal(rangeCircleM(createPlayerCombatant(runtime([
      { pieceId: "media-culebrina-9", qty: 1, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
    ])), "babor"), 0, "a hidden circle has no radius to draw");
  });
});

test("S68: the setting ships switched on", () => {
  assert.equal(SETTINGS_FIELDS.find((entry) => fieldId(entry) === "combat.showRange").max, 1);
  const shipped = SETTINGS_FIELDS.find((entry) => fieldId(entry) === "combat.showRange");
  assert.ok(shipped.min <= 0 && shipped.max >= 1, "the switch must be able to be both");
});
