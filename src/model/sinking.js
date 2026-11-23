/**
 * S169: what becomes of one of our hulls when she goes to the bottom.
 *
 * The player's rule, verbatim: "barco nuestro hundido, no aparece en el astillero, quitamos
 * la opcion de 'Un barco hundido queda como naufragio' y siempre queda como naufragio, y
 * desaparece en el astillero". So there is one outcome and no switch: the hull leaves the
 * fleet and the sea keeps a wreck where she went down, which any hull of the squadron can
 * collect by sailing over it, exactly as an enemy's wreck is collected.
 *
 * S117 had made this a setting — a wreck waiting in a yard until the captain paid to float
 * her again — and S169 removes it. Nothing waits in a yard any more.
 *
 * Pure and storage-free: the sea screen asks this module what a sinking means and then
 * applies the answer.
 */

import { wreckPrize } from "./combat.js";

/**
 * Whether a stored fleet entry is a hull that S117 left waiting in a yard (S169-E).
 *
 * This is the only thing the old `wreck` flag is still read for: a save written before
 * S169 can hold one, and the player decided it is discarded on load ("Se descarta al
 * cargar"). Nothing creates a wreck entry any more.
 */
export function isWreck(ship) {
  return Boolean(ship && ship.wreck === true);
}

/**
 * The encounter a sunk hull of ours leaves in the water (S169-C).
 *
 * It is the same shape as the wreck an enemy leaves, so the sea needs no second rule to
 * draw it, collect it or pay it out: the world model already pays every `type: "wreck"`
 * encounter under any hull of the squadron. `gold` is the same prize a defeated enemy of
 * that hull would have paid, which is what makes the loss cost something and not everything.
 *
 * Returns null for a hull with no position: a wreck nobody can sail over is not a wreck,
 * it is a lost entry.
 */
export function ownWreck(ship, position, zone, id) {
  if (!ship) return null;
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(id)) return null;
  return {
    id,
    type: "wreck",
    x,
    y,
    heading: Number(position?.heading) || 0,
    gold: wreckPrize({ hullId: ship.hullId }, zone),
    zoneId: zone?.id ?? null,
  };
}
