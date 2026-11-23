/**
 * S171: the game modes.
 *
 * The player asked for it (verbatim): "vamos a hacer un plan de refractorizacion para poder
 * tener distintos tipos de juegos, el que tenemos implementado ahora se podia llamar
 * 'batalla por nivel' y cuando le damos al boton reiniciar seleccionariamos el tipo de juego".
 *
 * F0 is the seam and nothing else. The rule the game plays today — "batalla por nivel" — was
 * welded into `updateWorld` in three places: the cap per zone, the advance on victories, and
 * the seed of a fresh sea. Each of them now asks a mode, and the shipped mode answers exactly
 * what the old code answered. The proof is that the rest of the suite passes untouched.
 *
 * A mode is an object that answers five questions and owns no state of its own:
 *
 *   enemiesPerZone(world)      how many hostiles one zone of water holds right now
 *   stamp(world)               the fields a fresh enemy carries (her level, at least)
 *   seed(world)                what a fresh sea opens with
 *   advance(world)             whether this tick clears the mode's own goal
 *   progress(world)            how far into that goal the player is, for the screen
 *
 * `progressFromSave` reads the same answer out of a stored game record, because the shipyard
 * shows the progress without loading the sea.
 */

import { byLevel } from "./by-level.js";

/**
 * The modes the game knows, by id. Adding one is adding an entry here and a file beside it;
 * nothing in `world.js`, `sea.js` or the screens needs to know its name.
 */
export const MODES = {
  [byLevel.id]: byLevel,
};

/**
 * The mode a game plays when nothing says otherwise. It is the rule the game had before
 * modes existed, so every save written before this refactor opens as it always played.
 */
export const DEFAULT_MODE_ID = byLevel.id;

/** The mode by id, falling back to the shipped one for anything unknown. */
export function modeById(id) {
  if (typeof id !== "string") return MODES[DEFAULT_MODE_ID];
  return MODES[id] ?? MODES[DEFAULT_MODE_ID];
}

/**
 * Add a mode to the registry at runtime.
 *
 * The game registers hers at import time; this exists so a test can prove the seam is real
 * with a mode that answers differently on purpose, instead of only proving the shipped one
 * still works. Returns the mode so a caller can chain.
 */
export function registerMode(mode) {
  if (!mode || typeof mode.id !== "string" || mode.id === "") {
    throw new TypeError("a mode needs a non-empty id");
  }
  MODES[mode.id] = mode;
  return mode;
}

/** The mode a world is playing, read from the world itself. */
export function modeOf(world) {
  return modeById(world?.mode);
}

/** The same world, stamped with the mode it plays (S171, used by the seed and by tests). */
export function withMode(world, id) {
  return { ...world, mode: modeById(id).id };
}

/** Every mode, for the screen that lets the player pick one. */
export function allModes() {
  return Object.values(MODES);
}
