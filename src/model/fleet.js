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

/**
 * The yard the fleet's captain is tied up at, or null when she is under way (S163-E).
 *
 * `yardOf` answers "which yard does this hull belong to", and an older save with no
 * `yardId` at all has always belonged to the home port. That is right for a hull sitting
 * in a yard and wrong for a captain at sea: the sea writes `yardId: null` for a hull that
 * sails, and the shipyard read that as "home", so a captain on the open water looked tied
 * up at the home port and every presence action was enabled on a hull that was not there.
 *
 * A missing `yardId` (an old save) still resolves to home. An explicit `null` is the sea.
 */
export function captainYardId(fleet) {
  const captain = (fleet?.ships ?? []).find((ship) => ship && ship.id === fleet?.captainId);
  if (!captain) return null;
  return yardOf(captain);
}

/** Set a non-captain's yard, or clear it for sea. Unknown hulls and yards are refused. */
export function withShipYard(fleet, shipId, yardId) {
  const ships = fleet?.ships ?? [];
  if (!ships.some((ship) => ship.id === shipId) || (yardId !== null && !shipyardById(yardId))) return { ...fleet, ships };
  if (shipId === fleet?.captainId && yardId !== null) return { ...fleet, ships };
  return { ...fleet, ships: ships.map((ship) => ship.id === shipId ? { ...ship, yardId } : ship) };
}

/** The sea's observed position overrides only the captain's saved mooring (S130). */
export function reconcileCaptainPosition(fleet, position, { freshlyBought = null } = {}) {
  if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return fleet;
  const captain = captainShip(fleet);
  if (!captain) return fleet;
  // A hull bought a moment ago is moored where she was bought (S163-D), whatever the sea
  // save says about the captain before her. Buying a hull makes her the fleet's captain
  // (S7), and the save still holds the OLD captain's position out on the water: reconciling
  // against it wrote `yardId: null` over the yard she was just bought at, so a hull bought
  // in Cala del abismo came out floating in open sea. The caller names the hull it just
  // bought, so this stays a rule about THAT purchase and not about the captain at all.
  if (freshlyBought && captain.id === freshlyBought && shipyardById(captain.yardId)) return fleet;
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
    (yardId === captainYardId && yardOf(ship) === null &&
      (ship.id === fleet?.captainId || ship.sails !== false)));
}

/** Sail local marked hulls and leave unmarked visitors at this yard. */
export function departYard(fleet, yardId) {
  const ships = fleet?.ships ?? [];
  if (!shipyardById(yardId)) return { ...fleet, ships };
  return { ...fleet, ships: ships.map((ship) => {
    const location = yardOf(ship);
    if (location !== yardId && location !== null) return ship;
    return { ...ship, yardId: ship.id === fleet?.captainId || ship.sails !== false ? null : yardId };
  }) };
}

/** Only hulls that actually departed can join the captain at sea. */
export function shipsSailingAtSea(fleet) {
  return sailingShips(fleet).filter((ship) => yardOf(ship) === null);
}

/** The captains are the hulls that command themselves, including the legacy captain. */
export function captains(fleet) {
  const ships = Array.isArray(fleet?.ships) ? fleet.ships : [];
  return ships.filter((ship) => ship && typeof ship.id === "string" &&
    (ship.commandId === ship.id || (ship.id === fleet?.captainId && ship.commandId == null)));
}

/** A squadron includes its captain's own hull and all hulls serving her. */
export function squadrons(fleet) {
  const ships = Array.isArray(fleet?.ships) ? fleet.ships : [];
  return captains(fleet)
    .slice()
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((captain) => ({
      captain,
      ships: ships.filter((ship) => ship && typeof ship.id === "string" &&
        (ship.commandId ?? fleet?.captainId) === captain.id),
    }));
}

export function squadronOf(fleet, captainId) {
  return squadrons(fleet).find((squadron) => squadron.captain.id === captainId) ?? null;
}

/**
 * The squadrons that are actually afloat (S155-C).
 *
 * The sea shows every captain at once, so it needs the list of squadrons that can be seen
 * and steered, not every squadron the fleet owns. A squadron sails when her captain is at
 * sea, and she takes with her only the hulls that are afloat too: a hull moored at a yard
 * waits where she is, and her captain sails without her.
 *
 * A squadron whose captain is in port is not on this list at all: she is not sailing, and
 * the sea has no business drawing her.
 */
export function seaSquadrons(fleet) {
  return squadrons(fleet)
    .filter((squadron) => yardOf(squadron.captain) === null)
    .map((squadron) => ({
      ...squadron,
      ships: squadron.ships.filter((ship) => yardOf(ship) === null),
    }));
}

/** A captain at sea is not moored at a shipyard. */
export function captainAt(fleet, yardId) {
  if (!shipyardById(yardId)) return null;
  return captains(fleet).find((captain) => yardOf(captain) === yardId) ?? null;
}

/** Transfer an escort only when she and the target captain are in the same place. */
export function withShipCommand(fleet, shipId, captainId) {
  const ships = Array.isArray(fleet?.ships) ? fleet.ships : [];
  const ship = ships.find((entry) => entry && entry.id === shipId);
  const target = captains(fleet).find((captain) => captain.id === captainId);
  if (!ship || !target || captains(fleet).some((captain) => captain.id === shipId) ||
      yardOf(ship) !== yardOf(target)) return fleet;
  return { ...fleet, ships: ships.map((entry) => entry === ship ? { ...ship, commandId: captainId } : entry) };
}

/** Add a captain without changing which captain is selected for the fleet. */
export function addCaptain(fleet, ship) {
  const added = addShip(fleet, { ...ship, commandId: ship.id });
  return { ...fleet, ...added, captainId: fleet?.captainId ?? ship.id };
}

/**
 * Add a freshly launched ship to the fleet and make it the captain: buying a new
 * hull is how the player moves up, so it becomes the ship they sail out with.
 */
export function addShip(fleet, ship) {
  // A bought hull becomes the fleet's captain (S7), and under S155 the fleet's captain is
  // a captain whether or not she carries a `commandId`: `captains()` reads that fallback,
  // so a purchase needs no field of its own. Setting one here would rewrite the hull the
  // caller passed in, which is what the repair tests compare against.
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
  // The promoted hull is a captain of her own command (S155-A): a hull that answers to
  // another captain is an escort, and `captains()` would keep ignoring her promotion.
  return {
    ships: ships.map((ship) => (ship.id === shipId ? { ...ship, commandId: shipId } : ship)),
    captainId: shipId,
  };
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
 * The hull the market trades with: the one the player picked, else the captain. An unknown
 * pick is no pick, so it cannot leave the market without a hold.
 */
export function tradingShip(fleet, pickedId) {
  const picked = (fleet?.ships ?? []).find((ship) => ship.id === pickedId);
  if (picked) return picked;
  return captainShip(fleet) ?? null;
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

/**
 * The fleet the sea is allowed to write (S151).
 *
 * The sea keeps its own copy of the fleet from the moment it opens, and its autosave
 * used to write that whole copy back. A copy is a photograph of the past: cargo bought in
 * the yard afterwards was overwritten with the value the sea remembered, and the player
 * watched her hold empty itself and the port's stock return to rest without selling a
 * single barrel.
 *
 * The rule is ownership, hull by hull. The voyage owns what it observed or did: the
 * condition and the living crew of the hulls that fought, where each hull is moored, and
 * the hold of the hulls whose cargo the sea itself changed (a prize taken aboard).
 * Everything else — the name, the hull, the guns, a refit, the price — belongs to the
 * yard and is read from the stored sheet, never from the sea's stale copy.
 *
 * A hull that only exists in `stored` was bought after the sea opened, so the sea never
 * saw her: she is kept untouched instead of being deleted by omission. A hull that only
 * exists in `live` is a prize that joined the squadron, and she is appended. `removed`
 * lists the hulls the voyage lost.
 *
 * Total by construction: a missing, broken or duplicated input yields a sane fleet and
 * never throws, because this runs inside the autosave.
 */
export function mergeSeaFleet(stored, live, { removed = [], holdsChanged = [] } = {}) {
  const storedShips = Array.isArray(stored?.ships) ? stored.ships : [];
  const liveShips = Array.isArray(live?.ships) ? live.ships : [];
  const gone = new Set((Array.isArray(removed) ? removed : []).filter((id) => typeof id === "string"));
  const holds = new Set((Array.isArray(holdsChanged) ? holdsChanged : []).filter((id) => typeof id === "string"));

  const byId = new Map();
  for (const ship of storedShips) {
    if (!ship || typeof ship.id !== "string" || gone.has(ship.id) || byId.has(ship.id)) continue;
    byId.set(ship.id, ship);
  }

  for (const ship of liveShips) {
    if (!ship || typeof ship.id !== "string" || gone.has(ship.id)) continue;
    const base = byId.get(ship.id);
    if (!base) {
      // A hull the sea added (a captured prize): the voyage owns her whole entry.
      byId.set(ship.id, ship);
      continue;
    }
    // A hull both sides know: the sea only brings back what she observed or did.
    byId.set(ship.id, {
      ...base,
      ...(ship.condition ? { condition: { ...base.condition, ...ship.condition } } : {}),
      ...(ship.crewAlive ? { crewAlive: { ...ship.crewAlive } } : {}),
      ...(ship.yardId !== undefined ? { yardId: ship.yardId } : {}),
      ...(holds.has(ship.id)
        ? {
            manifest: Array.isArray(ship.manifest) ? ship.manifest.map((entry) => ({ ...entry })) : [],
            cargoKg: Number.isFinite(Number(ship.cargoKg)) ? Number(ship.cargoKg) : 0,
          }
        : {}),
    });
  }

  const ships = [...byId.values()];
  const storedCaptain = typeof stored?.captainId === "string" ? stored.captainId : null;
  const liveCaptain = typeof live?.captainId === "string" ? live.captainId : null;
  const captainId = [storedCaptain, liveCaptain].find((id) => id && ships.some((ship) => ship.id === id))
    ?? ships[0]?.id
    ?? null;
  return { ships, captainId };
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
function normaliseShip(ship, captainId = ship.id) {
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
  const stored = { ...ship, condition, crewAlive, sails, yardId: yardOf(ship), commandId: ship.commandId ?? captainId };
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
      ? { ships: [normaliseShip({ ...legacyShip, commandId: legacyShip.id })], captainId: legacyShip.id }
      : { ships: [], captainId: null };
  }

  const validShips = data.ships
    .filter((ship) => ship && typeof ship.id === "string" && Number.isFinite(ship.speedKn))
    // S169-E: a save written before S169 can hold a hull waiting in a yard as a wreck. The
    // player removed that rule and decided those entries are discarded on load (verbatim):
    // "Se descarta al cargar". Nothing creates one any more, so this is the only place the
    // old `wreck` flag is still read.
    .filter((ship) => !isWreck(ship));
  if (validShips.length === 0) {
    return legacyShip ? { ships: [normaliseShip({ ...legacyShip, commandId: legacyShip.id })], captainId: legacyShip.id } : { ships: [], captainId: null };
  }
  const captainId = validShips.some((ship) => ship.id === data.captainId) ? data.captainId : validShips[0].id;
  const ships = validShips.map((ship) => normaliseShip(ship, captainId));
  // The selected captain commands herself; orphaned hulls return to her command.
  const captainIds = new Set(ships.filter((ship) => ship.commandId === ship.id).map((ship) => ship.id));
  captainIds.add(captainId);
  return {
    ships: ships.map((ship) => ship.id === captainId || !captainIds.has(ship.commandId)
      ? { ...ship, commandId: captainId }
      : ship),
    captainId,
  };
}

/** Serialise the fleet for autosave. */
export function serializeFleet(fleet) {
  return JSON.stringify({
    v: 1,
    ships: fleet?.ships ?? [],
    captainId: fleet?.captainId ?? null,
  });
}
