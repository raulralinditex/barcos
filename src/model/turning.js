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
};

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
 * The radius, in game metres, of the circle a ship describes at `speedKn` with the
 * rudder hard over at `turnRatePerS` rad/s. Infinite when it cannot turn at all.
 */
export function turningRadiusM(speedKn, turnRatePerS) {
  const rate = Number(turnRatePerS);
  if (!Number.isFinite(rate) || rate <= 0) return Infinity;
  const speedMs = Math.max(0, Number(speedKn) || 0) * KN_TO_MS * WORLD.arcadeScale;
  return speedMs / rate;
}
