/**
 * Mass, draft and speed model. This is a faithful port of the workbook formulas in
 * `05_Calculadora` and `06_Notas_y_formulas`; nothing here is a new physical claim.
 *
 * Workbook formulas ported verbatim (see odd/tasks/juego-barcos.md, S3):
 *   U        = desplazamiento_maximo - M0
 *   M_armas  = SUM qty_i * (montaje_i + disparos_i * (proyectil_i + polvora_i + otros_i))
 *   M_prov   = N * D * r / (1 - perdida)
 *   C_max    = U - M_armas - M_prov - E - B - R
 *   f        = (M_real - M0) / U
 *   T        = T_ref + (f - f_ref) * U / (densidad_agua * A_flotacion)
 *   V        = V_ref * (M_ref / M_actual) ^ beta
 *
 * The two derived reference values (V_ref, M_ref) are declared game conventions and
 * are returned with the metrics so the UI never presents them as history.
 */

import { CONVENTIONS, crewRoleById, pieceById } from "../data/naval-data.js";
import { gunnersRequired } from "./gunnery.js";

/** Shot mass in kg carried by one piece of a battery entry. */
export function shotMassKg(pieceId, shotsPerPiece) {
  const piece = pieceById(pieceId);
  if (!piece) return 0;
  return piece.shotKg * shotsPerPiece;
}

/** Mass of one gun with its carried powder and wads, in kg. */
export function pieceMassKg(pieceId, shotsPerPiece) {
  const piece = pieceById(pieceId);
  if (!piece) return 0;
  const perShot =
    piece.shotKg * (1 + CONVENTIONS.powderPerShotFraction + CONVENTIONS.otherPerShotFraction);
  return piece.mountKg + shotsPerPiece * perShot;
}

/** Total mass of all batteries in kg. */
export function batteryMassKg(batteries) {
  return batteries.reduce(
    (total, entry) => total + entry.qty * pieceMassKg(entry.pieceId, entry.shotsPerPiece),
    0,
  );
}

export function totalPieces(batteries) {
  return batteries.reduce((total, entry) => total + entry.qty, 0);
}

/**
 * Guns per broadside, plus the swivels apart (S20). A swivel rides on a rail, not
 * in a gun port, so it never uses up the per-side limit of the hull.
 */
export function piecesBySide(batteries) {
  const sides = { babor: 0, estribor: 0, swivel: 0 };
  for (const entry of batteries) {
    if (entry.side === "babor") sides.babor += entry.qty;
    if (entry.side === "estribor") sides.estribor += entry.qty;
    if (entry.side === "swivel") sides.swivel += entry.qty;
  }
  return sides;
}

/**
 * How many swivels a hull can carry. Game convention: half the gun ports of the
 * hull, rounded up, because every rail position costs a hand and a pivot post.
 */
export function maxSwivels(hull) {
  return Math.ceil((hull?.maxPiecesPerSide ?? 0) / 2);
}

/** Crew head count by role. */
export function crewCounts(crew) {
  const counts = { marino: 0, artillero: 0, soldado: 0, remero: 0 };
  for (const [role, qty] of Object.entries(crew)) {
    if (role in counts && Number.isFinite(qty)) counts[role] += qty;
  }
  return counts;
}

export function totalCrew(crew) {
  return Object.values(crewCounts(crew)).reduce((sum, n) => sum + n, 0);
}

export function crewMassKg(crew) {
  const counts = crewCounts(crew);
  return Object.entries(counts).reduce((sum, [role, qty]) => {
    const definition = crewRoleById(role);
    return sum + (definition ? qty * definition.massKg : 0);
  }, 0);
}

export function provisionsMassKg(people, days, loss = CONVENTIONS.provisionLoss) {
  if (people <= 0 || days <= 0) return 0;
  return (people * days * CONVENTIONS.rationKgPerDay) / (1 - loss);
}

/**
 * Reference speed at the reference load fraction, in knots.
 * Convention: V_ref = 0.62 * sqrt(length on the waterline in feet), the classic
 * displacement-hull relation scaled down to observed 16th-17th c. speeds.
 */
export function referenceSpeedKn(hull) {
  const feet = hull.lengthM * 3.28084;
  return 0.62 * Math.sqrt(feet);
}

/**
 * Core budget computation. Every input is explicit; nothing is inferred from the
 * hull except U (capacity) and the reference condition.
 */
export function computeBudget(input) {
  const {
    hull,
    batteries = [],
    crew = {},
    days = 0,
    cargoKg = 0,
    ballastKg = 0,
    equipmentKg = 0,
    reserveKg = 0,
    loss = CONVENTIONS.provisionLoss,
    density = CONVENTIONS.waterDensity,
  } = input;

  const people = totalCrew(crew);
  const capacityKg = hull.displacementKg - hull.lightMassKg;

  const armsKg = batteryMassKg(batteries);
  const crewKg = crewMassKg(crew);
  const provisionsKg = provisionsMassKg(people, days, loss);

  const budgetUsedKg = armsKg + provisionsKg + equipmentKg + ballastKg + reserveKg;
  const cargoMaxKg = capacityKg - budgetUsedKg;

  const realMassKg =
    hull.lightMassKg + crewKg + armsKg + provisionsKg + equipmentKg + ballastKg + cargoKg;

  const loadFraction = capacityKg > 0 ? (realMassKg - hull.lightMassKg) / capacityKg : 0;

  const draftM =
    hull.draftRefM +
    ((loadFraction - hull.draftRefFraction) * capacityKg) /
      (density * hull.waterplaneM2);

  const referenceMassKg = hull.lightMassKg + hull.draftRefFraction * capacityKg;
  const referenceKn = referenceSpeedKn(hull);
  const speedKn =
    realMassKg > 0 ? referenceKn * Math.pow(referenceMassKg / realMassKg, CONVENTIONS.beta) : 0;

  return {
    people,
    crewCounts: crewCounts(crew),
    capacityKg,
    armsKg,
    crewKg,
    provisionsKg,
    budgetUsedKg,
    cargoMaxKg,
    cargoKg,
    realMassKg,
    loadFraction,
    draftM,
    speedKn,
    reference: { referenceMassKg, referenceKn, draftRefM: hull.draftRefM },
    freeMassKg: capacityKg - (realMassKg - hull.lightMassKg),
  };
}

const ERROR = "error";
const WARN = "warn";

/**
 * Build one validation issue. The model reports a `code` plus the values it used;
 * the text lives in the translation catalogue (S11/S15), so a new message never
 * needs a change here beyond its code and params.
 */
const issue = (level, code, params = {}) => ({ level, code, params });

/**
 * Validate a configuration. Errors make the ship impossible; warnings let the player
 * sail a compromised hull, which is the point of a game about a budget.
 */
export function validateShip(input, budget = computeBudget(input)) {
  const { hull, batteries = [], crew = {}, days = 0 } = input;
  const issues = [];
  const counts = crewCounts(crew);

  if (budget.realMassKg > hull.displacementKg) {
    issues.push(
      issue(ERROR, "mass-exceeded", {
        mass: Math.round(budget.realMassKg),
        max: hull.displacementKg,
      }),
    );
  }

  if (budget.cargoMaxKg < 0) {
    issues.push(issue(ERROR, "no-cargo-room", { room: Math.round(budget.cargoMaxKg) }));
  }

  if (budget.draftM > hull.draftRefM + 0.9) {
    issues.push(issue(WARN, "deep-draft", { draft: budget.draftM.toFixed(2) }));
  }

  if (counts.marino < hull.crewMin) {
    issues.push(
      issue(ERROR, "crew-below-minimum", { count: counts.marino, needed: hull.crewMin }),
    );
  }

  const sides = piecesBySide(batteries);
  if (sides.babor > hull.maxPiecesPerSide || sides.estribor > hull.maxPiecesPerSide) {
    issues.push(
      issue(ERROR, "too-many-pieces", {
        max: hull.maxPiecesPerSide,
        babor: sides.babor,
        estribor: sides.estribor,
      }),
    );
  }

  if (sides.swivel > maxSwivels(hull)) {
    issues.push(
      issue(ERROR, "too-many-swivels", { count: sides.swivel, max: maxSwivels(hull) }),
    );
  }

  const pieces = totalPieces(batteries);
  const neededGunners = Math.ceil(gunnersRequired(batteries) - 1e-10);
  if (pieces > 0 && counts.artillero < neededGunners) {
    issues.push(
      issue(WARN, pieces === 1 ? "under-gunned-crew.one" : "under-gunned-crew.many", {
        pieces,
        needed: neededGunners,
        have: counts.artillero,
      }),
    );
  }

  // A swivel answers for either side, so it covers a side with no broadside (S20).
  const coverBabor = sides.babor + sides.swivel;
  const coverEstribor = sides.estribor + sides.swivel;
  if (pieces > 0 && (coverBabor === 0 || coverEstribor === 0)) {
    issues.push(
      issue(WARN, coverBabor === 0 ? "one-sided-battery.babor" : "one-sided-battery.estribor"),
    );
  }

  if (counts.remero > 0 && hull.id !== "galeaza") {
    issues.push(issue(WARN, "rowers-without-galley"));
  }

  if (days <= 0) {
    issues.push(issue(ERROR, "no-provisions"));
  } else if (days < 15) {
    issues.push(issue(WARN, "short-provisions", { days }));
  }

  if (counts.soldado === 0) {
    issues.push(issue(WARN, "no-soldiers"));
  }

  return {
    feasible: !issues.some((entry) => entry.level === ERROR),
    issues,
    errors: issues.filter((entry) => entry.level === ERROR),
    warnings: issues.filter((entry) => entry.level === WARN),
  };
}
