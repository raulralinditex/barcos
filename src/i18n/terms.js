/**
 * Localised views over the naval dataset (S11).
 *
 * The dataset stays pure numbers and ids; this module resolves the human-facing
 * name, type, country, note and description through the translator, falling back
 * to the raw Spanish field if a key is somehow missing.
 */

import { AMMO, CREW_ROLES, HULLS, PIECES, ZONES, ammoById, hullById, pieceById } from "../data/naval-data.js";

/** Copy an entity with its text fields resolved through `t`, falling back to the raw field. */
function localise(entity, prefix, fields, t) {
  if (!entity) return null;
  const localised = { ...entity };
  for (const field of fields) {
    if (entity[field] === undefined) continue;
    const key = `${prefix}.${entity.id}.${field}`;
    const translated = t(key);
    // t() returns the key itself when it is missing; keep the dataset text then.
    localised[field] = translated === key ? entity[field] : translated;
  }
  return localised;
}

export const localisedHull = (hullOrId, t) => {
  const hull = typeof hullOrId === "string" ? hullById(hullOrId) : hullOrId;
  // A hull created on the settings screen has no entry in either catalogue (S80), and
  // the name it was given is the only name it has: `localise` already falls back to the
  // dataset text when a key is missing, which is exactly right here.
  return localise(hull, "hull", ["name", "type", "country", "note"], t);
};

export const localisedPiece = (pieceOrId, t) => {
  const piece = typeof pieceOrId === "string" ? pieceById(pieceOrId) : pieceOrId;
  // `note` only exists on some pieces; only translate the ones that have it.
  const fields = piece && piece.note !== undefined ? ["name", "note"] : ["name"];
  return localise(piece, "piece", fields, t);
};

export const localisedAmmo = (ammoOrId, t) => {
  const ammo = typeof ammoOrId === "string" ? ammoById(ammoOrId) : ammoOrId;
  return localise(ammo, "ammo", ["name"], t);
};

export const localisedZone = (zone, t) => localise(zone, "zone", ["name", "description"], t);

export const localisedCrewRole = (roleOrId, t) => {
  const role =
    typeof roleOrId === "string" ? CREW_ROLES.find((r) => r.id === roleOrId) : roleOrId;
  return localise(role, "crew", ["name", "description"], t);
};

/** Whole lists, already translated, for rendering pickers and lists. */
export const localisedHulls = (t) => HULLS.map((hull) => localisedHull(hull, t));
export const localisedPieces = (t) => PIECES.map((piece) => localisedPiece(piece, t));
export const localisedAmmoList = (t) => AMMO.map((ammo) => localisedAmmo(ammo, t));
export const localisedZones = (t) => ZONES.map((zone) => localisedZone(zone, t));
export const localisedCrewRoles = (t) => CREW_ROLES.map((role) => localisedCrewRole(role, t));

/** Default ship name for a hull, in the active language. */
export const defaultShipNameFor = (hullId, t) => t(`shipName.${hullId}`);

/**
 * Render one validation issue as text (S11/S14). The model reports a code and
 * params; the wording comes from the catalogue.
 */
export function issueMessage(issue, t) {
  if (!issue || !issue.code) return "";
  return t(`issue.${issue.code}`, issue.params ?? {});
}

/**
 * Translated gun family ("cañón" -> "cannon"). The key is the family stripped of
 * accents and spaces, so the dataset keeps its raw Spanish text as the fallback.
 */
export function familyLabel(family, t) {
  const slug = String(family)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-");
  const key = `shipyard.family.${slug}`;
  const translated = t(key);
  return translated === key ? family : translated;
}
