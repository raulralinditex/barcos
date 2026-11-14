/**
 * Where the tuning settings live between sessions (S33).
 *
 * Storage only: the rules are in `settings.js`, which stays pure and testable. The
 * key has the game's own prefix and holds a flat map of `group.key` to number, so a
 * human can read it in the browser and a corrupted blob is caught by the normaliser.
 */

import { applySettings, normaliseSettings } from "./settings.js";

export const SETTINGS_KEY = "barcos:settings:v1";

/** The settings stored in this browser, already normalised. Never throws. */
export function loadStoredSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return normaliseSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return normaliseSettings(null);
  }
}

/** Write settings to the browser. A storage failure keeps them for this session. */
export function saveStoredSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normaliseSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

/**
 * The boot step both screens run: read what is stored and put it into the live
 * constants. Returns what was applied, so the settings screen can show it.
 */
export function bootSettings() {
  return applySettings(loadStoredSettings());
}
