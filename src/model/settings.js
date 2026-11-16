/**
 * Tuning settings (S33): the game constants the player may change from the settings
 * screen, kept out of the source and out of the save.
 *
 * The rule the whole feature hangs on: a settings value can only make the game
 * harsher or gentler, never broken. Every field declares its own range, so a value
 * outside it is clamped instead of throwing, and anything that is not a finite
 * number falls back to the shipped default. A corrupted settings blob must leave the
 * game playable, exactly like a corrupted save leaves the shipyard usable (S26).
 */

import { COMBAT, LOOT, ZONE_DAMAGE } from "./combat.js";
import { PIECES, PRICES, START } from "../data/naval-data.js";
import { GUNNERY } from "./gunnery.js";
import { REPAIR } from "./repair.js";
import { REFIT } from "./refit.js";
import { SALES } from "./sale.js";
import { SINKING } from "./sinking.js";
import { COMMERCE, MARKETS } from "./commerce.js";
import { GAME_TIME } from "./game-time.js";
import { FORT, FORT_UPGRADE } from "./fort.js";
import { WIND } from "./wind.js";
import { WORLD } from "./world.js";
import { TURNING } from "./turning.js";
import { ESCORT } from "./formation.js";
import { TRAIL } from "./damage-trail.js";
import { BAR_SCALE } from "./sea-hud.js";
import { AUTOFIRE_DEFAULT } from "./autofire.js";

/**
 * The editable fields, grouped by the block they belong to.
 *
 * `get`/`set` read and write the live constant object, so applying settings is a
 * matter of walking this list. `scale` is the unit the field is shown in: a fraction
 * is presented as a percentage, a distance in metres as kilometres.
 */
export const SETTINGS_FIELDS = [
  { group: "wind", key: "maxSpeedBonus", label: "settings.wind.bonus", scale: "percent", min: 0, max: 2, step: 0.05 },
  { group: "wind", key: "maxSpeedPenalty", label: "settings.wind.penalty", scale: "percent", min: 0, max: 0.9, step: 0.05 },
  { group: "wind", key: "driftFactor", label: "settings.wind.drift", scale: "percent", min: 0, max: 1, step: 0.05 },
  { group: "wind", key: "segmentS", label: "settings.wind.segment", scale: "seconds", min: 2, max: 120, step: 1 },
  { group: "wind", key: "forecastS", label: "settings.wind.forecast", scale: "seconds", min: 1, max: 60, step: 1 },
  { group: "wind", key: "minStrengthKn", label: "settings.wind.minStrength", scale: "knots", min: 0, max: 20, step: 0.5 },
  { group: "wind", key: "maxStrengthKn", label: "settings.wind.maxStrength", scale: "knots", min: 5, max: 60, step: 0.5 },

  { group: "world", key: "radiusM", label: "settings.world.radius", scale: "kilometres", min: 1000, max: 20000, step: 100 },
  { group: "world", key: "arcadeScale", label: "settings.world.arcade", scale: "factor", min: 1, max: 40, step: 1 },
  { group: "world", key: "maxTurnRate", label: "settings.world.turn", scale: "rate", min: 0.1, max: 2, step: 0.05 },
  { group: "world", key: "accelerationRate", label: "settings.world.acceleration", scale: "percent", min: 0.02, max: 2, step: 0.01 },
  { group: "world", key: "pickupRadiusM", label: "settings.world.pickup", scale: "metres", min: 10, max: 400, step: 10 },
  { group: "world", key: "spawnRadiusM", label: "settings.world.spawn", scale: "kilometres", min: 500, max: 8000, step: 100 },
  { group: "world", key: "safeZoneM", label: "settings.world.safeZone", scale: "metres", min: 0, max: 3000, step: 50 },
  { group: "world", key: "despawnRadiusM", label: "settings.world.despawn", scale: "kilometres", min: 500, max: 12000, step: 100 },
  { group: "world", key: "disengageRadiusM", label: "settings.world.disengage", scale: "kilometres", min: 1000, max: 16000, step: 100 },
  { group: "world", key: "disengagedDespawnRadiusM", label: "settings.world.disengagedDespawn", scale: "kilometres", min: 2000, max: 20000, step: 100 },

  { group: "combat", key: "openingDamage", label: "settings.combat.openingDamage", scale: "factor", min: 1, max: 3, step: 0.05, targetKey: "openingDamageBonus" },
  { group: "combat", key: "openingAccuracy", label: "settings.combat.openingAccuracy", scale: "factor", min: 1, max: 2, step: 0.05, targetKey: "openingAccuracyBonus" },
  { group: "combat", key: "ammoReloadPenalty", label: "settings.combat.ammoPenalty", scale: "percent", min: 0, max: 1, step: 0.05 },
  { group: "combat", key: "showRange", label: "settings.combat.showRange", scale: "factor", min: 0, max: 1, step: 1 },
  { group: "combat", key: "engageRadiusM", label: "settings.combat.engage", scale: "metres", min: 100, max: 2000, step: 20 },
  { group: "combat", key: "damageScale", label: "settings.combat.damage", scale: "factor", min: 1, max: 40, step: 1 },
  { group: "combat", key: "baseAccuracy", label: "settings.combat.accuracy", scale: "percent", min: 0.1, max: 1, step: 0.05 },
  { group: "combat", key: "timeScale", label: "settings.combat.reload", scale: "factor", min: 1, max: 60, step: 1 },
  { group: "combat", key: "maxBonus", label: "settings.combat.maxBonus", scale: "factor", min: 1, max: 3, step: 0.1, target: "gunnery" },
  ...PIECES.map((piece) => ({ group: "combat", key: `gunners-${piece.id}`, label: `settings.gunners.${piece.id}`, scale: "factor", min: 0.1, max: 4, step: 0.1, target: "gunners", targetKey: piece.id })),
  { group: "combat", key: "surrenderCrewPct", label: "settings.combat.surrender", scale: "percent100", min: 0, max: 100, step: 5 },
  { group: "combat", key: "fleeHullPct", label: "settings.combat.flee", scale: "percent100", min: 0, max: 100, step: 5 },
  // The broadside arc is radians in the model and degrees on the screen (S79). The range
  // stays in model units, like every other field; only what the player types is degrees.
  { group: "combat", key: "arcHalf", label: "settings.combat.arcHalf", scale: "degrees", min: (10 * Math.PI) / 180, max: (90 * Math.PI) / 180, step: 1, convert: { to: (shown) => (shown * Math.PI) / 180, from: (value) => (value * 180) / Math.PI } },
  { group: "combat", key: "referenceArqueo", label: "settings.combat.referenceArqueo", scale: "factor", min: 20, max: 2000, step: 10 },
  { group: "combat", key: "casualtyPoints", label: "settings.combat.casualtyPoints", scale: "factor", min: 1, max: 50, step: 1 },

  { group: "zones", key: "damage-costera", label: "settings.zones.costera", scale: "factor", min: 0, max: 5, step: 0.1, target: "zones", targetKey: "costera" },
  { group: "zones", key: "damage-abierto", label: "settings.zones.abierto", scale: "factor", min: 0, max: 5, step: 0.1, target: "zones", targetKey: "abierto" },
  { group: "zones", key: "damage-abismo", label: "settings.zones.abismo", scale: "factor", min: 0, max: 5, step: 0.1, target: "zones", targetKey: "abismo" },

  { group: "fort", key: "hull", label: "settings.fort.hull", scale: "percent100", min: 10, max: 300, step: 10, target: "fort", targetKey: "hull" },
  { group: "fort", key: "toughness", label: "settings.fort.toughness", scale: "factor", min: 1, max: 400, step: 5, target: "fort", targetKey: "toughness" },
  { group: "fort", key: "gunsPerSide", label: "settings.fort.guns", scale: "factor", min: 0, max: 20, step: 1, target: "fort", targetKey: "gunsPerSide" },
  { group: "fort", key: "gunners", label: "settings.fort.gunners", scale: "factor", min: 0, max: 100, step: 1, target: "fort", targetKey: "gunners" },
  { group: "fort", key: "soldiers", label: "settings.fort.soldiers", scale: "factor", min: 0, max: 1000, step: 10, target: "fort", targetKey: "soldiers" },
  { group: "fort", key: "gunsPerVictories", label: "settings.fort.gunsPerVictories", scale: "factor", min: 1, max: 50, step: 1, target: "fort", targetKey: "gunsPerVictories" },
  { group: "fort", key: "shotsPerGun", label: "settings.fort.shotsPerGun", scale: "factor", min: 1, max: 200, step: 5, target: "fort", targetKey: "shotsPerGun" },

  { group: "time", key: "gameSecondsPerDay", label: "settings.time.day", scale: "seconds", min: 10, max: 600, step: 10 },

  { group: "repair", key: "shareOfPrice", label: "settings.repair.share", scale: "percent", min: 0, max: 1, step: 0.01 },
  { group: "repair", key: "restored", label: "settings.repair.restored", scale: "percent100", min: 10, max: 100, step: 5 },
  { group: "repair", key: "minCost", label: "settings.repair.minCost", scale: "gold", min: 0, max: 500, step: 1 },
  // S111: what her cargo adds to her worth, and so to her repair and her sale price.
  { group: "repair", key: "loadValueShare", label: "settings.repair.loadValue", scale: "percent", min: 0, max: 2, step: 0.05 },

  { group: "loot", key: "hullShare", label: "settings.loot.hullShare", scale: "percent", min: 0, max: 1, step: 0.01, target: "loot", targetKey: "hullShare" },
  { group: "loot", key: "flatGold", label: "settings.loot.flatGold", scale: "gold", min: 0, max: 2000, step: 10, target: "loot", targetKey: "flatGold" },

  // S79: the blocks that were not on the screen at all. Manoeuvring, the escort stations
  // and the damage trail are design numbers like any other, so they get their own group
  // instead of being hidden behind a constant.
  { group: "turning", key: "referenceKg", label: "settings.turning.referenceKg", scale: "factor", min: 10_000, max: 1_000_000, step: 10_000, target: "turning", targetKey: "referenceKg" },
  { group: "turning", key: "exponent", label: "settings.turning.exponent", scale: "factor", min: 0.1, max: 2, step: 0.05, target: "turning", targetKey: "exponent" },
  { group: "turning", key: "minFactor", label: "settings.turning.minFactor", scale: "factor", min: 0.05, max: 1, step: 0.05, target: "turning", targetKey: "minFactor" },
  { group: "turning", key: "maxFactor", label: "settings.turning.maxFactor", scale: "factor", min: 1, max: 3, step: 0.05, target: "turning", targetKey: "maxFactor" },
  // S110: a hull that floats too high steers badly; the threshold and the floor are tuned here.
  { group: "turning", key: "lightLoadThreshold", label: "settings.turning.lightLoad", scale: "percent", min: 0, max: 1, step: 0.05, target: "turning", targetKey: "lightLoadThreshold" },
  { group: "turning", key: "lightLoadFactor", label: "settings.turning.lightFactor", scale: "percent", min: 0.1, max: 1, step: 0.05, target: "turning", targetKey: "lightLoadFactor" },

  { group: "escort", key: "stationM", label: "settings.escort.station", scale: "metres", min: 20, max: 600, step: 10, target: "escort", targetKey: "stationM" },
  { group: "escort", key: "columnM", label: "settings.escort.column", scale: "metres", min: 10, max: 400, step: 5, target: "escort", targetKey: "columnM" },
  { group: "escort", key: "catchUpSpeed", label: "settings.escort.catchUp", scale: "factor", min: 1, max: 3, step: 0.05, target: "escort", targetKey: "catchUpSpeed" },
  { group: "escort", key: "farM", label: "settings.escort.far", scale: "metres", min: 100, max: 4000, step: 50, target: "escort", targetKey: "farM" },
  { group: "escort", key: "stationToleranceM", label: "settings.escort.tolerance", scale: "metres", min: 1, max: 200, step: 1, target: "escort", targetKey: "stationToleranceM" },
  { group: "escort", key: "closingShare", label: "settings.escort.closing", scale: "percent", min: 0, max: 2, step: 0.05, target: "escort", targetKey: "closingShare" },

  { group: "trail", key: "holdS", label: "settings.trail.hold", scale: "seconds", min: 0, max: 5, step: 0.1, target: "trail", targetKey: "holdS" },
  { group: "trail", key: "drainS", label: "settings.trail.drain", scale: "seconds", min: 0.1, max: 10, step: 0.1, target: "trail", targetKey: "drainS" },
  { group: "trail", key: "minPx", label: "settings.trail.minPx", scale: "factor", min: 1, max: 40, step: 1, target: "trail", targetKey: "minPx" },

  { group: "bars", key: "minShare", label: "settings.bars.minShare", scale: "percent", min: 0, max: 1, step: 0.05, target: "bars", targetKey: "minShare" },

  // S88: the automatic-fire switch was a checkbox in the fleet panel; it is a setting now.
  { group: "combat", key: "autofire", label: "settings.combat.autofire", scale: "factor", min: 0, max: 1, step: 1, target: "autofire", targetKey: "enabled" },

  { group: "sales", key: "share", label: "settings.sales.share", scale: "percent", min: 0, max: 1, step: 0.05, target: "sales", targetKey: "share" },

  // S117: what a sunk hull becomes. Off is the game as it always played (she is gone);
  // on leaves her waiting in a yard as a wreck that can be floated again. `control:
  // "switch"` is what the screen reads to draw a checkbox: the player asked for one.
  { group: "sinking", key: "keepWreck", label: "settings.sinking.keepWreck", scale: "factor", min: 0, max: 1, step: 1, control: "switch", target: "sinking", targetKey: "keepWreck" },

  // The refit editor saves by itself when this is on (the default); off brings the save
  // button back. A switch, like the wreck one above.
  { group: "refit", key: "autoSave", label: "settings.refit.autoSave", scale: "factor", min: 0, max: 1, step: 1, control: "switch", target: "refit", targetKey: "autoSave" },

  // S113/S115: the trade. What a sunk hold still pays, how much an enemy carries, and
  // the two prices of each zone. The spread between a zone's buy and sell is the whole
  // economy, so it is the first thing a player who finds the run too rich will move.
  { group: "commerce", key: "sunkCargoShare", label: "settings.commerce.sunkShare", scale: "percent", min: 0, max: 1, step: 0.05, target: "commerce", targetKey: "sunkCargoShare" },
  { group: "commerce", key: "enemyHoldKg", label: "settings.commerce.enemyHold", scale: "factor", min: 0, max: 60000, step: 500, target: "commerce", targetKey: "enemyHoldKg" },
  { group: "commerce", key: "buy-costera", label: "settings.commerce.buyCostera", scale: "percent", min: 0.1, max: 4, step: 0.05, target: "markets", targetKey: "costera", targetField: "buy" },
  { group: "commerce", key: "sell-costera", label: "settings.commerce.sellCostera", scale: "percent", min: 0.1, max: 8, step: 0.05, target: "markets", targetKey: "costera", targetField: "sell" },
  { group: "commerce", key: "buy-abierto", label: "settings.commerce.buyAbierto", scale: "percent", min: 0.1, max: 4, step: 0.05, target: "markets", targetKey: "abierto", targetField: "buy" },
  { group: "commerce", key: "sell-abierto", label: "settings.commerce.sellAbierto", scale: "percent", min: 0.1, max: 8, step: 0.05, target: "markets", targetKey: "abierto", targetField: "sell" },
  { group: "commerce", key: "buy-abismo", label: "settings.commerce.buyAbismo", scale: "percent", min: 0.1, max: 4, step: 0.05, target: "markets", targetKey: "abismo", targetField: "buy" },
  { group: "commerce", key: "sell-abismo", label: "settings.commerce.sellAbismo", scale: "percent", min: 0.1, max: 8, step: 0.05, target: "markets", targetKey: "abismo", targetField: "sell" },

  // Minimum 2500: the cheapest playable hull of the dearest country (Portugal) costs 2036,
  // so a poorer start would leave a whole nation's captain unable to buy a single ship.
  { group: "prices", key: "startGold", label: "settings.prices.startGold", scale: "gold", min: 2500, max: 1000000, step: 500, target: "start", targetKey: "gold" },
  { group: "prices", key: "provisionGoldPerPersonDay", label: "settings.prices.provisions", scale: "goldPrecise", min: 0, max: 5, step: 0.01 },
  { group: "prices", key: "powderGoldPerKg", label: "settings.prices.powder", scale: "goldPrecise", min: 0, max: 20, step: 0.1 },
  { group: "prices", key: "cargoGoldPerKg", label: "settings.prices.cargo", scale: "goldPrecise", min: 0, max: 2, step: 0.01 },
  { group: "prices", key: "ballastGoldPerKg", label: "settings.prices.ballast", scale: "goldPrecise", min: 0, max: 1, step: 0.01 },

  // Fort reinforcement (S100, S102): the price of each bought gun and the cap, and the
  // pinch a fort repair is measured against, all tunable like every other block.
  { group: "fortUpgrade", key: "gunCost", label: "settings.fortUpgrade.gunCost", scale: "gold", min: 0, max: 5000, step: 50, target: "fortUpgrade", targetKey: "gunCost" },
  { group: "fortUpgrade", key: "maxPerSide", label: "settings.fortUpgrade.maxPerSide", scale: "factor", min: 0, max: 30, step: 1, target: "fortUpgrade", targetKey: "maxPerSide" },
  { group: "fortUpgrade", key: "repairPinch", label: "settings.fortUpgrade.repairPinch", scale: "gold", min: 0, max: 20000, step: 50, target: "fortUpgrade", targetKey: "repairPinch" },
];

/** The live constant blocks, so a group id resolves to the object it writes to. */
/** The automatic-fire switch as a live block, so it is a setting like any other (S88). */
export const AUTOFIRE = { enabled: AUTOFIRE_DEFAULT ? 1 : 0 };

export const SETTINGS_BLOCKS = { wind: WIND, world: WORLD, combat: COMBAT, repair: REPAIR, prices: PRICES, gunnery: GUNNERY, gunners: GUNNERY.gunnersPerGun, zones: ZONE_DAMAGE, loot: LOOT, sales: SALES, time: GAME_TIME, fort: FORT, fortUpgrade: FORT_UPGRADE, start: START, turning: TURNING, escort: ESCORT, trail: TRAIL, bars: BAR_SCALE, autofire: AUTOFIRE, sinking: SINKING, refit: REFIT, commerce: COMMERCE, markets: MARKETS };

/**
 * The design constant blocks S79 promises to expose, by name.
 *
 * This is the list the settings screen must cover completely: a numeric field here that
 * `SETTINGS_FIELDS` does not reach is a hardcoded design decision, which is exactly what
 * S79 removes. `ENEMY_POOLS` and `FLAGS` are absent on purpose: their contents are lists
 * of ids and colours, not tuning numbers.
 */
export const DESIGN_BLOCKS = {
  wind: WIND,
  world: WORLD,
  combat: COMBAT,
  zones: ZONE_DAMAGE,
  loot: LOOT,
  gunnery: GUNNERY,
  fort: FORT,
  repair: REPAIR,
  sales: SALES,
  time: GAME_TIME,
  turning: TURNING,
  escort: ESCORT,
  trail: TRAIL,
  bars: BAR_SCALE,
};
const targetOf = (field) => SETTINGS_BLOCKS[field.target ?? field.group];
/**
 * The object one field actually writes to. Almost every field is a key of its block;
 * a market price is a key of a key (MARKETS.abierto.buy), because a zone's market is
 * one record with two sides and splitting it into eight blocks would be worse (S113).
 */
const slotOf = (field) => {
  if (!field.targetField) return targetOf(field);
  const key = field.targetKey ?? field.key;
  return targetOf(field)[key] ?? null;
};
const keyOf = (field) => field.targetField ?? field.targetKey ?? field.key;

/** Read a field's live value, failing to the shipped default instead of throwing. */
const readOf = (field) => {
  const slot = slotOf(field);
  return slot ? slot[keyOf(field)] : undefined;
};

/** Write a field's live value, ignoring a block that is not there. */
const writeOf = (field, value) => {
  const slot = slotOf(field);
  if (slot) slot[keyOf(field)] = value;
};

/** Field ids, stable across releases: what the stored settings are keyed by. */
export const fieldId = (field) => `${field.group}.${field.key}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * One field's shipped value, read from the live defaults. Captured once so
 * "reset" restores what the source says, not whatever the player typed before.
 */
export const SETTINGS_DEFAULTS = Object.fromEntries(
  SETTINGS_FIELDS.map((field) => [fieldId(field), readOf(field)]),
);

/**
 * Clamp one value into its field's range. A value that is not a finite number (a
 * blank input, a broken save) resolves to the shipped default, never to NaN.
 */
export function normaliseFieldValue(field, value) {
  const fallback = SETTINGS_DEFAULTS[fieldId(field)];
  // `Number(null)` and `Number(true)` are numbers, and a blank input is what an
  // empty box hands back: none of them is a tuning value, so they fall back.
  if (value === null || value === undefined || typeof value === "boolean") return fallback;
  if (typeof value === "string" && value.trim() === "") return fallback;
  if (typeof value === "object") return fallback;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, field.min, field.max);
}

/**
 * Normalise a whole settings object: every known field present, in range, and any
 * unknown key dropped. Never throws, whatever it is handed.
 */
export function normaliseSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const result = {};
  for (const field of SETTINGS_FIELDS) {
    const id = fieldId(field);
    result[id] = normaliseFieldValue(field, source[id]);
  }
  // The wind's range must stay a range: a minimum above the maximum is nonsense.
  const minId = "wind.minStrengthKn";
  const maxId = "wind.maxStrengthKn";
  if (result[minId] >= result[maxId]) result[minId] = SETTINGS_DEFAULTS[minId];
  return result;
}

/** The settings currently in force, so the screen opens showing the truth. */
export function currentSettings() {
  const result = {};
  for (const field of SETTINGS_FIELDS) {
    result[fieldId(field)] = readOf(field);
  }
  return result;
}

/**
 * Write settings into the live constants. Only known fields are touched, each one
 * clamped, so a partial or corrupted object can never break the game.
 * Returns the settings actually applied.
 */
export function applySettings(raw) {
  const settings = normaliseSettings(raw);
  for (const field of SETTINGS_FIELDS) {
    writeOf(field, settings[fieldId(field)]);
  }
  return settings;
}

/** Shipped values, applied. */
export function resetSettings() {
  return applySettings(SETTINGS_DEFAULTS);
}

/** A settings value in the unit the screen shows: 0.6 -> 60 for a percentage. */
export function toDisplay(field, value) {
  // A field that is shown in a different unit than it is stored in (S79: the broadside
  // arc is radians in the model and degrees on the screen) owns its own conversion.
  if (field.convert) return field.convert.from(value);
  switch (field.scale) {
    case "percent":
      return Math.round(value * 1000) / 10;
    case "percent100":
      return value;
    case "kilometres":
      return Math.round(value / 10) / 100;
    case "metres":
      return value;
    default:
      return value;
  }
}

/** A value typed on the screen back to the unit the model uses. */
export function fromDisplay(field, shown) {
  if ((field.target === "gunnery" || field.target === "gunners") &&
      (typeof shown !== "string" || shown.trim() === "")) {
    return normaliseFieldValue(field, shown);
  }
  const numeric = Number(shown);
  if (!Number.isFinite(numeric)) return SETTINGS_DEFAULTS[fieldId(field)];
  if (field.convert) return field.convert.to(numeric);
  switch (field.scale) {
    case "percent":
      return numeric / 100;
    case "kilometres":
      return numeric * 1000;
    default:
      return numeric;
  }
}
