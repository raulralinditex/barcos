/**
 * Automatic fire (S47): the shipyard check that lets the captain's guns answer by
 * themselves, the way the escorts' already do. Pure and UI-free: the sea screen only
 * applies it.
 */

import { bearingTo, sideForBearing } from "./combat.js";

/** On unless the player turns it off: a new game fires by itself from the start. */
export const AUTOFIRE_DEFAULT = true;

const OFF = new Set([false, "0", "false", "off"]);
const ON = new Set([true, "1", "true", "on"]);

/**
 * The stored value as a boolean. Only an explicit "off" turns it off: a missing,
 * corrupted or unknown value falls back to the default, so a broken save never
 * silences the guns by accident.
 */
export function normaliseAutoFire(value) {
  if (OFF.has(value)) return false;
  if (ON.has(value)) return true;
  return AUTOFIRE_DEFAULT;
}

/** The form that goes into storage. */
export function serialiseAutoFire(value) {
  return normaliseAutoFire(value) ? "1" : "0";
}

/**
 * The enemy the guns of `side` should fire at: the nearest one that bears on that side
 * and is within `maxRangeM`. A beaten enemy (sunk or surrendered) and anything that is
 * not an enemy are never targets; an enemy that has not been engaged yet is, since the
 * first shot is what engages it. Returns `{ target, distance }` or null.
 */
export function targetForSide(ship, encounters, side, maxRangeM) {
  if (!ship || !Array.isArray(encounters)) return null;
  const range = Number(maxRangeM);
  if (!Number.isFinite(range)) return null;

  let best = null;
  for (const encounter of encounters) {
    if (encounter?.type !== "enemy") continue;
    if (encounter.combat && encounter.combat.status !== "fighting") continue;
    const distance = Math.hypot(encounter.x - ship.x, encounter.y - ship.y);
    if (!Number.isFinite(distance) || distance > range) continue;
    if (best && distance >= best.distance) continue;
    if (sideForBearing(ship.heading, bearingTo(ship, encounter)) !== side) continue;
    best = { target: encounter, distance };
  }
  return best;
}
