/**
 * Sea-screen rules that are not drawing: how long a ship's bars are (S59) and when the
 * fast-forward gives way to combat (S43). Pure, so they are testable without a browser;
 * `ui/sea.js` only applies them.
 */

export const BAR_SCALE = {
  /**
   * The shortest a condition bar gets, as a share of the longest. There is no floor:
   * the compressed scale below already leaves the lightest hull readable, and a floor
   * would only hide how much less punishment that hull takes (S59).
   */
  minShare: 0,
};

/**
 * How long one ship's condition bars are, as a share of the longest bar on screen: the
 * square root of the hull's endurance against the toughest hull in view (S59).
 *
 * The endurance is `hullToughness`, the same number `applyDamage` divides hull damage
 * by, so the length finally says what the hull actually takes. The square root is what
 * keeps the range legible: endurance spans 30x across the catalogue, and a linear bar
 * would draw a coastal boat as a 4 px stub next to a ship of the line.
 *
 * A ship alone on screen, or a broken value, gets a bar inside the limits instead of
 * throwing or vanishing.
 */
export function hullBarShare(toughness, referenceToughness) {
  const own = Number(toughness);
  const reference = Number(referenceToughness);
  if (!Number.isFinite(own) || own <= 0) return 1;
  if (!Number.isFinite(reference) || reference <= 0) return 1;
  const share = Math.sqrt(own) / Math.sqrt(reference);
  return Math.min(1, Math.max(BAR_SCALE.minShare, share));
}

/**
 * The fast-forward goes back to x1 the moment an enemy engages (S43). It acts on the
 * edge, from "nobody engaged" to "somebody engaged", so it fires once per engagement:
 * the player can still press T again in the middle of the fight.
 *
 * Returns the time scale to use and whether it was dropped (the caller shows the notice).
 */
export function timeScaleOnEngage(timeScale, wasEngaged, isEngaged) {
  const scale = Number.isFinite(Number(timeScale)) && Number(timeScale) >= 1 ? Number(timeScale) : 1;
  if (!wasEngaged && isEngaged && scale > 1) return { timeScale: 1, dropped: true };
  return { timeScale: scale, dropped: false };
}

/**
 * Whether an escort has an enemy inside gunshot (S54). The fleet's bars pile up when
 * the formation is tight, so an escort only shows hers when she is in the fight: some
 * hostile lies within the engage radius of her own position. A broken position or a
 * broken radius never counts as a fight.
 */
export function hasEnemyInGunshot(escort, enemies, radius) {
  const range = Number(radius);
  const x = Number(escort?.x);
  const y = Number(escort?.y);
  if (!Number.isFinite(range) || range <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  for (const enemy of enemies ?? []) {
    const ex = Number(enemy?.x);
    const ey = Number(enemy?.y);
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue;
    if (Math.hypot(ex - x, ey - y) <= range) return true;
  }
  return false;
}

/**
 * Whether the combat panels belong on screen (S85).
 *
 * The player asked for the battle panels only during a battle: the duel roster, the
 * condition bars over the hulls and the rows of the ship panel that only matter under
 * fire. Anything that is already gated on a fight answers this; anything that is not,
 * keeps showing, because the sea is readable without a battle.
 *
 * `engaged` is the same fact the duel panel already uses: a hostile in the fight. It is
 * passed in rather than read here, so this stays pure and testable.
 */
export function combatPanelsVisible(engaged) {
  return Boolean(engaged);
}
