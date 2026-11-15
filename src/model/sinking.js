/**
 * S117: what becomes of one of our hulls when she goes to the bottom.
 *
 * The player asked for a switch in the settings screen: a sunk hull either leaves the
 * fleet, as the game always played, or stays as a wreck that waits in a yard until the
 * captain pays to float her again.
 *
 * Pure and storage-free: the sea screen asks this module what a sinking means and then
 * applies the answer. The setting is read at the moment she sinks, so a switch changed
 * mid-voyage counts for the next hull that goes down.
 */

import { REPAIR, repairCost } from "./repair.js";

/**
 * The switch (S117). Off by default, which is the game as it was: losing a hull is
 * losing her. It is a live block, so the settings screen owns the value like every
 * other tuning number.
 */
export const SINKING = { keepWreck: 0 };

/** Whether the switch is on right now, failing closed on anything that is not a yes. */
export function keepsWreck(options = SINKING) {
  return Number(options?.keepWreck) > 0;
}

/** Whether a fleet entry is a hull waiting to be floated again. */
export function isWreck(ship) {
  return Boolean(ship && ship.wreck === true);
}

/**
 * The fleet entry of a hull that just sank, or null when she is simply gone (S117).
 *
 * A wreck keeps her identity — name, hull, guns, what she cost — because floating her
 * again restores that same ship and not a new one. She loses everything that was afloat
 * in her: her cargo is at the bottom (S116), her crew went with her, and her hull is at
 * zero. She does not sail and she cannot be a captain.
 */
export function wreckHull(ship, options = SINKING) {
  if (!ship) return null;
  if (!keepsWreck(options)) return null;
  return {
    ...ship,
    wreck: true,
    sails: false,
    cargoKg: 0,
    manifest: [],
    condition: { ...(ship.condition ?? {}), hull: 0, rigging: 0 },
    crewAlive: {},
  };
}

/**
 * The fleet entry of a wreck floated again in a yard (S117). The yard charges a full
 * repair for it, so the price of the mistake is on the captain and not on the game: she
 * comes back whole, with a hull and a rig, and with no cargo — that was lost with her.
 *
 * Returns null for anything that is not a wreck: a hull that never sank cannot be
 * floated, and pretending otherwise would be a free repair.
 */
export function floatsAgain(ship) {
  if (!isWreck(ship)) return null;
  const { wreck, ...rest } = ship;
  return {
    ...rest,
    // Explicitly not a wreck any more: the fleet entry is a whole ship again, and the
    // screens read this flag instead of guessing from her condition.
    wreck: false,
    sails: true,
    condition: { ...(ship.condition ?? {}), hull: 100, rigging: 100 },
  };
}

/** What the yard charges to float a wreck again (S117): the full repair of her hull. */
export function refloatCost(ship) {
  if (!isWreck(ship)) return 0;
  return repairCost({ ...ship, condition: { ...(ship.condition ?? {}), hull: 0, rigging: 0 } });
}

export { REPAIR };
