/**
 * Oars model: the reserve propulsion of a hull that has banks (S159).
 *
 * The player asked for it (verbatim): "los remeros los vamos a introducir en la velocidad",
 * with the accepted formula `I_total = max(I_velas, I_remos) − I_penalización carga y fatiga`,
 * and three precisions: "remos automaticos, tambien influyen en la maniobrabilidad, los cascos
 * que no tienen remos no aparecen en la interface esa posibilidad".
 *
 * The rule that matters: a ship does NOT add sail and oars. The resulting propulsion depends
 * on the resistance of the loaded hull, so the sea takes the greater of the two. A strong
 * following wind leaves the oars with nothing to add; a head wind is exactly what they are
 * for. And oars do not care about the wind at all, which is the whole point of having them.
 *
 * Pure and UI-free: it says how fast a hull could go under her oars and how much effort is
 * left in the crew. The sea screen is the only thing that moves a hull.
 */

export const OARS = {
  /**
   * Seconds of game time a full sprint lasts before the effort halves. The player accepted
   * this value: "me parece bien". It is design convention, not history: the real limit is
   * minutes of wall clock, and the sea runs on its own clock.
   */
  sprintS: 90,
  /** Seconds of game time a rest needs to bring the effort back to full. */
  recoverS: 60,
  /**
   * How much the oars sharpen the helm at full effort, as a share of the hull's own turn
   * rate. The player asked for it (verbatim): "tambien influyen en la maniobrabilidad".
   */
  turnBonus: 0.25,
  /**
   * Load above which the oars start to suffer, as a fraction of the hull's capacity. Below
   * it the hull rows whole: a hull is not punished for being at sea with her crew aboard.
   */
  loadThreshold: 0.5,
  /** How much of the oar speed a hull loaded to the brim still makes. */
  ladenFactor: 0.4,
  /**
   * The pull of one man relative to the hull's own oar speed. A hull declares `oarBanks`
   * and `oarMaxKn`; the crew aboard is what actually pulls, so half the bank is half the way.
   */
  crewShare: true,
  /**
   * What one rower is worth when a deck has to be taken (S161). The player set it: "vamos a
   * hacer que los remeros sean un 50% de soldados". A rower can hold a pike and board, but he
   * is not a trained soldier, so he counts for half.
   */
  rowerShareOfSoldier: 0.5,
  /**
   * What one soldier is worth at the oars (S161). The player set it: "los soldados un 30% de
   * remeros". A soldier can pull an oar, badly and only for a while, so he counts for less
   * than a rower.
   */
  soldierShareOfRower: 0.3,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Whether a hull declares banks of oars. A missing, zero or broken value means none. */
export function hasOarBanks(hull) {
  const banks = Number(hull?.oarBanks);
  return Number.isFinite(banks) && banks > 0 && Number.isFinite(Number(hull?.oarMaxKn)) && Number(hull.oarMaxKn) > 0;
}

/** How many oars a hull has, as a whole number. No banks means zero. */
export function banksFor(hull) {
  return hasOarBanks(hull) ? Math.floor(Number(hull.oarBanks)) : 0;
}

/**
 * The crew roles a hull can actually seat (S159-H).
 *
 * The player asked for it (verbatim): "los cascos que no tienen remos no aparecen en la
 * interface esa posibilidad". So a hull that declares no banks is offered every role but the
 * rower's, and the screen only reads this list instead of deciding it again.
 */
export function crewRolesForHull(hull, roles) {
  const list = Array.isArray(roles) ? roles : [];
  if (hasOarBanks(hull)) return [...list];
  return list.filter((role) => role !== "remero");
}

/**
 * The same crew without the men a hull cannot seat (S159-H).
 *
 * A loadout saved on a galleass and then moved to a galleon keeps no rowers: there are no
 * banks to put them at, and the model would only warn about men who cannot pull. Every
 * other role is untouched, and a broken record stays as empty as it came.
 */
export function withoutUnseatableRowers(hull, crew) {
  if (!crew || typeof crew !== "object" || Array.isArray(crew)) return {};
  const next = { ...crew };
  if (!hasOarBanks(hull)) delete next.remero;
  return next;
}

/** The rowers actually aboard a crew: whole men, never invented, never negative. */
export function oarsAboard(crew) {
  const count = Number(crew?.remero);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

/**
 * The soldiers' worth of a crew (S161): her soldiers plus her rowers at their share.
 *
 * The player asked for it (verbatim): "vamos a hacer que los remeros sean un 50% de soldados
 * y los soldados un 30% de remeros estos valores configurables". A rower is a man who can hold
 * a pike when a deck has to be taken, so a hull with rowers can board without a single
 * soldier aboard.
 */
export function soldiersWorth(combatant) {
  const soldiers = Number(combatant?.crew?.soldado);
  const rowers = Number(combatant?.crew?.remero);
  const s = Number.isFinite(soldiers) && soldiers > 0 ? soldiers : 0;
  const r = Number.isFinite(rowers) && rowers > 0 ? rowers : 0;
  return s + r * OARS.rowerShareOfSoldier;
}

/**
 * The rowers' worth of a crew (S161): her rowers plus her soldiers at their share.
 *
 * A soldier can take an oar, so a hull full of soldiers is not a hull with no pull at all,
 * but he is worth less than a rower. The pull of a hull is what `oarSpeedKn` reads.
 */
export function rowersWorth(combatant) {
  const rowers = Number(combatant?.crew?.remero);
  const soldiers = Number(combatant?.crew?.soldado);
  const r = Number.isFinite(rowers) && rowers > 0 ? rowers : 0;
  const s = Number.isFinite(soldiers) && soldiers > 0 ? soldiers : 0;
  return r + s * OARS.soldierShareOfRower;
}

/**
 * How much of her oar speed a hull keeps for the load she carries (S159-C).
 *
 * Up to `loadThreshold` the oars are not punished: a hull at sea with her crew, guns and
 * provisions is a hull at sea, not a hull in trouble. Above it the pull falls away to
 * `ladenFactor` at the brim, because a deep hull drags more water with every stroke.
 *
 * A missing or broken load reads as light, so a save with no record rows exactly as it did.
 */
export function loadPenalty(loadFraction) {
  if (typeof loadFraction !== "number" || !Number.isFinite(loadFraction)) return 1;
  const load = Math.max(0, loadFraction);
  if (load <= OARS.loadThreshold) return 1;
  const over = (load - OARS.loadThreshold) / (1 - OARS.loadThreshold);
  return 1 - (1 - OARS.ladenFactor) * clamp(over, 0, 1);
}

/**
 * How fast a hull could make way under her oars right now, in knots (S159-A/D/C).
 *
 * Three things scale the hull's own oar speed: the men actually at the oars against the
 * banks she has, the effort left in them, and the load she drags. A hull with no banks, or
 * with no rowers aboard, makes nothing under oars at all: the player's rule is that where
 * there are no banks there is no oar propulsion, whatever crew a hand-edited save claims.
 */
export function oarSpeedKn(hull, crew, { effort = 1, loadFraction = 0 } = {}) {
  if (!hasOarBanks(hull)) return 0;
  const banks = banksFor(hull);
  // A soldier can take an oar (S161): the pull is the rowers' worth of the crew, whole men.
  const aboard = Math.min(banks, Math.floor(rowersWorth({ crew })));
  if (aboard <= 0) return 0;
  const pull = OARS.crewShare ? aboard / banks : 1;
  const tiredness = Number.isFinite(effort) ? clamp(effort, 0, 1) : 1;
  return Number(hull.oarMaxKn) * pull * tiredness * loadPenalty(loadFraction);
}

/**
 * The speed the sea will actually use (S159-A): the greater of sail and oars, never their
 * sum. The player put it in those words: "un barco no obtiene la suma de ambas velocidades".
 *
 * A broken input never invents way: a missing sail speed is no sail, and a missing oar speed
 * is no oars.
 */
export function speedUnderOars(sailKn, oarKn) {
  const sail = Number(sailKn);
  const oar = Number(oarKn);
  const safeSail = Number.isFinite(sail) && sail > 0 ? sail : 0;
  const safeOar = Number.isFinite(oar) && oar > 0 ? oar : 0;
  return Math.max(safeSail, safeOar);
}

/**
 * Whether the oars are pulling, decided by the sea and not by a key (S159-E).
 *
 * The player chose automatic oars: "remos automaticos". The rule is the same `max()` the
 * speed uses, which means the oars are in use exactly while they are the faster way to move.
 * A hull whose sail already beats her oars leaves the crew to rest, and that is what keeps
 * the effort for the moment the wind dies or turns foul.
 */
export function rowingTarget({ sailKn, oarKn } = {}) {
  const sail = Number(sailKn);
  const oar = Number(oarKn);
  if (!Number.isFinite(oar) || oar <= 0) return false;
  if (!Number.isFinite(sail) || sail <= 0) return true;
  return oar > sail;
}

/**
 * One step of the crew's effort, from 0 (spent) to 1 (fresh) (S159-D).
 *
 * Rowing spends it at a rate that halves a full tank in `sprintS`; resting brings it back in
 * `recoverS`. A broken effort starts fresh, and a broken step changes nothing, because this
 * runs inside the sea's own loop.
 */
export function effortStep(effort, { rowing = false, dt = 0 } = {}) {
  const current = Number.isFinite(effort) ? clamp(effort, 0, 1) : 1;
  const time = Number(dt);
  if (!Number.isFinite(time) || time <= 0) return current;
  if (rowing) {
    // Half the tank per sprint: the rate is 0.5 / sprintS per second.
    const spend = (0.5 / OARS.sprintS) * time;
    return clamp(current - spend, 0, 1);
  }
  const recover = (1 / OARS.recoverS) * time;
  return clamp(current + recover, 0, 1);
}

/**
 * The share of extra turn rate the oars give (S159-F): the "maniobra táctica" of the request.
 *
 * Only while the crew is actually rowing, and in proportion to the effort left: a tired crew
 * still helps, a rested one that is not rowing helps not at all. A hull with no oars, or a
 * broken record, turns exactly as it did before this rule existed.
 */
export function oarTurnFactor(record = {}) {
  const { effort = 1, rowing = false } = record && typeof record === "object" ? record : {};
  if (!rowing) return 1;
  const tiredness = Number.isFinite(effort) ? clamp(effort, 0, 1) : 0;
  if (tiredness <= 0) return 1;
  return 1 + OARS.turnBonus * tiredness;
}

/** The same, tolerating a missing or broken record instead of throwing. */
export function oarTurnFactorOf(record) {
  if (!record || typeof record !== "object") return 1;
  return oarTurnFactor(record);
}
