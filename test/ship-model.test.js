import test from "node:test";
import assert from "node:assert/strict";

import { CONVENTIONS, hullById, pieceById } from "../src/data/naval-data.js";
import {
  batteryMassKg,
  computeBudget,
  crewMassKg,
  pieceMassKg,
  piecesBySide,
  provisionsMassKg,
  referenceSpeedKn,
  totalCrew,
  validateShip,
} from "../src/model/ship-model.js";

const galeon = hullById("galeon-guerra");

/** A configuration that the workbook formulas say fits, used as the happy path. */
const fittingShip = () => ({
  hull: galeon,
  batteries: [
    { pieceId: "medio-canon-32", qty: 8, side: "babor", shotsPerPiece: 20 },
    { pieceId: "medio-canon-32", qty: 8, side: "estribor", shotsPerPiece: 20 },
    { pieceId: "minion", qty: 4, side: "babor", shotsPerPiece: 30 },
    { pieceId: "minion", qty: 4, side: "estribor", shotsPerPiece: 30 },
  ],
  crew: { marino: 90, artillero: 40, soldado: 60 },
  days: 60,
  cargoKg: 40_000,
  ballastKg: 15_000,
  equipmentKg: 12_000,
  reserveKg: 8_000,
});

test("S3: piece mass follows montaje + disparos*(proyectil+polvora+otros)", () => {
  const piece = pieceById("medio-canon-32");
  const shots = 20;
  const expected =
    piece.mountKg +
    shots * piece.shotKg * (1 + CONVENTIONS.powderPerShotFraction + CONVENTIONS.otherPerShotFraction);
  assert.equal(pieceMassKg("medio-canon-32", shots), expected);
  assert.equal(pieceMassKg("no-existe", 10), 0);
});

test("S3: battery mass sums every entry by quantity", () => {
  const single = pieceMassKg("minion", 30);
  assert.equal(
    batteryMassKg([
      { pieceId: "minion", qty: 4, shotsPerPiece: 30 },
      { pieceId: "minion", qty: 4, shotsPerPiece: 30 },
    ]),
    single * 8,
  );
  assert.equal(batteryMassKg([]), 0);
});

test("S3: provisions scale with people, days and the spoilage fraction", () => {
  const people = 190;
  const days = 60;
  const loss = 0.12;
  const expected = (people * days * CONVENTIONS.rationKgPerDay) / (1 - loss);
  assert.equal(provisionsMassKg(people, days, loss), expected);
  assert.equal(provisionsMassKg(0, 60, loss), 0);
  assert.equal(provisionsMassKg(190, 0, loss), 0);
});

test("S3: crew mass counts each role with its own mass", () => {
  assert.equal(totalCrew({ marino: 90, artillero: 40, soldado: 60 }), 190);
  assert.equal(crewMassKg({ marino: 90, artillero: 40, soldado: 60 }), 190 * 80);
  assert.equal(crewMassKg({}), 0);
});

test("S3: capacity is displacement minus the light hull", () => {
  const budget = computeBudget(fittingShip());
  assert.equal(budget.capacityKg, galeon.displacementKg - galeon.lightMassKg);
  assert.equal(budget.people, 190);
});

test("S3: C_max = U - armas - provisiones - E - B - R", () => {
  const ship = fittingShip();
  const budget = computeBudget(ship);
  const expected =
    budget.capacityKg -
    (budget.armsKg + budget.provisionsKg + ship.equipmentKg + ship.ballastKg + ship.reserveKg);
  assert.equal(budget.cargoMaxKg, expected);
});

test("S3: real mass excludes the reserve, which is budget and not weight", () => {
  const ship = fittingShip();
  const budget = computeBudget(ship);
  const expected =
    galeon.lightMassKg +
    budget.crewKg +
    budget.armsKg +
    budget.provisionsKg +
    ship.equipmentKg +
    ship.ballastKg +
    ship.cargoKg;
  assert.equal(budget.realMassKg, expected);
  assert.ok(!Number.isNaN(budget.realMassKg));
});

test("S3: load fraction is added mass over capacity", () => {
  const budget = computeBudget(fittingShip());
  const expected = (budget.realMassKg - galeon.lightMassKg) / budget.capacityKg;
  assert.equal(budget.loadFraction, expected);
});

test("S3: draft moves linearly from the reference condition", () => {
  const ship = fittingShip();
  const budget = computeBudget(ship);
  const expected =
    galeon.draftRefM +
    ((budget.loadFraction - galeon.draftRefFraction) * budget.capacityKg) /
      (CONVENTIONS.waterDensity * galeon.waterplaneM2);
  assert.equal(budget.draftM, expected);
});

test("S3: speed falls with mass using the calibrated exponent", () => {
  const light = computeBudget({ ...fittingShip(), cargoKg: 0, ballastKg: 0 });
  const heavy = computeBudget({ ...fittingShip(), cargoKg: 120_000, ballastKg: 40_000 });
  assert.ok(heavy.speedKn < light.speedKn, "a heavier ship must be slower");
  const expected =
    light.reference.referenceKn *
    Math.pow(light.reference.referenceMassKg / heavy.realMassKg, CONVENTIONS.beta);
  assert.equal(heavy.speedKn, expected);
});

test("S3: reference speed is a displacement-hull relation on waterline length", () => {
  const expected = 0.62 * Math.sqrt(galeon.lengthM * 3.28084);
  assert.equal(referenceSpeedKn(galeon), expected);
});

test("S4: batteries are counted per side", () => {
  const sides = piecesBySide(fittingShip().batteries);
  assert.deepEqual(sides, { babor: 12, estribor: 12 });
});

test("validate: a fitting ship sails with no errors", () => {
  const ship = fittingShip();
  const verdict = validateShip(ship);
  assert.equal(verdict.feasible, true, JSON.stringify(verdict.errors));
  assert.equal(verdict.errors.length, 0);
});

test("validate: exceeding displacement is an error naming both masses", () => {
  const ship = { ...fittingShip(), cargoKg: 5_000_000 };
  const verdict = validateShip(ship);
  assert.equal(verdict.feasible, false);
  const issue = verdict.errors.find((e) => e.code === "mass-exceeded");
  assert.ok(issue, "mass-exceeded must be reported");
  assert.match(issue.message, /desplazamiento máximo/);
});

test("validate: a hull without enough sailors cannot manoeuvre", () => {
  const ship = { ...fittingShip(), crew: { marino: 5, artillero: 40, soldado: 60 } };
  const verdict = validateShip(ship);
  assert.equal(verdict.feasible, false);
  assert.ok(verdict.errors.some((e) => e.code === "crew-below-minimum"));
});

test("validate: more pieces per side than the hull allows is an error", () => {
  const ship = {
    ...fittingShip(),
    batteries: [
      { pieceId: "minion", qty: galeon.maxPiecesPerSide + 1, side: "babor", shotsPerPiece: 10 },
      { pieceId: "minion", qty: 4, side: "estribor", shotsPerPiece: 10 },
    ],
  };
  const verdict = validateShip(ship);
  assert.equal(verdict.feasible, false);
  assert.ok(verdict.errors.some((e) => e.code === "too-many-pieces"));
});

test("validate: a one-sided battery is a warning, not a blocker", () => {
  const ship = {
    ...fittingShip(),
    batteries: [{ pieceId: "medio-canon-32", qty: 10, side: "babor", shotsPerPiece: 20 }],
  };
  const verdict = validateShip(ship);
  assert.ok(verdict.warnings.some((w) => w.code === "one-sided-battery"));
  assert.equal(verdict.feasible, true);
});

test("validate: sailing without provisions is an error", () => {
  const verdict = validateShip({ ...fittingShip(), days: 0 });
  assert.equal(verdict.feasible, false);
  assert.ok(verdict.errors.some((e) => e.code === "no-provisions"));
});

test("validate: rowers on a hull without oars are only a warning", () => {
  const verdict = validateShip({
    ...fittingShip(),
    crew: { marino: 90, artillero: 40, soldado: 60, remero: 20 },
  });
  assert.ok(verdict.warnings.some((w) => w.code === "rowers-without-galley"));
});

test("validate: a galeaza may carry rowers without that warning", () => {
  const galeaza = hullById("galeaza");
  const verdict = validateShip({
    hull: galeaza,
    batteries: [{ pieceId: "media-culebrina-9", qty: 6, side: "babor", shotsPerPiece: 12 }],
    crew: { marino: 120, artillero: 20, soldado: 60, remero: 300 },
    days: 40,
    cargoKg: 20_000,
  });
  assert.ok(!verdict.warnings.some((w) => w.code === "rowers-without-galley"));
  assert.equal(verdict.feasible, true, JSON.stringify(verdict.errors));
});
