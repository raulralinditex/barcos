/** S53: pure crewing and reload calculations, shared by every ship. */
import { PIECES } from "../data/naval-data.js";

export const GUNNERY = {
  maxBonus: 1.3,
  gunnersPerGun: Object.fromEntries(PIECES.map((piece) => [piece.id, 0.5])),
};

/** Works for individual guns and shipyard battery entries alike. */
export function gunnersRequired(pieces) {
  return pieces.reduce((sum, p) => sum + (p.qty ?? 1) * (GUNNERY.gunnersPerGun[p.pieceId] ?? 0.5), 0);
}

/** Allocate fractional gunner requirements in port/starboard/swivel rounds. */
export function crewedPieces(pieces, gunners) {
  if (!(gunners > 0)) return [];
  const sides = ["babor", "estribor", "swivel"].map((side) => pieces.filter((p) => p.side === side));
  const result = [];
  let remaining = gunners;
  for (let i = 0; sides.some((side) => i < side.length); i += 1) {
    for (const side of sides) {
      const p = side[i];
      if (!p) continue;
      const required = gunnersRequired([p]);
      // A tiny tolerance avoids losing a gun to accumulated floating-point error.
      if (required <= remaining + 1e-10) {
        result.push(p);
        remaining -= required;
      }
    }
  }
  return result;
}

/** The multiplier on reload speed for the guns reloading at this instant. */
export function reloadBonus(reloadingPieces, gunners) {
  const needed = gunnersRequired(reloadingPieces);
  if (needed <= 0 || !(gunners > 0)) return 1;
  return Math.min(GUNNERY.maxBonus, Math.max(1, gunners / needed));
}
