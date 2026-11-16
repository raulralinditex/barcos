/** Refit an owned hull without treating it as a new purchase (S50). */
import { hullPrice, normaliseGold, priceShip } from "./economy.js";
import { shipHold } from "./commerce.js";
import { crewAliveOf, hullValue } from "./repair.js";
import { buildShip, toRuntimeShip } from "./shipyard.js";

/**
 * `autoSave` is the "reforma automatica" switch: on (1) every change to a hull in the
 * refit editor is saved as it is made, off (0) the player saves with the button.
 */
export const REFIT = { refundShare: 0.5, autoSave: 1 };
const LINES = ["pieces", "shots", "crew", "provisions", "cargo", "ballast"];

/** Recover the bought loadout, not the remaining ammunition or living crew. */
export function configFromShip(ship) {
  return {
    hullId: ship.hullId,
    batteries: (ship.batteries ?? []).map((battery) => ({ ...battery })),
    crew: { ...(ship.crew ?? {}) },
    days: ship.days, cargoKg: ship.cargoKg, ballastKg: ship.ballastKg,
    equipmentKg: ship.equipmentKg, reserveKg: ship.reserveKg,
    name: ship.name,
  };
}

/** Compare the six catalogue lines; hull and unpriced equipment never change price. */
export function quoteRefit(ship, config, gold) {
  const built = buildShip({ ...config, hullId: ship.hullId });
  if (!built) return null;
  const before = priceShip(buildShip(configFromShip(ship)).config);
  let paid = 0;
  let removed = 0;
  for (const line of LINES) {
    const difference = built.price[line] - before[line];
    paid += Math.max(0, difference);
    removed += Math.max(0, -difference);
  }
  // The purse holds whole doblones: round against the player, so a refit can never be a
  // way to earn gold from price fractions. What was added is rounded up, what comes back
  // down.
  const EPSILON = 1e-9;
  const paidWhole = Math.ceil(paid - EPSILON);
  const refunded = Math.floor(removed * REFIT.refundShare + EPSILON);
  const net = paidWhole - refunded;
  const purse = gold === undefined || gold === null ? null : normaliseGold(gold);
  const affordable = purse === null || net <= purse;
  const issues = [...built.issues];
  if (!affordable) issues.unshift({
    level: "error", code: "unaffordable",
    params: { missing: Math.ceil(net - purse), total: Math.round(net), gold: Math.round(purse) },
  });
  const errors = issues.filter((issue) => issue.level === "error");
  return { built, paid: paidWhole, removed, refunded, net, affordable, feasible: errors.length === 0, issues, errors, warnings: issues.filter((issue) => issue.level === "warn") };
}

/** Apply only a valid, affordable quote. An invalid attempt changes nothing. */
export function applyRefit(ship, config, gold) {
  const purse = normaliseGold(gold);
  const quote = quoteRefit(ship, config, purse);
  if (!quote?.feasible) return { applied: false, ship, gold: purse, quote };
  const name = typeof config.name === "string" ? config.name : ship.name;
  const rebuilt = toRuntimeShip(quote.built, { name });
  const survivors = crewAliveOf(ship);
  // The merchandise stays aboard (S114): the rebuilt hull has none, and dropping it would
  // turn a bought cargo into loose weight nobody can sell. It only goes when the player
  // cut the cargo below what it weighs, because it no longer fits.
  const aboard = shipHold(ship);
  const keepsHold = aboard.manifest.length > 0 && aboard.cargoKg <= rebuilt.cargoKg;
  const crewAlive = Object.fromEntries(Object.entries(rebuilt.crew).map(([role, bought]) => {
    const oldBought = Math.max(0, Number(ship.crew?.[role]) || 0);
    const oldAlive = Math.max(0, Math.min(oldBought, Number(survivors[role]) || 0));
    return [role, Math.max(0, Math.min(bought, oldAlive + bought - oldBought))];
  }));
  return {
    applied: true, quote, gold: purse - quote.net,
    ship: {
      ...rebuilt, id: ship.id, country: ship.country, sails: ship.sails,
      ...(keepsHold ? { manifest: aboard.manifest } : {}),
      condition: { ...ship.condition }, crewAlive,
      // The stored value is the base one: her cargo is priced where it is measured, not
      // frozen into `paidGold`, or every reform would compound the surcharge (S111).
      paidGold: Math.max(hullPrice(ship.hullId), hullValue(ship) + quote.paid - quote.removed),
    },
  };
}
