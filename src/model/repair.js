/**
 * Repair: putting a damaged hull back together at the home port (S22).
 *
 * The rules are pure so they can be tested without a browser, and the fee is a
 * declared game convention (like every other price): the workbook has no repair
 * data. A flat fee keeps the decision readable at the dock — "can I afford to fix
 * her?" — instead of hiding it in a per-point formula the player cannot check.
 */

import { hullById } from "../data/naval-data.js";
import { withShipCondition } from "./fleet.js";

export const REPAIR = {
  /**
   * Gold for putting one hull back in fighting order, whatever the damage. Priced
   * so that a couple of prizes pays for it: a sunk zabra pays about 180 doblones
   * and the starting purse is 12000, so a flat 400 is a real decision but not a
   * wall. Hulls are charged the same because the work is the same: a careening,
   * a new spar and a recruiting party.
   */
  fee: 400,
  /** Condition a repaired ship comes back with, per segment. */
  restored: 100,
};

const SEGMENTS = ["hull", "rigging", "crew", "morale"];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Condition of a ship, tolerating a save written before it lived on the hull. */
export function conditionOf(ship) {
  const source = ship?.condition ?? {};
  const condition = {};
  for (const segment of SEGMENTS) {
    const value = Number(source[segment]);
    condition[segment] = Number.isFinite(value) ? clamp(value, 0, 100) : 100;
  }
  return condition;
}

/** The crew a ship can be brought back to: the survivors if known, else the bought one. */
export function crewAliveOf(ship) {
  if (ship?.crewAlive && typeof ship.crewAlive === "object") return { ...ship.crewAlive };
  return { ...(ship?.crew ?? {}) };
}

/** True when any segment is below full: hull, rigging, crew or morale. */
export function needsRepair(ship) {
  const condition = conditionOf(ship);
  return SEGMENTS.some((segment) => condition[segment] < REPAIR.restored);
}

/** Flat fee for a repair, or zero when there is nothing to repair. */
export function repairFee() {
  return REPAIR.fee;
}

export function repairCost(ship) {
  return needsRepair(ship) ? repairFee() : 0;
}

/**
 * Repair one ship with the purse. Returns a verdict, the gold left and the
 * repaired ship; nothing is spent and nothing changes when the ship is sound or
 * the purse is short.
 */
export function repairShip(ship, gold) {
  const cost = repairCost(ship);
  const purse = Number.isFinite(gold) ? gold : 0;

  if (cost === 0) {
    return { ship, repaired: false, reason: "no-damage", spent: 0, gold: purse, cost: 0 };
  }
  if (purse < cost) {
    return {
      ship,
      repaired: false,
      reason: "unaffordable",
      spent: 0,
      gold: purse,
      cost,
      missing: cost - purse,
    };
  }

  const condition = {};
  for (const segment of SEGMENTS) condition[segment] = REPAIR.restored;

  return {
    ship: {
      ...ship,
      condition,
      // A repaired hull sails with its full complement again: the dead are replaced.
      crewAlive: { ...(ship.crew ?? {}) },
    },
    repaired: true,
    reason: "repaired",
    spent: cost,
    gold: purse - cost,
    cost,
  };
}

/**
 * The ships the port list offers for repair (S24): the damaged hulls that are not
 * the captain. The captain is repaired with the R key, not from the fleet list, so
 * she is never listed twice.
 */
export function damagedFleetShips(fleet) {
  const ships = fleet?.ships ?? [];
  return ships.filter((ship) => ship.id !== fleet?.captainId && needsRepair(ship));
}

/**
 * Repair one fleet ship with the shared purse (S24). Same flat fee and same
 * verdicts as `repairShip`, but the repaired hull is written back into its own
 * fleet entry (S23), so the fix survives a change of captain and a reload. The
 * captain, the other hulls and the fleet itself are left exactly as they were.
 */
export function repairFleetShip(fleet, shipId, gold) {
  const ships = fleet?.ships ?? [];
  const purse = Number.isFinite(gold) ? gold : 0;
  const ship = ships.find((entry) => entry.id === shipId);

  if (!ship) return { fleet, gold: purse, repaired: false, reason: "unknown-ship", spent: 0 };
  if (ship.id === fleet?.captainId) {
    return { fleet, gold: purse, repaired: false, reason: "captain", spent: 0 };
  }

  const result = repairShip(ship, purse);
  if (!result.repaired) {
    return {
      fleet,
      gold: purse,
      repaired: false,
      reason: result.reason,
      spent: 0,
      ...(result.missing === undefined ? {} : { missing: result.missing }),
      cost: result.cost,
    };
  }

  return {
    fleet: withShipCondition(fleet, shipId, {
      condition: result.ship.condition,
      crewAlive: result.ship.crewAlive,
    }),
    gold: result.gold,
    repaired: true,
    reason: result.reason,
    spent: result.spent,
  };
}

/** Gold a hull's repair is worth as a share of its own price; used by the HUD hint. */
export function repairShareOfPrice(ship) {
  const hull = hullById(ship?.hullId);
  const price = hull?.priceGold ?? 0;
  return price > 0 ? repairFee() / price : 0;
}
