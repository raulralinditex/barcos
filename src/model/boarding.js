/**
 * Boarding model: what the soldiers aboard are worth (S160).
 *
 * The player asked for it (verbatim): "vamos a darles una mecanica a los soldados", and chose
 * all three of the offered mechanics: "las tres". On the capture, which demanded nothing at
 * all: "Sí: la captura pasa a exigir soldados".
 *
 * The three are one number. The soldiers you carry are the ones who shoot from your deck, the
 * ones who hold your own deck against a boarding, and the ones who take a prize. They are not
 * declared three times.
 *
 * Pure and UI-free, like the rest of the model: the sea screen only reads what is here.
 *
 * Measured before writing any of this (T47): with iron shot 100 % of the enemies sink and none
 * strike, so the capture never happened. With hailshot 79 % strike and 79 % are takeable, so
 * the capture rule works and what was missing was the reason to use the round. These numbers
 * do not change that balance; they only gate the capture on soldiers, which is what the player
 * asked for.
 */

import { OARS, soldiersWorth } from "./oars.js";

export const BOARDING = {
  /**
   * How far a musket and a swivel gun carry, in metres. Short on purpose: a boarding is a
   * close fight, and the deck fire is the reason to close the range instead of standing off.
   */
  deckRangeM: 120,
  /**
   * Crew damage points one soldier puts on an enemy deck per volley, before the range
   * falloff. Ten points is two casualties (`COMBAT.casualtyPoints`), so a deck of soldiers
   * is worth a hailshot volley at close quarters and nothing at all at long range.
   */
  deckFirePerSoldier: 0.5,
  /** The ceiling of one deck's fire, so a hull packed with men cannot delete a crew. */
  deckFireMax: 12,
  /**
   * The surrender threshold a hull with no soldiers keeps: the rule the game already had, so
   * a bare hull breaks exactly where it always did.
   */
  baseSurrenderPct: 40,
  /**
   * How much each soldier aboard lowers the surrender threshold, in percentage points. Forty
   * soldiers are worth 8 points, which is a hull that has to be beaten to 32 % of her crew
   * instead of 40 %.
   */
  garrisonPctPerSoldier: 0.2,
  /** The floor of that threshold: a hull full of soldiers still strikes in the end. */
  minSurrenderPct: 15,
  /**
   * Soldiers needed per enemy man still on deck to take her. One for one is a fight you win
   * on equal terms; the measurement showed prizes carry a handful of men, so a real boarding
   * party of twenty or thirty takes almost anything that strikes.
   */
  menPerEnemyMan: 1,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Men on a deck, as a whole number: the four roles the combat model knows. */
function peopleOn(crew) {
  let total = 0;
  for (const role of ["marino", "artillero", "soldado", "remero"]) {
    const count = Number(crew?.[role]);
    if (Number.isFinite(count) && count > 0) total += count;
  }
  return Math.floor(total);
}

/** The soldiers actually aboard, whole men, never invented and never negative. */
export function soldiersAboard(combatant) {
  const count = Number(combatant?.crew?.soldado);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

/**
 * The damage a hull's soldiers put on an enemy deck at `distanceM` (S160-C).
 *
 * It is crew damage only: a musket does not hole a hull, and the round that does is the
 * player's business. The reach falls off with distance like every other shot in the sea, and
 * a hull that is sunk, struck or has no soldiers aboard fires nothing at all.
 */
export function deckFire(combatant, distanceM) {
  const empty = { hull: 0, rigging: 0, crew: 0 };
  if (!combatant || combatant.status !== "fighting") return empty;
  const soldiers = soldiersAboard(combatant);
  if (soldiers <= 0) return empty;
  const distance = Number(distanceM);
  if (!Number.isFinite(distance) || distance < 0) return empty;
  if (distance > BOARDING.deckRangeM) return empty;
  // The same falloff shape the guns use: half the punch at the edge of the reach.
  const falloff = 1 - 0.5 * (distance / BOARDING.deckRangeM);
  const crew = Math.min(BOARDING.deckFireMax, soldiers * BOARDING.deckFirePerSoldier * falloff);
  return { hull: 0, rigging: 0, crew };
}

/**
 * The crew condition at which a hull strikes, given the soldiers holding her deck (S160-D).
 *
 * This is the defensive half of the mechanic: soldiers aboard do not stop the boarding, they
 * make the hull harder to break. A hull with no soldiers keeps the threshold the game already
 * had, so nothing about a bare hull changes (S160-G).
 */
export function garrisonSurrenderPct(combatant) {
  const soldiers = soldiersAboard(combatant);
  if (soldiers <= 0) return BOARDING.baseSurrenderPct;
  const lowered = BOARDING.baseSurrenderPct - soldiers * BOARDING.garrisonPctPerSoldier;
  return Math.max(BOARDING.minSurrenderPct, lowered);
}

/**
 * How the boarding would go: the soldiers you carry against every man still on her deck.
 *
 * `theirs` counts the whole crew, not only her soldiers: a boarding party has to beat
 * everyone who can still hold a weapon, and a hull whose sailors are alive is not a hull you
 * walk onto.
 */
export function boardingOdds(mine, prize) {
  // The boarding party is the soldiers' worth of the crew (S161): her soldiers plus her
  // rowers at the share the player set, because a rower can hold a pike on a taken deck.
  const attackers = Math.floor(soldiersWorth(mine));
  const defenders = peopleOn(prize?.crew);
  const ratio = defenders > 0 ? attackers / defenders : attackers > 0 ? Infinity : 0;
  return {
    mine: attackers,
    theirs: defenders,
    ratio,
    needed: Math.ceil(defenders * BOARDING.menPerEnemyMan),
  };
}

/**
 * Whether a struck hull can be taken (S160-B), and why not when she cannot.
 *
 * The player asked for the capture to demand soldiers: "Sí: la captura pasa a exigir
 * soldados". So a hull with no soldiers aboard loots the prize and sails on, exactly as she
 * did before the rule, and a boarding party that is outnumbered does not take her either.
 *
 * A hull that is still fighting, already sunk, or already taken is no prize at all.
 */
export function canBoard(mine, prize) {
  if (!mine || !prize) return { allowed: false, reason: "no-prize" };
  if (prize.status !== "surrendered") return { allowed: false, reason: "not-struck" };
  const odds = boardingOdds(mine, prize);
  if (odds.mine <= 0) return { allowed: false, reason: "no-soldiers", ...odds };
  if (odds.mine < odds.needed) return { allowed: false, reason: "outnumbered", ...odds };
  return { allowed: true, reason: "taken", ...odds };
}
