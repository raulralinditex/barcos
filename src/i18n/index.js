/**
 * Catalogue entry point: every supported language in one object.
 *
 * `createTranslator(COLLECTION, language)` from core.js is what the UI uses.
 */

import { createTranslator, resolveLanguage, saveLanguage } from "./core.js";
import { en } from "./en.js";
import { es } from "./es.js";

export const COLLECTION = { es, en };

/** Build the app's translator from the player's stored choice or the browser. */
export function createAppTranslator(storage, navigatorLanguage) {
  const language = resolveLanguage(storage, navigatorLanguage);
  return createTranslator(COLLECTION, language);
}

/** Switch language and remember it, in one step (S13). */
export function applyLanguage(translator, storage, language) {
  const applied = translator.setLanguage(language);
  saveLanguage(storage, applied);
  return applied;
}

export { en, es };
