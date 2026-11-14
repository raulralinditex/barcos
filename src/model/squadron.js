/**
 * The squadron (S36): the captain and her escorts as one fighting line.
 *
 * The sea screen owns the rendering and the input; this module owns the rules that
 * decide who shoots whom and who is still in the fight. Pure, so the consequences of
 * taking the whole fleet to sea are testable without a browser.
 *
 * A hull here is `{ id, name, x, y, heading, combat }`, where `combat` is a
 * combatant from `combat.js`. The captain is always the first one.
 */

import { distanceBetween, fireBroadside, sideForBearing, bearingTo } from "./combat.js";

/** The hulls still able to fight, as positions the enemy AI can aim at. */
export function alliedTargets(allies) {
  return (allies ?? []).filter((ally) => ally?.combat?.status === "fighting");
}

/**
 * The allied hull an enemy aims at: the nearest one still in the fight. With a fleet
 * in formation this is usually an escort, which is the point of having them.
 */
export function closestTarget(allies, from) {
  const origin = { x: from?.x ?? 0, y: from?.y ?? 0 };
  let best = null;
  let bestDistance = Infinity;
  for (const ally of alliedTargets(allies)) {
    const distance = distanceBetween(ally, origin);
    if (distance < bestDistance) {
      best = ally;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One escort's gunnery for this tick: fire the side that bears on `target`, with the
 * escort's own reloads and ammunition. Returns the same shape as `fireBroadside`, plus
 * the side that fired, so the caller can draw the tracers.
 */
export function escortFire(escort, target, rnd) {
  const combat = escort?.combat;
  if (!combat || combat.status !== "fighting" || !target) return { volley: [], side: null };

  const distance = distanceBetween(escort, target);
  const side = sideForBearing(escort.heading ?? 0, bearingTo(escort, target));
  if (!side) return { volley: [], side: null };

  const result = fireBroadside(combat, side, distance, rnd);
  return { ...result, side };
}

/**
 * Split the line into the hulls still fighting and the ones that are out of it. A
 * surrendered escort is as lost as a sunk one: she is no longer under the player's
 * orders.
 */
export function pruneAllies(allies) {
  const survivors = [];
  const lost = [];
  for (const ally of allies ?? []) {
    if (ally?.combat?.status === "fighting") survivors.push(ally);
    else lost.push(ally);
  }
  return { survivors, lost };
}

/**
 * Whether the voyage is over. Only the captain decides it: losing an escort is a
 * loss, not the end of the game.
 */
export function squadronStatus(allies) {
  const line = Array.isArray(allies) ? allies : [];
  // The voyage is over when nothing is left to sail, not when the captain falls (S87).
  // Losing the flagship is a blow — the next hull in line takes over — but the player
  // still has ships, and the player asked to keep sailing while any of them floats.
  const lost = (hull) => {
    const status = hull?.combat?.status;
    return status === "sunk" || status === "surrendered";
  };
  if (line.length === 0) return { over: false, reason: null };
  if (line.every(lost)) {
    // Report why in the captain's terms: the flagship is the one the screen names.
    const reason = line[0]?.combat?.status === "surrendered" ? "surrendered" : "sunk";
    return { over: true, reason };
  }
  return { over: false, reason: null };
}
