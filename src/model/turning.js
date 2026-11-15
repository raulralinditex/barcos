/**
 * Turning radius by tonnage (S48): the heavier the hull, the wider its turn.
 *
 * The rudder rate (`WORLD.maxTurnRate`, rad/s at full helm) belongs to the reference
 * hull; every other hull turns at that rate times a factor that falls with its weight.
 * A slower turn at the same speed is, geometrically, a bigger circle: radius = speed / rate.
 *
 * Pure and declared: the curve lives in `TURNING`, not scattered through the movement code.
 */

import { hullById } from "../data/naval-data.js";
import { KN_TO_MS, WORLD } from "./world.js";

export const TURNING = {
  /** The displacement that turns at the base rate: a small galleon, in kilograms. */
  referenceKg: 250_000,
  /** How fast the turn rate falls with weight: factor = (reference / weight) ^ exponent. */
  exponent: 0.5,
  /** The slowest a colossus may turn, as a share of the base rate. */
  minFactor: 0.25,
  /** The quickest a boat may turn, as a share of the base rate. */
  maxFactor: 1.6,
  /**
   * A hull that floats too high steers badly (S110). Below this share of her own
   * capacity she has no weight in the water for the rudder to bite: her keel skates and
   * the helm answers late. 0.20 means a hull loaded under a fifth of what she can carry.
   * It is physics, not a fee: nothing is charged, the helm simply does not answer.
   */
  lightLoadThreshold: 0.2,
  /** How much of the turn rate she keeps when she is empty: 0.75 is a quarter lost. */
  lightLoadFactor: 0.75,
};

/**
 * How well a hull with this load fraction answers her helm (S110). A light hull turns
 * slower than the same hull properly laden, because the rudder needs water pressure to
 * bite. The penalty fades to nothing at `lightLoadThreshold`; an unknown load is treated
 * as laden, so a ship with no record steers exactly as she always did.
 */
export function lightLoadTurnFactor(loadFraction) {
  // An empty string is what a blank input hands back, and `Number("")` is 0 — which
  // would read as "she floats at zero load" and punish a ship for a missing field. Only
  // a real number may trigger the penalty; anything else fails open.
  if (typeof loadFraction !== "number" || !Number.isFinite(loadFraction)) return 1;
  const load = loadFraction;
  if (load >= TURNING.lightLoadThreshold) return 1;
  const share = Math.max(0, load) / TURNING.lightLoadThreshold;
  return TURNING.lightLoadFactor + (1 - TURNING.lightLoadFactor) * share;
}

/**
 * The share of the base turn rate a hull of `massKg` gets. A missing or broken weight
 * returns 1, so a ship with no tonnage on record turns exactly as it always did.
 */
export function turnRateFactor(massKg) {
  const mass = Number(massKg);
  if (!Number.isFinite(mass) || mass <= 0) return 1;
  const factor = Math.pow(TURNING.referenceKg / mass, TURNING.exponent);
  return Math.min(TURNING.maxFactor, Math.max(TURNING.minFactor, factor));
}

/** The factor of a catalogue hull, from its own displacement; 1 for an unknown hull. */
export function hullTurnFactor(hullId) {
  return turnRateFactor(hullById(hullId)?.displacementKg);
}

/**
 * The turn factor a ship actually gets (S48, S110): her hull's own share of the rudder
 * rate, held back further when she floats too high to steer. This is the one number the
 * sea and the fight both read, so a light hull handles badly in both.
 */
export function shipTurnFactor(hullId, loadFraction) {
  return hullTurnFactor(hullId) * lightLoadTurnFactor(loadFraction);
}

/**
 * The radius, in game metres, of the circle a ship describes at `speedKn` with the
 * rudder hard over at `turnRatePerS` rad/s. Infinite when it cannot turn at all.
 */
export function turningRadiusM(speedKn, turnRatePerS) {
  const rate = Number(turnRatePerS);
  if (!Number.isFinite(rate) || rate <= 0) return Infinity;
  const speedMs = Math.max(0, Number(speedKn) || 0) * KN_TO_MS * WORLD.arcadeScale;
  return speedMs / rate;
}
