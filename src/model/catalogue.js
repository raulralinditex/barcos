/**
 * The editable catalogue (S80-S83): new hulls, new pieces, and the historical margin
 * that keeps a shipped record from becoming something else.
 *
 * Three ideas, and the third is the one that protects the game:
 *
 *  - A **new** record is free. Nobody measured it, so there is no margin to respect.
 *  - A **shipped** record keeps its identity: id, name, type, country, date and
 *    provenance are read-only. Only its numbers move, and only inside the margin the
 *    datum itself declares.
 *  - A catalogue read from storage is merged, never applied: a stored record can add
 *    a hull, never overwrite one that shipped.
 *
 * Pure and forgiving, like the rest of the model: a broken catalogue yields the
 * shipped one instead of throwing, because losing the fleet to a bad JSON blob is a
 * far worse outcome than ignoring it.
 */

import { CONVENTIONS, HULLS, PIECES } from "../data/naval-data.js";

/**
 * The margin a field gets when its own datum declares no range (S82).
 *
 * Declared as a decision, not as a datum: for every field except `arqueo` the dataset
 * carries a single number and no interval, so there is nothing to read a margin from.
 * Half either way is wide enough to tune a value and narrow enough that it cannot
 * become a different thing.
 */
export const CONVENTION_MARGIN = 0.5;

/**
 * The fields that identify a historical record (S82). They are never written by the
 * settings screen, whatever the stored blob asks for.
 */
const IDENTITY_FIELDS = new Set(["id", "name", "type", "country", "date", "provenance", "note"]);

/** True when the field is part of a record's identity and therefore read-only. */
export function isIdentityField(key) {
  return IDENTITY_FIELDS.has(key);
}

/** The fields a hull is created from: the transcribed ones. The rest are derived. */
const HULL_TRANSCRIBED = [
  "lengthM",
  "beamM",
  "draftRefM",
  "maxPiecesPerSide",
  "crewMin",
  "priceGold",
];

/** The fields a hull gets from its transcribed ones and never sets by hand (S80). */
const HULL_DERIVED = ["arqueoMid", "displacementKg", "lightMassKg", "waterplaneM2", "draftRefFraction"];

/**
 * The margin a field of a record may move within, as a fraction of the shipped value
 * (S82). `null` means the record is new: there is no datum, so there is no margin.
 *
 * Only `arqueo` carries a measured range in this dataset, and only for a shipped hull.
 * Its margin is the half width of that range over its midpoint, which is exactly what
 * "the range the source declares" means: a hull quoted as [400, 500] may honestly move
 * 11 % either way, and one quoted as [291, 1200] may move 61 %.
 *
 * A degenerate range ([166, 166]) would give a 0 % margin and freeze the record, which
 * is not what "editable within a historical margin" means, so it falls back to the
 * convention margin like every other field.
 */
export function historicalMargin(record, key) {
  if (!record || typeof record !== "object") return null;
  // A record the game did not ship has no historical datum to respect (L35).
  if (record.provenance === "nueva") return null;
  if (key === "arqueo" && Array.isArray(record.arqueo) && record.arqueo.length === 2) {
    const [low, high] = record.arqueo.map(Number);
    const mid = (low + high) / 2;
    if (Number.isFinite(mid) && mid > 0) {
      const half = (high - low) / 2 / mid;
      if (half > 0) return half;
    }
  }
  return CONVENTION_MARGIN;
}

/** The value the margin is measured against: a range collapses to its midpoint. */
const referenceValue = (value) =>
  Array.isArray(value) ? (Number(value[0]) + Number(value[1])) / 2 : Number(value);

/**
 * Whether `candidate` sits inside the record's historical margin for `key` (S82).
 * A new record accepts anything; a value that is not a number never does.
 */
export function withinMargin(record, key, candidate) {
  const margin = historicalMargin(record, key);
  if (margin === null) return true;
  const base = referenceValue(record[key]);
  const value = referenceValue(candidate);
  if (!Number.isFinite(base) || !Number.isFinite(value) || base <= 0) return false;
  return Math.abs(value - base) / base <= margin + 1e-9;
}

/** Pull a value back to the edge of the margin, keeping its sign and its shape. */
function clampToMargin(record, key, candidate) {
  const margin = historicalMargin(record, key);
  if (margin === null) return candidate;
  const base = referenceValue(record[key]);
  if (!Number.isFinite(base) || base <= 0) return record[key];
  const value = referenceValue(candidate);
  if (!Number.isFinite(value)) return record[key];
  const lowest = base * (1 - margin);
  const highest = base * (1 + margin);
  const bounded = Math.min(highest, Math.max(lowest, value));
  if (!Array.isArray(candidate)) return bounded;
  // A range keeps its own width and only slides, which is what "the same kind of datum,
  // moved" means for an interval.
  const width = Number(candidate[1]) - Number(candidate[0]);
  return [bounded - width / 2, bounded + width / 2];
}

/**
 * Recompute the fields a hull does not set by hand (S80). The same arithmetic the
 * shipped catalogue runs at import time, so a new hull is not a second-class record.
 */
export function deriveHull(hull) {
  if (!hull || typeof hull !== "object") return null;
  const [low, high] = Array.isArray(hull.arqueo) ? hull.arqueo.map(Number) : [NaN, NaN];
  const arqueoMid = (low + high) / 2;
  if (!Number.isFinite(arqueoMid) || arqueoMid <= 0) return null;
  const displacementKg = arqueoMid * CONVENTIONS.displacementPerArqueoTon * 1000;
  const lengthM = Number(hull.lengthM);
  const beamM = Number(hull.beamM);
  const waterplaneM2 =
    Number.isFinite(lengthM) && Number.isFinite(beamM)
      ? lengthM * beamM * CONVENTIONS.waterplaneFraction
      : 0;
  return {
    ...hull,
    arqueo: [low, high],
    arqueoMid,
    displacementKg: Math.round(displacementKg),
    lightMassKg: Math.round(displacementKg * CONVENTIONS.lightMassFraction),
    waterplaneM2: Math.round(waterplaneM2 * 10) / 10,
    draftRefFraction: 0.75,
  };
}

/** A slug an id can be built from: ASCII, lowercase, dashes (S80). */
const slug = (text) =>
  String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * An id derived from a name, made unique against the ids already in use (S80). A
 * collision gets a numeric suffix instead of silently overwriting a shipped record.
 */
export function catalogueIdFrom(name, taken = new Set()) {
  const base = slug(name);
  if (!base) return null;
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

/**
 * A brand new hull (S80). Returns null when it is not usable, so the screen can refuse
 * it without a half-built record ever reaching the catalogue.
 */
export function newHull(input, taken = new Set()) {
  if (!input || typeof input !== "object") return null;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return null;
  const id = input.id && !taken.has(input.id) ? slug(input.id) : catalogueIdFrom(name, taken);
  if (!id) return null;
  const arqueo = Array.isArray(input.arqueo) ? input.arqueo.map(Number) : [NaN, NaN];
  if (!arqueo.every(Number.isFinite) || arqueo[0] <= 0 || arqueo[1] < arqueo[0]) return null;

  const record = {
    id,
    countries: Array.isArray(input.countries) && input.countries.length > 0 ? [...input.countries] : ["inglaterra"],
    name,
    type: typeof input.type === "string" && input.type.trim() ? input.type.trim() : name,
    country: typeof input.country === "string" ? input.country : "",
    date: typeof input.date === "string" ? input.date : "",
    arqueo,
    provenance: "nueva",
    note: typeof input.note === "string" ? input.note : "",
    lengthM: Number(input.lengthM) || 0,
    beamM: Number(input.beamM) || 0,
    draftRefM: Number(input.draftRefM) || 0,
    draftSource: "derived",
    maxPiecesPerSide: Number(input.maxPiecesPerSide) || 0,
    crewMin: Number(input.crewMin) || 0,
    priceGold: Number(input.priceGold) || 0,
  };
  return deriveHull(record);
}

/** A brand new piece of ordnance (S81). Null when it is not usable. */
export function newPiece(input, taken = new Set()) {
  if (!input || typeof input !== "object") return null;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return null;
  const id = input.id && !taken.has(input.id) ? slug(input.id) : catalogueIdFrom(name, taken);
  if (!id) return null;
  const shotKg = Number(input.shotKg);
  const rangeM = Number(input.rangeM);
  const reloadS = Number(input.reloadS);
  const mountKg = Number(input.mountKg);
  const priceGold = Number(input.priceGold);
  if (!(shotKg > 0) || !(rangeM > 0) || !(reloadS > 0)) return null;
  return {
    id,
    countries: Array.isArray(input.countries) && input.countries.length > 0 ? [...input.countries] : ["inglaterra"],
    name,
    family: typeof input.family === "string" && input.family.trim() ? input.family.trim() : "cañón",
    shotKg,
    rangeM,
    reloadS,
    mountKg: Number.isFinite(mountKg) && mountKg > 0 ? mountKg : 0,
    priceGold: Number.isFinite(priceGold) && priceGold > 0 ? priceGold : 0,
    // A piece the game did not ship is not dressed as a historical find (S81).
    provenance: "nueva",
    ammo: Array.isArray(input.ammo) && input.ammo.length > 0 ? [...input.ammo] : ["bala-hierro"],
  };
}

/** The shipped ids, so a stored record can be told apart from a new one. */
const shippedIds = (list) => new Set(list.map((entry) => entry.id));

/**
 * Merge a catalogue read from storage into the shipped one (S83).
 *
 * The rule that matters: a stored record whose id already shipped **edits** it, and
 * only inside its margin; it never replaces it. A stored record with a new id is added
 * whole. Anything malformed is dropped, and a broken catalogue yields the shipped
 * lists untouched.
 */
export function mergeCatalogue(hulls, pieces, stored) {
  const shippedHulls = Array.isArray(hulls) ? hulls : HULLS;
  const shippedPieces = Array.isArray(pieces) ? pieces : PIECES;
  const source = stored && typeof stored === "object" ? stored : {};

  const mergeList = (shipped, incoming, builder) => {
    const byId = new Map(shipped.map((entry) => [entry.id, entry]));
    const extra = [];
    for (const candidate of Array.isArray(incoming) ? incoming : []) {
      if (!candidate || typeof candidate !== "object") continue;
      const id = typeof candidate.id === "string" ? candidate.id : null;
      if (!id) continue;
      const shippedEntry = byId.get(id);
      if (!shippedEntry) {
        const built = builder(candidate, new Set(byId.keys()));
        if (built) {
          byId.set(built.id, built);
          extra.push(built);
        }
        continue;
      }
      // A shipped record: only its numbers move, and only inside the margin.
      const edited = { ...shippedEntry };
      for (const [key, value] of Object.entries(candidate)) {
        if (isIdentityField(key)) continue;
        if (!(key in shippedEntry)) continue;
        edited[key] = clampToMargin(shippedEntry, key, value);
      }
      byId.set(id, edited);
    }
    return shipped.map((entry) => byId.get(entry.id)).concat(extra);
  };

  return {
    hulls: mergeList(shippedHulls, source.hulls, newHull),
    pieces: mergeList(shippedPieces, source.pieces, newPiece),
  };
}

/** A catalogue that is always a pair of arrays, whatever it is handed (S83). */
export function normaliseCatalogue(stored) {
  const merged = mergeCatalogue(HULLS, PIECES, stored);
  return { hulls: merged.hulls, pieces: merged.pieces };
}

export { HULL_TRANSCRIBED, HULL_DERIVED };
