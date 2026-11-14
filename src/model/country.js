/**
 * Country catalogue: which hulls and which ordnance a country may buy (S26, S27, S29).
 *
 * Pure lookups over the data. The game keeps two separate ideas:
 *   - `country` is the free-text label shown to the player (unchanged).
 *   - `countries` is the list of stable ASCII ids used to filter the catalogue.
 *
 * Nothing here throws: an unknown or missing country falls back to the default,
 * because a corrupted save must not leave the shipyard unusable.
 */

import { COUNTRIES, DEFAULT_COUNTRY, HULLS, PIECES } from "../data/naval-data.js";

/** True when `id` is one of the known country ids. */
export function isCountryId(id) {
  return COUNTRIES.includes(id);
}

/** The given id when it is known, otherwise the game default (England). */
export function normaliseCountry(id) {
  return isCountryId(id) ? id : DEFAULT_COUNTRY;
}

const belongs = (entry, countryId) =>
  Array.isArray(entry.countries) && entry.countries.includes(countryId);

/** Hulls of a country, in data order. */
export function availableHulls(countryId) {
  const country = normaliseCountry(countryId);
  return HULLS.filter((hull) => belongs(hull, country));
}

/** Ordnance of a country, in data order. Ammunition follows its piece (S29). */
export function availablePieces(countryId) {
  const country = normaliseCountry(countryId);
  return PIECES.filter((piece) => belongs(piece, country));
}

/* ---------------------------------------------------------------- switching country */

/**
 * The country is a property of the shop, so it may only change while the fleet is
 * empty (S26). A ship already bought keeps its own country; the restriction is on
 * the catalogue, never on what the player owns.
 */
export function canChangeCountry(fleet) {
  return (fleet?.ships ?? []).length === 0;
}

/**
 * Bring a half-built loadout into a country's catalogue (S26): an illegal hull is
 * replaced by the first hull the country does sell, and pieces it does not sell are
 * dropped. Everything still legal is returned untouched, so switching back and forth
 * only ever removes what the current country cannot build.
 *
 * Pure and forgiving: a corrupted loadout yields a valid, empty one instead of throwing.
 */
export function reconcileLoadout(loadout, countryId) {
  const hulls = availableHulls(countryId);
  const pieces = availablePieces(countryId);
  const hullIds = hulls.map((hull) => hull.id);
  const pieceIds = pieces.map((piece) => piece.id);

  const batteries = Array.isArray(loadout?.batteries) ? loadout.batteries : [];
  const kept = batteries.filter((entry) => pieceIds.includes(entry?.pieceId));

  const hullId = hullIds.includes(loadout?.hullId) ? loadout.hullId : (hulls[0]?.id ?? null);
  const changed = hullId !== loadout?.hullId || kept.length !== batteries.length;

  return { hullId, batteries: kept, changed };
}
