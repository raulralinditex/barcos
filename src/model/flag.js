/**
 * S72: the flag each hull flies.
 *
 * One fleet, one flag. The captain's colours are the fleet's, so an escort taken as a
 * prize from another nation still flies the captain's — the player's decision, stated
 * plainly: "siempre la de la capitana, sin excepción".
 *
 * An enemy is the exception, and not a real one: she is not in the player's fleet, so she
 * flies her own hull's colours.
 *
 * The rules live here, pure and testable, because a flag is a claim about who a ship is:
 * getting it wrong says a Spanish prize is still Spanish while she sails under English
 * orders.
 */

import { COUNTRIES, hullById } from "../data/naval-data.js";
import { isCountryId } from "./country.js";

/** The country id a hull was built in, resolved from its own catalogue entry (S72). */
export function hullCountryId(hullId) {
  const hull = hullById(hullId);
  if (!hull) return null;
  // The catalogue already declares which countries may buy a hull; the first one is the
  // hull's own nation, which is what its `country` label names.
  if (Array.isArray(hull.countries) && hull.countries.length > 0) return hull.countries[0];
  return null;
}

/**
 * The flag one hull flies (S72).
 *
 * `isFleet` is what decides it: a hull in the player's fleet flies the captain's flag,
 * whatever her own nation, and an enemy flies her own. A hull whose nation cannot be
 * resolved, and a captain whose nation cannot be resolved, fall back to the default
 * country rather than leaving the mast bare.
 */
export function flagFor(input) {
  // A null or non-object argument must not throw: the sea calls this for every hull it
  // draws, including one whose record failed to load.
  const { hullId, isFleet = false, captainHullId = null, country = null } =
    input && typeof input === "object" ? input : {};
  if (isFleet) {
    // The player's fleet flies the country the player selected, whatever her hulls were
    // built as. Without a valid one the captain's hull decides, as it always did (S72).
    if (isCountryId(country)) return country;
    return hullCountryId(captainHullId) ?? hullCountryId(hullId) ?? COUNTRIES[0];
  }
  return hullCountryId(hullId) ?? COUNTRIES[0];
}

/** The flag a shipyard flies: the player's selected country, or the default one. */
export function yardFlag(country) {
  return isCountryId(country) ? country : COUNTRIES[0];
}

/**
 * The colours to paint, per country (S72). Kept here beside the rule so the sea only has
 * to look up an id: three stripes for each, in the order they are drawn top to bottom.
 */
export const FLAGS = {
  inglaterra: {
    /** The cross of St George: white field, red cross. */
    bands: ["#f4f1e8", "#f4f1e8", "#f4f1e8"],
    cross: "#b02a24",
  },
  espana: {
    /** The cross of Burgundy over a white field, the colours of the tercios. */
    bands: ["#f4f1e8", "#f4f1e8", "#f4f1e8"],
    cross: "#a8241c",
    ragged: true,
  },
  portugal: {
    bands: ["#1c5c3a", "#f4f1e8", "#f4f1e8"],
    cross: "#a8241c",
  },
  "paises-bajos": {
    /** The Prince's flag: orange, white and blue. */
    bands: ["#d4711f", "#f4f1e8", "#2a5c9c"],
    cross: null,
  },
};

/** The colours of one country, falling back to the default flag (S72). */
export function flagColours(countryId) {
  return FLAGS[countryId] ?? FLAGS[COUNTRIES[0]];
}
