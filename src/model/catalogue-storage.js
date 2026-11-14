/**
 * Where the editable catalogue lives between sessions (S83).
 *
 * Storage only, like `settings-storage.js`: the rules are in `catalogue.js`, which
 * stays pure and testable. The key carries the game's own prefix and holds the records
 * the player created or edited, never a copy of the shipped catalogue: a shipped record
 * that was never touched is not stored, so a game update is not fought by an old save.
 */

import { HULLS, PIECES } from "../data/naval-data.js";
import { mergeCatalogue, normaliseCatalogue } from "./catalogue.js";

export const CATALOGUE_KEY = "barcos:catalogue:v1";

/** The catalogue stored in this browser, already merged and safe. Never throws. */
export function loadStoredCatalogue() {
  try {
    const raw = localStorage.getItem(CATALOGUE_KEY);
    return normaliseCatalogue(raw ? JSON.parse(raw) : null);
  } catch {
    return normaliseCatalogue(null);
  }
}

/** Write the catalogue to the browser. A storage failure keeps it for this session. */
export function saveStoredCatalogue(catalogue) {
  try {
    const stored = {
      hulls: (catalogue?.hulls ?? []).filter((hull) => hull?.provenance === "nueva"),
      pieces: (catalogue?.pieces ?? []).filter((piece) => piece?.provenance === "nueva"),
    };
    localStorage.setItem(CATALOGUE_KEY, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

/**
 * Put a catalogue into the live data the rest of the game imports (S83).
 *
 * The shipped lists are module-level arrays that every model already holds a reference
 * to, so the merge is applied **in place**: a new hull is pushed, an edited shipped
 * hull is updated field by field, and no import has to change. That is the same shape
 * the settings use, where the blocks are mutated rather than replaced.
 *
 * Returns what ended up live, so a caller can report it.
 */
export function applyCatalogue(catalogue) {
  const merged = normaliseCatalogue(catalogue ?? null);
  const live = { hulls: HULLS, pieces: PIECES };

  for (const target of [
    { list: HULLS, incoming: merged.hulls },
    { list: PIECES, incoming: merged.pieces },
  ]) {
    const byId = new Map(target.list.map((entry) => [entry.id, entry]));
    for (const record of target.incoming) {
      const existing = byId.get(record.id);
      if (existing) {
        // A shipped record: copy the numbers in, never the identity and never the object.
        for (const [key, value] of Object.entries(record)) {
          if (key === "id") continue;
          if (JSON.stringify(existing[key]) === JSON.stringify(value)) continue;
          existing[key] = value;
        }
        continue;
      }
      target.list.push(record);
      byId.set(record.id, record);
    }
  }
  return live;
}

/** The boot step both screens run: read what is stored and put it into the live data. */
export function bootCatalogue() {
  return applyCatalogue(loadStoredCatalogue());
}
