/**
 * Shipyard: the only place that turns a player configuration into a ship.
 *
 * It is the join between three independent pieces, and it keeps them independent:
 *   economy.js     -> what it costs
 *   ship-model.js  -> what it weighs, how deep it floats, how fast it sails
 *   naval-data.js  -> what the workbook actually says
 *
 * The shipyard never rejects a configuration by price alone; affordability is a
 * separate verdict so the player can see a ship they cannot buy yet.
 */

import { ammoById, hullById, pieceById } from "../data/naval-data.js";
import { priceShip, dailyUpkeep } from "./economy.js";
import { computeBudget, piecesBySide, totalPieces, validateShip } from "./ship-model.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

/**
 * Normalise a loose player configuration into the exact shape the model expects.
 * Unknown hulls and pieces are dropped instead of silently producing NaN mass.
 */
export function normaliseConfig(config) {
  const hull = hullById(config.hullId);

  const batteries = (config.batteries ?? [])
    .map((entry) => {
      const piece = pieceById(entry.pieceId);
      if (!piece) return null;
      const ammoId = piece.ammo.includes(entry.ammoId) ? entry.ammoId : piece.ammo[0];
      return {
        pieceId: piece.id,
        qty: Math.max(0, Math.floor(Number(entry.qty) || 0)),
        // A swivel is always a swivel; a fixed gun is port or starboard, never both (S20).
        side: piece.swivel ? "swivel" : entry.side === "estribor" ? "estribor" : "babor",
        shotsPerPiece: Math.max(0, Math.floor(Number(entry.shotsPerPiece) || 0)),
        ammoId,
      };
    })
    .filter((entry) => entry && entry.qty > 0);

  const crew = {};
  for (const [role, qty] of Object.entries(config.crew ?? {})) {
    const clean = Math.max(0, Math.floor(Number(qty) || 0));
    if (clean > 0) crew[role] = clean;
  }

  return {
    hullId: hull ? hull.id : null,
    batteries,
    crew,
    days: Math.max(0, Math.floor(Number(config.days) || 0)),
    cargoKg: Math.max(0, Math.round(Number(config.cargoKg) || 0)),
    ballastKg: Math.max(0, Math.round(Number(config.ballastKg) || 0)),
    equipmentKg: Math.max(0, Math.round(Number(config.equipmentKg) || 0)),
    reserveKg: Math.max(0, Math.round(Number(config.reserveKg) || 0)),
  };
}

/**
 * Build a ship. Returns `null` when the hull is unknown, because a ship without a
 * hull is not a ship; every other problem is reported as a verdict instead.
 */
export function buildShip(config, gold) {
  const clean = normaliseConfig(config);
  const hull = hullById(clean.hullId);
  if (!hull) return null;

  const modelInput = {
    hull,
    batteries: clean.batteries,
    crew: clean.crew,
    days: clean.days,
    cargoKg: clean.cargoKg,
    ballastKg: clean.ballastKg,
    equipmentKg: clean.equipmentKg,
    reserveKg: clean.reserveKg,
  };

  const budget = computeBudget(modelInput);
  const structural = validateShip(modelInput, budget);
  const price = priceShip(clean);

  const affordable = gold === undefined || gold === null ? true : price.total <= gold;
  const issues = [...structural.issues];
  if (!affordable) {
    issues.unshift({
      level: "error",
      code: "unaffordable",
      params: {
        missing: Math.ceil(price.total - gold),
        total: Math.round(price.total),
        gold: Math.round(gold),
      },
    });
  }

  return {
    hull,
    config: clean,
    budget,
    price,
    upkeep: dailyUpkeep(clean.crew, hull.id),
    affordable,
    feasible: structural.feasible && affordable,
    issues,
    errors: issues.filter((issue) => issue.level === "error"),
    warnings: issues.filter((issue) => issue.level === "warn"),
    guns: {
      total: totalPieces(clean.batteries),
      sides: piecesBySide(clean.batteries),
    },
    shotStock: clean.batteries.map((entry) => ({
      pieceId: entry.pieceId,
      ammoId: entry.ammoId,
      ammoName: ammoById(entry.ammoId)?.name ?? entry.ammoId,
      rounds: entry.qty * entry.shotsPerPiece,
      perGun: entry.shotsPerPiece,
    })),
  };
}

/** Serialise a built ship into the runtime shape the sailing phase will mutate. */
export function toRuntimeShip(ship, { name = "Sin nombre" } = {}) {
  const { hull, budget, config } = ship;
  return {
    id: `ship-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name,
    hullId: hull.id,
    hullName: hull.name,
    hullType: hull.type,
    country: hull.country,
    date: hull.date,
    maxDisplacementKg: hull.displacementKg,
    lightMassKg: hull.lightMassKg,
    draftRefM: hull.draftRefM,
    draftSource: hull.draftSource,
    maxPiecesPerSide: hull.maxPiecesPerSide,
    loadFraction: budget.loadFraction,
    draftM: budget.draftM,
    speedKn: budget.speedKn,
    capacityKg: budget.capacityKg,
    realMassKg: budget.realMassKg,
    cargoKg: config.cargoKg,
    ballastKg: config.ballastKg,
    equipmentKg: config.equipmentKg,
    reserveKg: config.reserveKg,
    days: config.days,
    crew: clone(config.crew),
    people: budget.people,
    batteries: clone(config.batteries),
    guns: { total: ship.guns.total, sides: clone(ship.guns.sides) },
    shotStock: clone(ship.shotStock),
    condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
    upkeep: ship.upkeep,
    paidGold: ship.price.total,
  };
}
