/**
 * S133-D: the automatic voyage between two shipyards.
 *
 * Player's decision (verbatim): "iniciar viaje automatico con los gastos normales". The
 * quote and the arrival are pure, storage-free functions so the rule can be tested without
 * a browser: the distance is the straight line between the two yards (the shortest honest
 * route), the days are that distance at the captain's speed on the world's arcade scale,
 * and the cost is what those days cost — the supply they eat and the wages of the whole
 * fleet (S131), because that is what a day of voyage already costs at sea.
 *
 * `arriveAt` moves the captain and only her: an escort moored elsewhere stays there, which
 * is the same rule the shipyard has followed since S130. A voyage the captain cannot pay
 * for is refused and changes nothing at all.
 */

import { shipyardById } from "../data/naval-data.js";
import { GAME_TIME } from "./game-time.js";
import { captainShip } from "./fleet.js";
import { KN_TO_MS, WORLD } from "./world.js";

/** The live length of a game day, never zero or negative (S67). */
function secondsPerDay() {
  const value = Number(GAME_TIME.gameSecondsPerDay);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

/** A finite non-negative number, or 0 when the value cannot be one. */
function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

/**
 * What the voyage costs before anything moves (S133-D).
 *
 * Returns null when either end is not a real shipyard: an unknown yard has no water to
 * sail to. A yard that is already under the captain's keel is a zero-day voyage, so the
 * quote stays usable instead of pretending the button does nothing.
 */
export function voyageQuote(fromYardId, toYardId, input = {}) {
  const from = shipyardById(fromYardId);
  const to = shipyardById(toYardId);
  if (!from || !to) return null;

  const { speedKn, supplyDays, gold, upkeep } = input && typeof input === "object" ? input : {};
  const distanceM = Math.hypot(Number(to.x) - Number(from.x), Number(to.y) - Number(from.y));
  const dayLength = secondsPerDay();
  const speed = Number(speedKn);
  const sailable = Number.isFinite(speed) && speed > 0;
  const seconds = sailable ? distanceM / (speed * KN_TO_MS * WORLD.arcadeScale) : Infinity;
  // A real distance always costs at least one day: the crew eats on the way, and a voyage
  // that reads as free would be a lie the purse would have to pay later.
  const days = distanceM > 0 ? Math.max(1, Math.ceil(seconds / dayLength)) : 0;
  const daily = amount(upkeep);
  const cost = Number.isFinite(days) ? days * daily : Infinity;
  const reserve = Number.isFinite(Number(supplyDays)) && Number(supplyDays) > 0 ? Number(supplyDays) : 0;
  const purse = Number.isFinite(Number(gold)) && Number(gold) > 0 ? Number(gold) : 0;
  const supplyShort = Math.max(0, days - reserve);
  const goldShort = Math.max(0, cost - purse);
  return {
    fromYardId: from.id,
    toYardId: to.id,
    distanceM,
    speedKn: sailable ? speed : 0,
    days,
    supplyDays: days,
    gold: cost,
    supplyShort,
    goldShort,
    canMake: sailable && supplyShort <= 0 && goldShort <= 0,
  };
}

/**
 * Put the captain at `yardId`, charging exactly what the quote said (S133-D, S133-E).
 *
 * Only the captain moves: every other hull keeps the yard she was moored at. A refused
 * quote, an unknown yard or a fleet with no captain comes back null and leaves the fleet
 * untouched, so a caller that forgets to check `canMake` cannot half-charge a voyage.
 */
export function arriveAt(fleet, yardId, quote) {
  const yard = shipyardById(yardId);
  if (!yard || !quote || typeof quote !== "object" || quote.canMake !== true) return null;
  const captain = captainShip(fleet);
  if (!captain) return null;
  const ships = (fleet?.ships ?? []).map((ship) =>
    ship.id === captain.id ? { ...ship, yardId: yard.id } : ship,
  );
  return {
    fleet: { ...fleet, ships },
    goldSpent: amount(quote.gold),
    supplyDaysSpent: amount(quote.supplyDays),
  };
}
