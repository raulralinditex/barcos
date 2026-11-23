/**
 * S171: "batalla por nivel", the rule the game plays today.
 *
 * This file owns no new behaviour. Every line here was inside `world.js` and `levels.js`
 * before the refactor: the cap per zone (S150), the advance on victories (S150), the seed of
 * a fresh sea (S140) and the progress the shipyard shows. Moving it here is what turns those
 * rules into a mode; changing them would be a different task.
 *
 * The curve itself stays in `levels.js`, which the settings screen tunes. This mode reads it.
 */

import {
  enemiesForLevel,
  enemiesPerZone,
  levelFromGameSave,
  levelProgressFromGameSave,
  normaliseLevel,
  victoriesForLevel,
} from "../levels.js";
import { seedLevel } from "../world.js";

/** The id this mode answers to, and the key the screen names it with. */
export const id = "batalla-por-nivel";
export const labelKey = "mode.byLevel.name";
export const descriptionKey = "mode.byLevel.description";

/**
 * How many hostiles one zone of water holds (S150).
 *
 * The player asked for a ceiling per zone (verbatim): "en cada nivel habra un maximo de
 * enemigos por zona, y se crearan los enemigos de la misma zona que hayan sido undidos o
 * capturados". The cap and the victories the level asks for are the same number, read from
 * the same curve, so moving `LEVELS` moves all of it together.
 */
export function enemiesPerZoneCap(world) {
  return enemiesPerZone(normaliseLevel(world?.level));
}

/** What a fresh enemy of this mode carries: the level she was seeded at (S140-D). */
export function stamp(world) {
  return { level: normaliseLevel(world?.level) };
}

/** A fresh sea opens with the level 1 quota (S140): the level is the only source of enemies. */
export function seed(world) {
  return seedLevel(world, 1);
}

/**
 * A level is cleared by victories, not by an empty sea (S150). The player chose "Por
 * cantidad de victorias" (verbatim), so the level advances when the fights it asks for are
 * won, whatever is still afloat.
 *
 * Before S150 the level advanced when its sails vanished from `encounters`, and a sail that
 * merely drifted past `despawnRadiusM` vanished: a captain who never fired a shot climbed
 * levels while the sea kept filling. That is the bug the player reported (verbatim): "los
 * barcos enemigos siguen apareciendo con el tiempo sin ningun limite".
 *
 * Seeding the next level resets the count, so a second tick cannot advance it twice.
 */
export function advance(world) {
  const level = normaliseLevel(world?.level);
  const won = Number(world?.levelVictories);
  const victories = Number.isFinite(won) ? won : 0;
  if (victories >= victoriesForLevel(level)) return seedLevel(world, level + 1);
  return null;
}

/** How far into the level the sea is, for the screen that shows the chip. */
export function progress(world) {
  const level = normaliseLevel(world?.level);
  const target = victoriesForLevel(level);
  const won = Number(world?.levelVictories);
  const done = Number.isFinite(won) ? Math.min(target, Math.max(0, Math.floor(won))) : 0;
  return { level, done, target };
}

/** The same answer, read out of a stored `barcos:game:v1` record without loading the sea. */
export function progressFromSave(record) {
  return levelProgressFromGameSave(record);
}

/** The level a stored record opens at. Kept for the screens that only want the number. */
export function levelFromSave(record) {
  return levelFromGameSave(record);
}

/** The mode as the registry hands it out. */
export const byLevel = {
  id,
  labelKey,
  descriptionKey,
  enemiesPerZone: enemiesPerZoneCap,
  stamp,
  seed,
  advance,
  progress,
  progressFromSave,
  levelFromSave,
  /** Exposed so a test can assert the curve this mode reads is the shipped one. */
  enemiesForLevel,
};
