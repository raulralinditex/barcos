/**
 * S133-B: a shipyard's name is the player's, stored per yard id.
 *
 * Player's request (verbatim): "cada astillero tendra un nombre diferente que podremos
 * editar". Decision (verbatim): "En el selector del título" — the name is edited from the
 * title bar's yard selector, so this model only owns the naming rule: what a stored name
 * looks like, when it is no name at all, and how it survives a save.
 *
 * Storage-free and pure: the UI owns the save. A name never touches the yard's id, her
 * position, her mooring or her market — `SHIPYARDS` is read here and never written.
 */

import { SHIPYARDS, shipyardById } from "../data/naval-data.js";

/** The longest a yard name may be, so the title bar never has to wrap it. */
export const YARD_NAME_MAX = 28;

/**
 * The name as it will be stored: trimmed, inner runs of space collapsed, and cut to the
 * field's own length. Anything that is not a string, or that reads as blank, is no name.
 */
export function normaliseYardName(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, YARD_NAME_MAX);
}

/** The stored custom name of a yard, or "" when she ships with her own. */
export function yardNameOf(names, yardId) {
  if (!names || typeof names !== "object") return "";
  return normaliseYardName(names[yardId]);
}

/**
 * Set (or clear) one yard's name. An empty or whitespace name removes the custom one, so
 * the shipped name comes back; an unknown yard id is refused instead of inventing a yard.
 */
export function withYardName(names, yardId, value) {
  if (!shipyardById(yardId)) return names && typeof names === "object" ? names : {};
  const next = { ...(names && typeof names === "object" ? names : {}) };
  const clean = normaliseYardName(value);
  if (clean) next[yardId] = clean;
  else delete next[yardId];
  return next;
}

/** The name the selector and the screen show: the custom one, else the shipped one. */
export function yardDisplayName(yard, names, t) {
  if (!yard) return "";
  const custom = yardNameOf(names, yard.id);
  if (custom) return custom;
  return typeof t === "function" ? t(yard.nameKey) : yard.nameKey;
}

/** Serialise the names for autosave; the map is small and survives JSON as it is. */
export function serialiseYardNames(names) {
  return JSON.stringify(names && typeof names === "object" ? names : {});
}

/**
 * Read the saved names, tolerating a broken or hand-edited save: only real yards keep a
 * name, and a name that reads as blank is no name. Anything unreadable is no names, which
 * opens the screen on the names the yards shipped with.
 */
export function parseYardNames(json) {
  let data = null;
  try {
    data = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const names = {};
  for (const yard of SHIPYARDS) {
    const clean = normaliseYardName(data[yard.id]);
    if (clean) names[yard.id] = clean;
  }
  return names;
}
