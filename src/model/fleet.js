/**
 * Fleet model: the ships the player owns and which one they captain (S7). *
 * Pure and storage-free: it takes a fleet value and returns a new one, so the
 * progression rules are testable without a browser. The UI owns persistence.
 *
 * A fleet is a plain object so it survives JSON round-trips unchanged:
 *   { ships: [runtimeShip, ...], captainId: string }
 *
 * The captain is the hull that sails when the player puts to sea. Every other
 * ship stays in port, keeping the hull, crew and loadout it was bought with.
 */

import { SHIPYARDS, shipyardAt, shipyardById } from "../data/naval-data.js";
import { holdOf } from "./commerce.js";
import { isWreck } from "./sinking.js";

const homeYardId = () => (SHIPYARDS.find((yard) => yard.home) ?? SHIPYARDS[0])?.id ?? null;

/** A missing or invalid location belongs to the home yard; explicit null is at sea. */
function yardOf(ship) {
  if (ship?.yardId === null) return null;
  return shipyardById(ship?.yardId)?.id ?? homeYardId();
}

/** Set a non-captain's yard, or clear it for sea. Unknown hulls and yards are refused. */
export function withShipYard(fleet, shipId, yardId) {
  const ships = fleet?.ships ?? [];
  if (!ships.some((ship) => ship.id === shipId) || (yardId !== null && !shipyardById(yardId))) return { ...fleet, ships };
  if (shipId === fleet?.captainId && yardId !== null) return { ...fleet, ships };
  return { ...fleet, ships: ships.map((ship) => ship.id === shipId ? { ...ship, yardId } : ship) };
}

/** The sea's observed position overrides only the captain's saved mooring (S130). */
export function reconcileCaptainPosition(fleet, position) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return fleet;
  const captain = captainShip(fleet);
  if (!captain || isWreck(captain)) return fleet;
  const yardId = shipyardAt(position)?.id ?? null;
  if (captain.yardId === yardId) return fleet;
  return {
    ...fleet,
    ships: fleet.ships.map((ship) => ship.id === captain.id ? { ...ship, yardId } : ship),
  };
}

/** Hulls actually moored at this yard, independent of their sailing checks. */
export function shipsAtYard(fleet, yardId) {
  if (!shipyardById(yardId)) return [];
  return (fleet?.ships ?? []).filter((ship) => yardOf(ship) === yardId);
}

/** Locals plus the captain's sailing squadron when she visits this yard. */
export function shipsAvailableAtYard(fleet, yardId, captainYardId) {
  if (!shipyardById(yardId)) return [];
  return (fleet?.ships ?? []).filter((ship) => yardOf(ship) === yardId ||
    (yardId === captainYardId && yardOf(ship) === null && !isWreck(ship) &&
      (ship.id === fleet?.captainId || ship.sails !== false)));
}

/** Sail local marked hulls and leave unmarked visitors at this yard. */
export function departYard(fleet, yardId) {
  const ships = fleet?.ships ?? [];
  if (!shipyardById(yardId)) return { ...fleet, ships };
  return { ...fleet, ships: ships.map((ship) => {
    const location = yardOf(ship);
    if (location !== yardId && location !== null) return ship;
    if (isWreck(ship)) return ship;
    return { ...ship, yardId: ship.id === fleet?.captainId || ship.sails !== false ? null : yardId };
  }) };
}

/** Only hulls that actually departed can join the captain at sea. */
export function shipsSailingAtSea(fleet) {
  return sailingShips(fleet).filter((ship) => yardOf(ship) === null && !isWreck(ship));
}

/**
 * Add a freshly launched ship to the fleet and make it the captain: buying a new
 * hull is how the player moves up, so it becomes the ship they sail out with.
 */
export function addShip(fleet, ship) {
  const ships = [...(fleet?.ships ?? []), ship];
  return { ships, captainId: ship.id };
}

/** Remove one ship. Losing the captain hands the fleet to the next hull in line. */
export function removeShip(fleet, shipId) {
  const ships = (fleet?.ships ?? []).filter((ship) => ship.id !== shipId);
  const captainId =
    fleet?.captainId === shipId ? (ships[0]?.id ?? null) : (fleet?.captainId ?? null);
  return { ships, captainId: ships.some((s) => s.id === captainId) ? captainId : (ships[0]?.id ?? null) };
}

/** Promote one ship to captain. Unknown ids are ignored instead of clearing the fleet. */
export function setCaptain(fleet, shipId) {
  const ships = fleet?.ships ?? [];
  if (!ships.some((ship) => ship.id === shipId)) return { ...fleet, ships };
  return { ships, captainId: shipId };
}

/**
 * Mark one hull to sail with the captain, or leave it in port (S35). The flag lives on
 * the fleet entry, so it is saved with the fleet and survives a reload. The captain is
 * never unmarked: she is the ship the player sails.
 */
export function withShipSailing(fleet, shipId, sails) {
  const ships = fleet?.ships ?? [];
  if (!ships.some((ship) => ship.id === shipId)) return { ...fleet, ships };
  if (shipId === fleet?.captainId) return { ...fleet, ships };
  return {
    ships: ships.map((ship) => (ship.id === shipId ? { ...ship, sails: Boolean(sails) } : ship)),
    captainId: fleet?.captainId ?? null,
  };
}

/** The hulls that put to sea: the captain and every other marked hull (S35). */
export function sailingShips(fleet) {
  const ships = fleet?.ships ?? [];
  const captain = captainShip(fleet);
  return ships.filter((ship) => ship.id === captain?.id || ship.sails !== false);
}

/** The ship the player actually sails. Null for an empty fleet. */
export function captainShip(fleet) {
  const ships = fleet?.ships ?? [];
  return ships.find((ship) => ship.id === fleet?.captainId) ?? ships[0] ?? null;
}

/**
 * The hull the market trades with: the one the player picked, else the captain. A wreck
 * cannot carry goods (S117), and an unknown pick is no pick, so neither can leave the
 * market without a hold.
 */
export function tradingShip(fleet, pickedId) {
  const picked = (fleet?.ships ?? []).find((ship) => ship.id === pickedId);
  if (picked && !isWreck(picked)) return picked;
  const captain = captainShip(fleet);
  return captain && !isWreck(captain) ? captain : null;
}

/** Fleet value in gold: what the hulls cost, which is what the player sank into it. */
export function fleetWorth(fleet) {
  return (fleet?.ships ?? []).reduce((sum, ship) => sum + (ship.paidGold ?? 0), 0);
}

/** Daily upkeep of the whole fleet, in gold. Ships in port still need feeding. */
export function fleetUpkeep(fleet) {
  return (fleet?.ships ?? []).reduce((sum, ship) => sum + (ship.upkeep ?? 0), 0);
}

/** How many ships the purse can still support; used by the UI for a warning line. */
export function isEmptyFleet(fleet) {
  return (fleet?.ships ?? []).length === 0;
}

/**
 * Write the condition of one hull back into its own fleet entry (S23). Damage has
 * to live on the ship, not on the sea screen: it survives changing captain, going
 * back to the shipyard and sailing out again.
 */
/**
 * Fold the live condition of every fighting hull into the fleet sheet (S90).
 *
 * The sea already kept the captain's damage on her fleet entry, but not the escorts',
 * so an escort beaten down to 30 % came back to the shipyard showing whatever the sheet
 * last said, and the repair price followed that stale number. The rule is the same for
 * every hull: the sea save is the fresher one.
 *
 * `live` is a list of `{ id, combat }`, the shape the sea screen holds for the captain
 * and her escorts. A hull with no live combat, or one that is not in the fleet, is left
 * exactly as it was: this only ever brings damage home, never invents it.
 */
export function withLiveCondition(fleet, live) {
  const ships = fleet?.ships ?? [];
  if (!Array.isArray(live)) return { ...fleet, ships };
  let result = { ...fleet, ships };
  for (const entry of live) {
    const id = entry?.id;
    const combat = entry?.combat;
    if (typeof id !== "string" || !combat || typeof combat !== "object") continue;
    if (!ships.some((ship) => ship.id === id)) continue;
    result = withShipCondition(result, id, {
      condition: combat.condition,
      crewAlive: combat.crew,
    });
  }
  return result;
}

export function withShipCondition(fleet, shipId, { condition, crewAlive } = {}) {
  const ships = fleet?.ships ?? [];
  if (!ships.some((ship) => ship.id === shipId)) return { ...fleet, ships };
  return {
    ...fleet,
    ships: ships.map((ship) =>
      ship.id === shipId
        ? {
            ...ship,
            ...(condition ? { condition: { ...ship.condition, ...condition } } : {}),
            ...(crewAlive ? { crewAlive: { ...crewAlive } } : {}),
          }
        : ship,
    ),
  };
}

const CONDITION_SEGMENTS = ["hull", "rigging", "crew", "morale"];

/** A stored ship keeps a usable condition and crew even if the save predates them. */
function normaliseShip(ship) {
  const source = ship.condition && typeof ship.condition === "object" ? ship.condition : {};
  const condition = {};
  for (const segment of CONDITION_SEGMENTS) {
    const value = Number(source[segment]);
    condition[segment] = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
  }
  const crewAlive =
    ship.crewAlive && typeof ship.crewAlive === "object" ? { ...ship.crewAlive } : { ...(ship.crew ?? {}) };
  // A hull is marked to sail unless the save says otherwise (S35): a fleet written
  // before the checks existed sails with everything, which is what it always did.
  const sails = ship.sails !== false;
  // The hold is a manifest of whole units, and her kg is derived from it (S114): a save
  // that predates the trade has no manifest and keeps her hand-typed cargo untouched.
  const hold = holdOf(ship.manifest ?? []);
  const stored = { ...ship, condition, crewAlive, sails, yardId: yardOf(ship) };
  if (hold.cargoKg > 0) {
    stored.manifest = hold.manifest;
  } else {
    delete stored.manifest;
  }
  return stored;
}

/**
 * Read a stored fleet, tolerating the single-ship save written before fleets
 * existed: an old `barcos:current-ship` value becomes a one-ship fleet.
 */
export function deserializeFleet(json, legacyShip = null) {
  let data = null;
  try {
    data = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    data = null;
  }

  if (!data || !Array.isArray(data.ships)) {
    return legacyShip
      ? { ships: [normaliseShip(legacyShip)], captainId: legacyShip.id }
      : { ships: [], captainId: null };
  }

  const ships = data.ships
    .filter((ship) => ship && typeof ship.id === "string" && Number.isFinite(ship.speedKn))
    .map(normaliseShip);
  if (ships.length === 0) {
    return legacyShip ? { ships: [normaliseShip(legacyShip)], captainId: legacyShip.id } : { ships: [], captainId: null };
  }
  const captainId = ships.some((s) => s.id === data.captainId) ? data.captainId : ships[0].id;
  return { ships, captainId };
}

/** Serialise the fleet for autosave. */
export function serializeFleet(fleet) {
  return JSON.stringify({
    v: 1,
    ships: fleet?.ships ?? [],
    captainId: fleet?.captainId ?? null,
  });
}
