/**
 * Fleet model: the ships the player owns and which one they captain (S7).
 *
 * Pure and storage-free: it takes a fleet value and returns a new one, so the
 * progression rules are testable without a browser. The UI owns persistence.
 *
 * A fleet is a plain object so it survives JSON round-trips unchanged:
 *   { ships: [runtimeShip, ...], captainId: string }
 *
 * The captain is the hull that sails when the player puts to sea. Every other
 * ship stays in port, keeping the hull, crew and loadout it was bought with.
 */

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

/** The ship the player actually sails. Null for an empty fleet. */
export function captainShip(fleet) {
  const ships = fleet?.ships ?? [];
  return ships.find((ship) => ship.id === fleet?.captainId) ?? ships[0] ?? null;
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
  return { ...ship, condition, crewAlive };
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
