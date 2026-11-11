/**
 * Economy: turns a gold budget into a hull, ordnance, crew, provisions and cargo.
 *
 * Prices are game values, not historical ones. The workbook gives no monetary data,
 * so every price here is a declared convention chosen so that STARTING_GOLD buys a
 * mid-sized armed ship and a flagship stays out of reach at the start.
 */

import {
  AMMO,
  CONVENTIONS,
  CREW_ROLES,
  HULLS,
  PIECES,
  PRICES,
  ammoById,
  crewRoleById,
  hullById,
  pieceById,
} from "../data/naval-data.js";

/** Gold for the hull alone, scaled by its arqueo range. */
export function hullPrice(hullId) {
  const hull = hullById(hullId);
  return hull ? hull.priceGold : 0;
}

export function piecesPrice(batteries) {
  return batteries.reduce((total, entry) => {
    const piece = pieceById(entry.pieceId);
    return total + (piece ? piece.priceGold * entry.qty : 0);
  }, 0);
}

/**
 * Ammunition cost. A shot's gold price is its declared price plus the powder it burns,
 * so a heavy 60-pounder is dramatically more expensive per shot than a falconete.
 */
export function ammoPrice(ammoId) {
  const ammo = ammoById(ammoId);
  if (!ammo) return 0;
  const pieceShotMass = ammo.massFactor;
  return ammo.pricePerShotGold + pieceShotMass * CONVENTIONS.powderPerShotFraction * PRICES.powderGoldPerKg;
}

/** Cost of the carried shot: shotsPerPiece per gun, priced by that gun's ammunition. */
export function shotStockPrice(batteries) {
  return batteries.reduce((total, entry) => {
    const piece = pieceById(entry.pieceId);
    if (!piece) return total;
    const ammo = ammoById(entry.ammoId ?? piece.ammo[0]);
    if (!ammo) return total;
    const perShot = ammo.pricePerShotGold + piece.shotKg * CONVENTIONS.powderPerShotFraction * PRICES.powderGoldPerKg;
    return total + perShot * entry.qty * entry.shotsPerPiece;
  }, 0);
}

export function crewHirePrice(crew) {
  return Object.entries(crew).reduce((total, [role, qty]) => {
    const definition = crewRoleById(role);
    return total + (definition ? definition.hireGold * qty : 0);
  }, 0);
}

export function provisionsPrice(people, days) {
  return people * days * PRICES.provisionGoldPerPersonDay;
}

export function cargoPrice(cargoKg) {
  return cargoKg * PRICES.cargoGoldPerKg;
}

export function ballastPrice(ballastKg) {
  return ballastKg * PRICES.ballastGoldPerKg;
}

/**
 * Full price breakdown for a configuration. `total` is what the shipyard charges
 * before any validation: an unaffordable or unseaworthy ship still has a price.
 */
export function priceShip(config) {
  const hull = hullPrice(config.hullId);
  const pieces = piecesPrice(config.batteries ?? []);
  const shots = shotStockPrice(config.batteries ?? []);
  const crew = crewHirePrice(config.crew ?? {});
  const people = Object.values(config.crew ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
  const provisions = provisionsPrice(people, config.days ?? 0);
  const cargo = cargoPrice(config.cargoKg ?? 0);
  const ballast = ballastPrice(config.ballastKg ?? 0);

  return {
    hull,
    pieces,
    shots,
    crew,
    provisions,
    cargo,
    ballast,
    total: hull + pieces + shots + crew + provisions + cargo + ballast,
  };
}

/** Daily upkeep: wages plus a small hull maintenance charge. */
export function dailyUpkeep(crew, hullId) {
  const wages = Object.entries(crew ?? {}).reduce((total, [role, qty]) => {
    const definition = crewRoleById(role);
    return total + (definition ? definition.wageGoldPerDay * qty : 0);
  }, 0);
  const hull = hullById(hullId);
  const maintenance = hull ? Math.round(hull.displacementKg / 90_000) : 0;
  return Math.round((wages + maintenance) * 100) / 100;
}

/**
 * Cheapest possible seaworthy ship for a hull, used by the UI to show "from X gold"
 * and by the tests to prove a starter budget is actually playable.
 */
export function minimumShipPrice(hullId) {
  const hull = hullById(hullId);
  if (!hull) return 0;
  const cheapestPiece = [...PIECES].sort((a, b) => a.priceGold - b.priceGold)[0];
  const batteries = [
    { pieceId: cheapestPiece.id, qty: 1, side: "babor", shotsPerPiece: 10, ammoId: "bala-hierro" },
    { pieceId: cheapestPiece.id, qty: 1, side: "estribor", shotsPerPiece: 10, ammoId: "bala-hierro" },
  ];
  const crew = { marino: hull.crewMin, artillero: 2, soldado: 10 };
  return priceShip({ hullId, batteries, crew, days: 30, cargoKg: 0, ballastKg: 0 }).total;
}

export { AMMO, CREW_ROLES, HULLS, PIECES, PRICES };
