/**
 * S132: every hull at sea carries her own crew supply.
 *
 * The player's decisions (verbatim): "Uno por nave (Recomendada)" — every hull that sails
 * burns her own reserve, and "cuando llegue a 0 se avisara que hay que volver al
 * astillero". Wages stay whole-fleet (verbatim): "Toda la flota paga (como hoy)".
 *
 * The model is storage-free and pure: it takes a plain map of `{ hullId: secondsLeft }`
 * and returns a new one, so the rules are testable without a browser and the sea screen
 * only wires them to the save, the banner and the panel.
 *
 * A reserve map holds exactly the hulls that are at sea: a hull moored at a shipyard is
 * not in it, so she cannot burn a drop (S-B). The captain is the first hull of the
 * squadron, which is the fleet's own convention.
 */

import { burnSupply, supplySeconds } from "./game-time.js";

/** A finite, non-negative number, or null when the value cannot be a reserve. */
function reserveOf(value) {
  // `Number(null)` is 0, so an absent value has to be refused before the cast or a save
  // without a reserve would read as a hull that already starved.
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * The per-hull reserves of the squadron (S-A, S-E).
 *
 * Each hull seeds her own `days` of provisions. A save written before this rule has a
 * single `legacy` reserve and no map: that value lands on the captain, because it was
 * the whole squadron's, and every escort starts from her own days. A hull present in
 * `byHull` keeps the reserve the sea already spent, which is fresher than the shipyard
 * sheet exactly as it is for damage and crew.
 */
export function buildReserves(hulls, { byHull = null, legacy = null } = {}) {
  const list = Array.isArray(hulls) ? hulls : [];
  const saved = byHull && typeof byHull === "object" ? byHull : null;
  const carried = reserveOf(legacy);
  const reserves = {};
  list.forEach((hull, index) => {
    const id = hull?.id;
    if (id === undefined || id === null) return;
    const fromMap = saved ? reserveOf(saved[id]) : null;
    if (fromMap !== null) {
      reserves[id] = fromMap;
      return;
    }
    // The captain is the first hull: an old single reserve was hers to spend.
    if (index === 0 && carried !== null) {
      reserves[id] = carried;
      return;
    }
    reserves[id] = supplySeconds(hull?.days ?? 0);
  });
  return reserves;
}

/**
 * Burn `dt` seconds of sea time off every hull at once (S-B, S-C, S-F).
 *
 * Returns the new map, the ids that went dry on this very step — the moment to warn, once
 * per hull — and the whole days each hull gave up, so the caller can charge the fleet's
 * wages off the captain's clock without splitting the charge per hull.
 *
 * A hull that was already dry is not "exhausted" by `burnSupply`, so a dry hull at boot
 * never fires the banner (the behaviour the single `supplyWarned` flag had).
 */
export function burnReserves(reserves, dt) {
  const source = reserves && typeof reserves === "object" ? reserves : {};
  const next = {};
  const dried = [];
  const daysSpent = {};
  for (const [id, value] of Object.entries(source)) {
    const burned = burnSupply(value, dt);
    next[id] = burned.secondsLeft;
    daysSpent[id] = burned.daysSpent;
    if (burned.exhausted) dried.push(id);
  }
  return { reserves: next, dried, daysSpent };
}

/** The hulls whose reserve is already gone, for the panel's count (S-C). */
export function dryHulls(reserves) {
  const source = reserves && typeof reserves === "object" ? reserves : {};
  return Object.entries(source)
    .filter(([, value]) => !(Number(value) > 0))
    .map(([id]) => id);
}

/**
 * What the voyage panel reads about the squadron (S-D).
 *
 * The figure shown is the **worst hull**: the lowest reserve in the squadron, with her
 * name and how many hulls are already at zero. Chosen over "the captain's days plus the
 * lowest escort's" because the sea now charges every hull separately, so the reserve that
 * ends the voyage — the one that makes "go back to a shipyard" true — is the smallest,
 * and it is one number the panel can show next to the day length the panel already
 * prints. Two figures (captain and worst escort) would also need the escort's name to be
 * actionable, which is the extra line the request asked to avoid, and a captain whose
 * own hold is the short one would read as the healthy case.
 *
 * `worstSeconds` is the same number the sea charges, read from the same map.
 */
export function squadronSupply(reserves) {
  const source = reserves && typeof reserves === "object" ? reserves : {};
  const entries = Object.entries(source);
  let worstId = null;
  let worstSeconds = 0;
  let dryCount = 0;
  for (const [id, value] of entries) {
    const seconds = Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
    if (seconds <= 0) dryCount += 1;
    if (worstId === null || seconds < worstSeconds) {
      worstId = id;
      worstSeconds = seconds;
    }
  }
  return { worstId, worstSeconds, dryCount, hullCount: entries.length };
}

/**
 * The fleet's daily wage for the whole days the captain's clock crossed (S-F).
 *
 * The charge is not split per hull: the player decided the whole fleet pays, so one day
 * crossed by the captain is one day of the fleet's upkeep — moored hulls included, as it
 * already was. An escort that crossed more days never multiplies the bill.
 */
export function wagesFor(daysSpent, captainId, upkeep) {
  const days = Number(daysSpent?.[captainId]);
  const daily = Number(upkeep);
  if (!Number.isFinite(days) || days <= 0) return 0;
  if (!Number.isFinite(daily) || daily <= 0) return 0;
  return days * daily;
}
