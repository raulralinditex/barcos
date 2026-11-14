/**
 * S73: the duel panel — every engaged hull, ours and theirs, side by side.
 *
 * The panel used to show only the nearest enemy, which told half the story: the player
 * could see the hostile's hull falling but not her own. The rule here is the roster: who
 * is in the fight, in which order, and with what three numbers, so the screen has nothing
 * to decide on its own.
 *
 * Pure and UI-free, like the rest of the sea rules: the sea screen only paints it.
 */

/**
 * The hulls in the fight (S73).
 *
 * Ours are the captain and every escort that is fighting; theirs are every enemy in
 * combat. An enemy counts as engaged when it is inside the engage radius, which is the
 * same test the game already uses to start and stop a fight. A hull that is sunk or has
 * struck is not in the roster: the fight is over for her.
 *
 * `ours` is listed first, each group nearest first, so the player reads her own side
 * before the other one.
 */
export function duelRoster(input) {
  // The sea calls this every frame, including on the first one, before the world exists.
  const { ours = [], theirs = [], engageRadiusM = 0, ship = null } =
    input && typeof input === "object" ? input : {};
  const radius = Number(engageRadiusM);
  const from = ship && Number.isFinite(Number(ship.x)) && Number.isFinite(Number(ship.y)) ? ship : null;
  const distanceTo = (hull) => {
    if (!from) return Infinity;
    const dx = Number(hull?.x) - from.x;
    const dy = Number(hull?.y) - from.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Infinity;
    return Math.hypot(dx, dy);
  };

  const fighting = (combat) => combat && combat.status === "fighting";
  /** One condition number, read as a real 0..100 and never as NaN (S73). */
  const share = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0;
  };

  const own = (Array.isArray(ours) ? ours : [])
    .filter((hull) => fighting(hull?.combat))
    .map((hull) => ({
      id: hull.id,
      name: hull.name ?? "",
      side: "ours",
      hull: share(hull.combat.condition?.hull),
      rigging: share(hull.combat.condition?.rigging),
      crew: share(hull.combat.condition?.crew),
      distanceM: distanceTo(hull),
    }))
    .sort((a, b) => a.distanceM - b.distanceM);

  const enemy = (Array.isArray(theirs) ? theirs : [])
    .filter((hull) => fighting(hull?.combat))
    .map((hull) => ({
      id: hull.id,
      name: hull.name ?? "",
      hullId: hull.hullId ?? null,
      side: "theirs",
      hull: share(hull.combat.condition?.hull),
      rigging: share(hull.combat.condition?.rigging),
      crew: share(hull.combat.condition?.crew),
      distanceM: distanceTo(hull),
    }))
    // An enemy is in the fight once she is inside the engage radius, the same gate the
    // rest of the game uses; ours are shown whenever they are fighting.
    .filter((hull) => !(radius > 0) || hull.distanceM <= radius)
    .sort((a, b) => a.distanceM - b.distanceM);

  return [...own, ...enemy];
}

/**
 * Whether the panel should be on screen at all (S73, S85).
 *
 * The panel is a battle panel, so a battle is what it needs: at least one hostile in the
 * roster. Listing our own hulls is not enough, because the captain is `fighting` from the
 * moment she puts to sea — that is what makes her guns work — and counting her alone left
 * the panel on screen over an empty sea, which is exactly what the player reported.
 *
 * Our hulls still come first in the roster, so when the panel does open both sides read
 * side by side, which is what S73 was for.
 */
export function duelVisible(roster) {
  if (!Array.isArray(roster)) return false;
  return roster.some((entry) => entry?.side === "theirs");
}

/**
 * One condition row as a share of its track, clamped to 0..1 (S73). A broken or missing
 * value reads as empty instead of painting a bar of NaN wide.
 */
export function conditionShare(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(1, Math.max(0, numeric / 100));
}
