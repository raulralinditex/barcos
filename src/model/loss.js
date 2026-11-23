/**
 * S180: what a lost voyage may erase, and what it may not.
 *
 * The player reported it (verbatim): "despues de que se hunde la capitana, los doblones
 * desaparecen". The way out of a lost voyage deleted the whole `barcos:game:v1` record, and
 * the purse lives in it, so 50,000 doblones came back as the 12,000 of a new game.
 *
 * The rule: a lost voyage erases the sea — the world, the fight, the squadron's reserves, the
 * old hull — and keeps what belongs to the shipyard: the purse, the fort the player invested
 * in, and the markets she traded. Losing your last ship is a blow, not a reset.
 *
 * Pure and storage-free, like the rest of the model: the screen asks what the record becomes
 * and writes that.
 */

/**
 * The fields of `barcos:game:v1` that belong to the voyage and die with it (S180).
 *
 * Everything not listed here survives. `gold` is deliberately absent: it is the player's, not
 * the sea's, and a test asserts it can never be added to this list by accident.
 */
export const PURSE_KEYS = ["world", "combat", "supplyByHull", "ship"];

/** A finite, non-negative purse, or zero. The same rule the sea and the yard use (S32). */
function normalisePurse(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * The record the shipyard opens after a lost voyage (S180).
 *
 * The purse is kept, the voyage's fields are dropped, and everything the shipyard owns is
 * left exactly as it was. A broken record resolves to an empty one with a zero purse rather
 * than to `NaN`, so a corrupted save cannot become a debt or an infinite bank.
 */
export function purseAfterLoss(record) {
  const source = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const kept = {};
  for (const [key, value] of Object.entries(source)) {
    if (PURSE_KEYS.includes(key)) continue;
    kept[key] = value;
  }
  // The purse is normalised, not trusted: a hand-edited save must not come back as a debt.
  return { ...kept, gold: normalisePurse(source.gold) };
}
