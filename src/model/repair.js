/**
 * Repair: putting a damaged hull back together at the home port (S22, S40).
 *
 * The rules are pure so they can be tested without a browser, and the price is a
 * declared game convention (like every other price): the workbook has no repair data.
 *
 * The cost is a share of what the hull cost to build, and it is proportional to the
 * damage: putting a sound hull back to full costs nothing, a hull at half condition
 * costs half the share, a wreck costs the whole share. That way a big ship is
 * expensive to keep afloat and a small one is cheap, which is what the fleet is about.
 */

import { hullById } from "../data/naval-data.js";
import { normaliseGold } from "./economy.js";
import { withShipCondition } from "./fleet.js";

export const REPAIR = {
  /**
   * Share of the hull's own price that a full repair costs (S40). 0.2 means putting
   * a 5,000-doblón hull from wreck to full costs 1,000; from half condition, 500.
   */
  shareOfPrice: 0.2,
  /** Condition a repaired ship comes back with, per segment. */
  restored: 100,
  /**
   * The least a repair of a damaged hull can cost (S55). Damage below one doblón of
   * price still costs one, so a scratched hull is never repaired for free nor left
   * unfixable because its quote rounded to zero.
   */
  minCost: 1,
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

/**
 * How far below full a hull is, as 0..1 (S40). The worst segment decides: a hull with
 * a sound frame and a shredded rig still needs the whole careening.
 */
export function damageShare(ship) {
  const condition = conditionOf(ship);
  const worst = Math.min(...SEGMENTS.map((segment) => condition[segment]));
  return clamp((REPAIR.restored - worst) / REPAIR.restored, 0, 1);
}

/**
 * What this hull cost to build. `paidGold` is what the player actually paid and is
 * what the fee is based on; a hull from an older save without it falls back to its
 * hull price, so the dock still quotes something sane.
 */
export function shipValue(ship) {
  const paid = Number(ship?.paidGold);
  if (Number.isFinite(paid) && paid > 0) return paid;
  const price = Number(hullById(ship?.hullId)?.priceGold);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

/**
 * Cost of repairing one hull (S40): the share of its value that matches the damage.
 * Zero when there is nothing to repair, so the dock can say "she is sound", and at
 * least one doublón when there is damage (S55): a repair that rounds to nothing would
 * read as "no damage" everywhere and leave a scratched hull unfixable for free.
 */
export function repairCost(ship) {
  if (!needsRepair(ship)) return 0;
  return Math.max(REPAIR.minCost, Math.round(shipValue(ship) * REPAIR.shareOfPrice * damageShare(ship)));
}

/**
 * The price a repair offer shows (S45): never more than the gold the player has. A short
 * purse buys a part of the repair and spends all of it, so that is the price on the
 * button. A broken or negative purse shows 0, and so does a broken cost.
 */
export function priceWithPurse(cost, gold) {
  const price = Number(cost);
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.min(price, normaliseGold(gold));
}

/**
 * Repair one ship with the purse. Returns a verdict, the gold left and the
 * repaired ship; a short purse buys the same fraction of each missing segment.
 * Nothing is spent when the ship is sound or the purse is empty.
 */
export function repairShip(ship, gold) {
  const cost = repairCost(ship);
  // A purse can never be negative (S32): a corrupted save must not become a debt.
  const purse = normaliseGold(gold);

  if (cost === 0) {
    return { ship, repaired: false, reason: "no-damage", spent: 0, gold: purse, cost: 0 };
  }
  if (purse === 0) {
    return {
      ship,
      repaired: false,
      reason: "unaffordable",
      spent: 0,
      gold: 0,
      cost,
      missing: cost,
    };
  }

  if (purse < cost) {
    const fraction = purse / cost;
    const before = conditionOf(ship);
    const condition = Object.fromEntries(SEGMENTS.map((segment) => [
      segment, before[segment] + (REPAIR.restored - before[segment]) * fraction,
    ]));
    const survivors = crewAliveOf(ship);
    const crewAlive = Object.fromEntries(Object.entries(ship.crew ?? {}).map(([role, bought]) => {
      const limit = Math.max(0, Math.floor(Number(bought) || 0));
      const alive = clamp(Number(survivors[role]) || 0, 0, limit);
      return [role, Math.min(limit, Math.round(alive + (limit - alive) * fraction))];
    }));
    return {
      ship: { ...ship, condition, crewAlive },
      repaired: true,
      reason: "repaired",
      partial: true,
      fraction,
      spent: purse,
      gold: 0,
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
 * The ships the dock dialog offers for repair (S25): every damaged hull, the
 * captain included, because the dialog is the one place that shows them all side
 * by side. Sound hulls never appear.
 */
export function damagedShips(fleet) {
  return (fleet?.ships ?? []).filter((ship) => needsRepair(ship));
}

/** Men actually aboard across the combat roles. */
function menAboard(crew) {
  return ["marino", "artillero", "soldado", "remero"].reduce(
    (sum, role) => sum + (Number(crew?.[role]) || 0),
    0,
  );
}

/**
 * What the dock dialog tells the player about one hull (S25): the segments that
 * are below full, the crew as men alive out of the complement bought, and the
 * proportional cost of S40. Pure: the dialog renders it and never recomputes a rule.
 */
export function repairReport(ship) {
  const condition = conditionOf(ship);
  const alive = menAboard(crewAliveOf(ship));
  const bought = menAboard(ship?.crew ?? {});
  return {
    hull: condition.hull,
    rigging: condition.rigging,
    crew: condition.crew,
    morale: condition.morale,
    crewAlive: alive,
    crewBought: bought,
    damaged: SEGMENTS.filter((segment) => condition[segment] < REPAIR.restored),
    cost: repairCost(ship),
    /** 0..1 of the way to full, so the dock can show why the price is what it is. */
    damage: damageShare(ship),
    value: shipValue(ship),
  };
}

/**
 * Repair one fleet ship with the shared purse (S24). Same cost and same
 * verdicts as `repairShip`, but the repaired hull is written back into its own
 * fleet entry (S23), so the fix survives a change of captain and a reload. The
 * captain, the other hulls and the fleet itself are left exactly as they were.
 *
 * `allowCaptain` is the shipyard's door (S25): nobody sails there, so the captain
 * is repaired through her fleet entry like any other hull. The sea leaves it off,
 * because there the captain has a live combatant and goes through `repairShip`.
 */
export function repairFleetShip(fleet, shipId, gold, { allowCaptain = false } = {}) {
  const ships = fleet?.ships ?? [];
  const purse = normaliseGold(gold);
  const ship = ships.find((entry) => entry.id === shipId);

  if (!ship) return { fleet, gold: purse, repaired: false, reason: "unknown-ship", spent: 0 };
  if (ship.id === fleet?.captainId && !allowCaptain) {
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
    ...(result.partial ? { partial: true, fraction: result.fraction, missing: result.missing, cost: result.cost } : {}),
  };
}

/** The share of a hull's value a full repair costs; used by the HUD hint (S40). */
export function repairShareOfPrice() {
  return REPAIR.shareOfPrice;
}
