/**
 * Levels (S140): the sea is played in levels, and the level owns the enemy quota.
 *
 * The player asked for it (verbatim): "vamos a hacer niveles, cuando se reinicia, aparecen
 * una serie de enemigos, cuando conseguimos undir o capturar todos, pasamos al siguiente
 * nivel y aparecen mas barcos enemigos que la primera vez, el nivel aparece en el header de
 * los astilleros". His decisions (verbatim): "Sin reposición, el nivel manda
 * (Recomendada)", "Crece 1,5× por nivel", "Más cantidad y algo más duros", "Chip junto al
 * título (Recomendada)".
 *
 * Pure and UI-free, like every other model: this file answers two questions (how many
 * enemies a level owns and how tough they are) and nothing else. The sea that seeds them
 * and the header that shows them read it; none of them decides a rule on its own.
 */

/**
 * The level curve, as one block, so the settings screen can move every number of it
 * (S79/S140-F). `enemiesForLevel` and `toughnessForLevel` read it live.
 */
export const LEVELS = {
  /** Enemies of level 1. */
  baseEnemies: 3,
  /** What the quota is multiplied by on every level. */
  growth: 1.5,
  /** The quota stops here, so a very long run does not become unplayable. */
  maxEnemies: 60,
  /** How much tougher every level's enemies are, as a share of level 1. */
  toughnessPerLevel: 0.08,
  /** The toughness factor stops here. */
  maxToughness: 2,
};

/**
 * A level as a whole number of at least 1. Junk — a missing field, a broken save, a
 * string, a fraction, an infinity — resolves to level 1 instead of throwing: a corrupted
 * save must leave the game playable, exactly like a corrupted world (S26).
 */
export function normaliseLevel(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    // A numeric string is what an input or a hand-edited save hands back, so it is read;
    // anything that is not a number at all is junk.
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? normaliseLevel(parsed) : 1;
    }
    return 1;
  }
  const level = Math.floor(value);
  return level >= 1 ? level : 1;
}

/** Whether a stored value is a level at all (used to reject a broken save field). */
export function isValidLevel(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && Math.floor(value) === value;
}

/**
 * How many enemies a level owns: `baseEnemies * growth^(level-1)`, rounded, capped at
 * `maxEnemies` and never below one sail. Level 1 is 3, 2 is 5, 3 is 7, 4 is 10.
 */
export function enemiesForLevel(level) {
  const base = Number(LEVELS.baseEnemies);
  const growth = Number(LEVELS.growth);
  const cap = Number(LEVELS.maxEnemies);
  const safeBase = Number.isFinite(base) && base > 0 ? base : 1;
  const safeGrowth = Number.isFinite(growth) && growth >= 1 ? growth : 1;
  const safeCap = Number.isFinite(cap) && cap >= 1 ? cap : 1;
  const quota = Math.round(safeBase * safeGrowth ** (normaliseLevel(level) - 1));
  if (!Number.isFinite(quota)) return safeCap;
  return Math.min(safeCap, Math.max(1, quota));
}

/**
 * The toughness factor of a level's enemies: `1 + toughnessPerLevel * (level-1)`, capped
 * at `maxToughness`. Level 1 is exactly 1, so the enemies the game was tuned with are the
 * ones level 1 still has.
 */
export function toughnessForLevel(level) {
  const perLevel = Number(LEVELS.toughnessPerLevel);
  const cap = Number(LEVELS.maxToughness);
  const safePerLevel = Number.isFinite(perLevel) && perLevel >= 0 ? perLevel : 0;
  const safeCap = Number.isFinite(cap) && cap >= 1 ? cap : 1;
  const factor = 1 + safePerLevel * (normaliseLevel(level) - 1);
  return Math.min(safeCap, Math.max(1, factor));
}

/**
 * How many enemies a level allows in **one zone** (S150).
 *
 * The player asked for a ceiling per zone (verbatim): "en cada nivel habra un maximo de
 * enemigos por zona, y se crearan los enemigos de la misma zona que hayan sido undidos o
 * capturados". He chose the same curve for it as for the total quota (verbatim: "ok" to the
 * recommendation), so the cap per zone and the victories a level asks for are the same
 * number, read from the same block: moving `LEVELS` moves all three together.
 */
export function enemiesPerZone(level) {
  return enemiesForLevel(level);
}

/**
 * How many victories a level asks for before the next one opens (S150). The player chose to
 * advance "Por cantidad de victorias" instead of by an empty sea, and the same curve again:
 * level 1 asks for 3, level 2 for 5, level 3 for 7.
 *
 * It is deliberately the same function as the quota: the sea a captain is given and the work
 * the level asks for grow at the same rhythm, so a level never asks for more than it shows.
 */
export function victoriesForLevel(level) {
  return enemiesForLevel(level);
}

/**
 * The level a sea save opens at (S140-C/S140-E). The header and the shipyard have no world
 * of their own: they read the sea record, and no record — or a broken one — is level 1.
 * `record` is the whole `barcos:game:v1` object; `record.world` may be the serialised
 * string or the object itself.
 */
export function levelFromGameSave(record) {
  if (!record || typeof record !== "object") return 1;
  let world = record.world;
  if (typeof world === "string") {
    try {
      world = JSON.parse(world);
    } catch {
      return 1;
    }
  }
  if (!world || typeof world !== "object") return 1;
  return normaliseLevel(world.level);
}

/**
 * How far into its level the sea save is (S150): the victories won and the ones the level
 * asks for. The chip in the title bar reads it, so the player can see how close the next
 * level is instead of guessing. No save, or a broken one, is level 1 with nothing won.
 */
export function levelProgressFromGameSave(record) {
  const level = levelFromGameSave(record);
  const target = victoriesForLevel(level);
  if (!record || typeof record !== "object") return { level, done: 0, target };
  let world = record.world;
  if (typeof world === "string") {
    try {
      world = JSON.parse(world);
    } catch {
      return { level, done: 0, target };
    }
  }
  if (!world || typeof world !== "object") return { level, done: 0, target };
  const won = Number(world.levelVictories);
  const done = Number.isFinite(won) ? Math.min(target, Math.max(0, Math.floor(won))) : 0;
  return { level, done, target };
}
