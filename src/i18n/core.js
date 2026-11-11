/**
 * Translation core: catalogue lookup, interpolation, locale detection, storage.
 *
 * Deliberately small and framework-free (the game has no build step). The
 * catalogue is a flat map of dotted keys to strings, one entry per supported
 * language, so a missing key is a visible fallback rather than a crash.
 *
 * Identifiers, keys and issue codes stay in English (S10/S15); only the values
 * are translated (S11).
 */

export const LANGUAGES = ["es", "en"];
export const DEFAULT_LANGUAGE = "es";
export const LANGUAGE_KEY = "barcos:lang:v1";

/**
 * Resolve a browser locale to a supported language. Anything that is not English
 * falls back to Spanish (S12): the game was written in Spanish first, so that is
 * the safer default for an unknown locale.
 */
export function detectLanguage(navigatorLanguage) {
  const tag = String(navigatorLanguage ?? "").toLowerCase();
  if (tag.startsWith("en")) return "en";
  if (tag.startsWith("es")) return "es";
  return DEFAULT_LANGUAGE;
}

/** Narrow any external value to a supported language, or null if it is not one. */
export function normalizeLanguage(value) {
  const tag = String(value ?? "").toLowerCase();
  return LANGUAGES.includes(tag) ? tag : null;
}

/**
 * Fill `{placeholders}` in a template. Values are inserted verbatim: each
 * language owns the word order, so no sentence is assembled from fragments (S14).
 * An unknown placeholder is left as-is so a typo shows up instead of vanishing.
 */
export function interpolate(template, params = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

/**
 * Create a translator over one catalogue.
 *
 * `t(key, params)` resolves the key in the active language and falls back to the
 * default language, then to the key itself. `setLanguage` returns the language
 * actually applied, so callers can persist it.
 */
export function createTranslator(catalogue, initialLanguage = DEFAULT_LANGUAGE) {
  let language = normalizeLanguage(initialLanguage) ?? DEFAULT_LANGUAGE;

  function lookup(lang, key) {
    const table = catalogue[lang];
    return table && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
  }

  function t(key, params) {
    const value = lookup(language, key) ?? lookup(DEFAULT_LANGUAGE, key) ?? key;
    return params ? interpolate(value, params) : value;
  }

  return {
    t,
    get language() {
      return language;
    },
    setLanguage(next) {
      const normalized = normalizeLanguage(next);
      if (!normalized) return language;
      language = normalized;
      return language;
    },
    /** True when the key exists in the active language. Used by the completeness test. */
    has(key) {
      return lookup(language, key) !== null;
    },
  };
}

/** Read the stored choice, or null when the player never picked one. */
export function loadLanguage(storage, key = LANGUAGE_KEY) {
  try {
    return normalizeLanguage(storage?.getItem(key));
  } catch {
    return null;
  }
}

/** Persist the player's choice. Storage failures are never fatal. */
export function saveLanguage(storage, language, key = LANGUAGE_KEY) {
  const normalized = normalizeLanguage(language);
  if (!normalized) return null;
  try {
    storage?.setItem(key, normalized);
  } catch {
    /* storage disabled: the choice lives for this session only */
  }
  return normalized;
}

/** Stored choice first, then the browser locale (S12). */
export function resolveLanguage(storage, navigatorLanguage, key = LANGUAGE_KEY) {
  return loadLanguage(storage, key) ?? detectLanguage(navigatorLanguage);
}
