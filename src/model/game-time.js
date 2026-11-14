/**
 * S67: how long a day of game time lasts, and what the crew's supply does.
 *
 * The workbook prices everything per real-world day: provisions per person per day,
 * wages per day, upkeep per day. None of that is re-priced here. The only new rule is
 * the conversion — how many seconds of play stand for one of those days — so the
 * shipyard's balance is exactly what it was.
 *
 * The other half is the part that never existed: the supply was bought and weighed but
 * never spent. It is a reserve now, burned by the world clock; every whole day it gives
 * up is a day of wages the crew is owed.
 */

export const GAME_TIME = {
  /** Seconds of play that stand for one day of the workbook's per-day prices (S67). */
  gameSecondsPerDay: 100,
};

/** The live length of a game day, never zero or negative (S67). */
function secondsPerDay() {
  const value = Number(GAME_TIME.gameSecondsPerDay);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

/** Seconds of supply for a number of days (S67). */
export function supplySeconds(days) {
  const count = Number(days);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return count * secondsPerDay();
}

/** Days of supply for a number of seconds (S67). */
export function daysOfSupply(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value / secondsPerDay();
}

/** Whole game days that have elapsed in a number of seconds (S67). */
export function gameDays(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / secondsPerDay());
}

/**
 * Burn `dt` seconds of world time off a supply reserve (S67). Returns the reserve left,
 * the whole days it gave up, and whether this step is the one that emptied it — the
 * moment to warn the player, not every step after.
 *
 * The reserve never goes negative: a long step spends what is left and no more, so a
 * broken or huge `dt` cannot buy days the ship never carried.
 */
export function burnSupply(secondsLeft, dt) {
  const reserve = Number(secondsLeft);
  const step = Number(dt);
  if (!Number.isFinite(reserve) || reserve <= 0) {
    return { secondsLeft: 0, daysSpent: 0, exhausted: false };
  }
  if (!Number.isFinite(step) || step <= 0) {
    return { secondsLeft: reserve, daysSpent: 0, exhausted: false };
  }

  const after = Math.max(0, reserve - step);
  // A day is charged when the reserve crosses one of its whole-day marks, counted from
  // above: 45 days down to 42.5 has crossed 44 and 43, so two days are owed and the half
  // day stays in the reserve for the next step. Counting from below instead would charge
  // three, because the reserve starts exactly on a mark. The last part-day is charged
  // when the reserve empties: the crew ate it, and it happens once.
  const dayLength = secondsPerDay();
  const daysSpent = Math.max(0, Math.ceil(reserve / dayLength) - Math.ceil(after / dayLength));
  return {
    secondsLeft: after,
    daysSpent,
    exhausted: after <= 0 && reserve > 0,
  };
}
