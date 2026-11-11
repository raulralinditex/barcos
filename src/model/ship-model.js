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

export function piecesBySide(batteries) {
  const sides = { babor: 0, estribor: 0 };
  for (const entry of batteries) {
    if (entry.side === "babor") sides.babor += entry.qty;
    if (entry.side === "estribor") sides.estribor += entry.qty;
  }
  return sides;
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
 * Validate a configuration. Errors make the ship impossible; warnings let the player
 * sail a compromised hull, which is the point of a game about a budget.
 */
export function validateShip(input, budget = computeBudget(input)) {
  const { hull, batteries = [], crew = {}, days = 0 } = input;
  const issues = [];
  const counts = crewCounts(crew);

  if (budget.realMassKg > hull.displacementKg) {
    issues.push({
      level: ERROR,
      code: "mass-exceeded",
      message:
        `La masa total (${Math.round(budget.realMassKg)} kg) supera el desplazamiento máximo ` +
        `(${hull.displacementKg} kg). Quitá carga, piezas o gente.`,
    });
  }

  if (budget.cargoMaxKg < 0) {
    issues.push({
      level: ERROR,
      code: "no-cargo-room",
      message:
        `La configuración ya no deja hueco para mercancía ` +
        `(${Math.round(budget.cargoMaxKg)} kg). El casco no admite más peso.`,
    });
  }

  if (budget.draftM > hull.draftRefM + 0.9) {
    issues.push({
      level: WARN,
      code: "deep-draft",
      message:
        `Calado estimado ${budget.draftM.toFixed(2)} m: demasiado profundo para aguas costeras.`,
    });
  }

  if (counts.marino < hull.crewMin) {
    issues.push({
      level: ERROR,
      code: "crew-below-minimum",
      message: `Faltan marinos: ${counts.marino} de ${hull.crewMin} necesarios para maniobrar.`,
    });
  }

  const sides = piecesBySide(batteries);
  if (sides.babor > hull.maxPiecesPerSide || sides.estribor > hull.maxPiecesPerSide) {
    issues.push({
      level: ERROR,
      code: "too-many-pieces",
      message:
        `Demasiadas piezas por costado (máximo ${hull.maxPiecesPerSide}). ` +
        `Babor ${sides.babor}, estribor ${sides.estribor}.`,
    });
  }

  const pieces = totalPieces(batteries);
  const neededGunners = Math.ceil(pieces / 2);
  if (pieces > 0 && counts.artillero < neededGunners) {
    issues.push({
      level: WARN,
      code: "under-gunned-crew",
      message:
        `${pieces} ${pieces === 1 ? "pieza necesita" : "piezas necesitan"} al menos ` +
        `${neededGunners} ${neededGunners === 1 ? "artillero" : "artilleros"}; ` +
        `hay ${counts.artillero}. Las recargas serán más lentas.`,
    });
  }

  if (pieces > 0 && (sides.babor === 0 || sides.estribor === 0)) {
    issues.push({
      level: WARN,
      code: "one-sided-battery",
      message:
        sides.babor === 0
          ? "Sin piezas a babor: un enemigo por ese costado no recibirá respuesta."
          : "Sin piezas a estribor: un enemigo por ese costado no recibirá respuesta.",
    });
  }

  if (counts.remero > 0 && hull.id !== "galeaza") {
    issues.push({
      level: WARN,
      code: "rowers-without-galley",
      message: "Este casco no lleva remos; los remeros solo ocupan masa y provisiones.",
    });
  }

  if (days <= 0) {
    issues.push({
      level: ERROR,
      code: "no-provisions",
      message: "Sin días de provisión el barco no puede zarpar.",
    });
  } else if (days < 15) {
    issues.push({
      level: WARN,
      code: "short-provisions",
      message: `${days} días de provisión: no alcanza para cruzar a mar abierto.`,
    });
  }

  if (counts.soldado === 0) {
    issues.push({
      level: WARN,
      code: "no-soldiers",
      message: "Sin soldados no podés abordar una presa ni defender la cubierta.",
    });
  }

  return {
    feasible: !issues.some((issue) => issue.level === ERROR),
    issues,
    errors: issues.filter((issue) => issue.level === ERROR),
    warnings: issues.filter((issue) => issue.level === WARN),
  };
}
