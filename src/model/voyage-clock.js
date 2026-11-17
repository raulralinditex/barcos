/**
 * S131: the voyage clock the sea panel shows.
 *
 * Everything the shipyard prices per day — the crew's wages, the hull's upkeep, the
 * provisions she carries — is settled here, once, so the panel and the charge can never
 * disagree. The sea spends only the seconds it actually plays (S67): a day in the
 * shipyard is not a day at sea, and the panel counts down exactly that.
 */

import { GAME_TIME } from "./game-time.js";

/** The live length of a game day, never zero or negative (S67). */
function secondsPerDay() {
  const value = Number(GAME_TIME.gameSecondsPerDay);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

/**
 * What the sea panel reads, and what the voyage costs (S131):
 *
 * - `daysLeft` is the supply still aboard, in whole days counted from above, so a part
 *   day still reads as a day the crew can eat;
 * - `upkeep` is the daily cost of the whole fleet, moored hulls included (the player's
 *   decision), and `goldIn` is how many of those days the purse can still pay for.
 *
 * A broken clock reads zero instead of throwing: the panel is a report, never a rule.
 */
export function voyageClock(input) {
  const { supplyLeftS, upkeep, gold } = input && typeof input === "object" ? input : {};
  const reserve = Number(supplyLeftS);
  const daily = Number(upkeep);
  const purse = Number(gold);
  const dayLength = secondsPerDay();
  const seconds = Number.isFinite(reserve) && reserve > 0 ? reserve : 0;
  const cost = Number.isFinite(daily) && daily > 0 ? daily : 0;
  const cash = Number.isFinite(purse) && purse > 0 ? purse : 0;
  return {
    secondsLeft: seconds,
    daysLeft: seconds > 0 ? Math.ceil(seconds / dayLength) : 0,
    dayLength,
    upkeep: cost,
    goldPerDay: cost,
    goldIn: cost > 0 ? Math.floor(cash / cost) : Infinity,
    empty: seconds <= 0,
  };
}
