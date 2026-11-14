/**
 * Settings screen (S33). A view over `src/model/settings.js`, nothing else.
 *
 * The screen never decides a rule: it asks the model for the fields, shows each one
 * in the unit a player understands (a percentage, kilometres, knots), writes back
 * through the same model and stores the result. Everything typed here is clamped, so
 * a wrong number makes the game harsher, never broken.
 */

import { applyLanguage, createAppTranslator } from "../i18n/index.js";
import {
  SETTINGS_FIELDS,
  SETTINGS_DEFAULTS,
  applySettings,
  currentSettings,
  fieldId,
  fromDisplay,
  normaliseSettings,
  resetSettings,
  toDisplay,
} from "../model/settings.js";
import {
  loadStoredSettings,
  saveStoredSettings,
} from "../model/settings-storage.js";

const $ = (selector) => document.querySelector(selector);

const translator = createAppTranslator(
  typeof localStorage === "undefined" ? null : localStorage,
  typeof navigator === "undefined" ? undefined : navigator.language,
);
const t = translator.t;

const els = {
  groups: $("#settings-groups"),
  status: $("#settings-status"),
  apply: $("#settings-apply"),
  reset: $("#settings-reset"),
  langSelect: $("#lang-select"),
};

const fmtOne = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const fmtTwo = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

/** The unit shown next to the input, per field scale. */
function unitLabel(field) {
  switch (field.scale) {
    case "percent":
      return "%";
    case "percent100":
      return "%";
    case "kilometres":
      return t("settings.unit.km");
    case "metres":
      return t("settings.unit.m");
    case "seconds":
      return t("settings.unit.s");
    case "knots":
      return t("settings.unit.kn");
    case "gold":
    case "goldPrecise":
      return t("settings.unit.gold");
    case "rate":
      return t("settings.unit.radS");
    case "degrees":
      return t("settings.unit.deg");
    default:
      return "";
  }
}

/** How many decimals the input shows, so 5.2 km does not read as 5.200000001. */
function inputStep(field) {
  if (field.scale === "kilometres") return 0.1;
  if (field.scale === "goldPrecise") return 0.01;
  if (field.scale === "percent") return 0.1;
  return field.step;
}

function showStatus(message, kind = "ok") {
  els.status.textContent = message;
  els.status.className = `settings-status is-${kind}`;
}

/** One row: label, input in display units, unit and the allowed range. */
function renderField(field, settings) {
  const id = fieldId(field);
  const row = document.createElement("div");
  row.className = "settings-row";
  row.dataset.fieldId = id;

  const label = document.createElement("label");
  label.className = "settings-label";
  label.htmlFor = `field-${id}`;
  label.textContent = t(field.label);

  const control = document.createElement("div");
  control.className = "settings-control";

  const input = document.createElement("input");
  input.type = "number";
  input.id = `field-${id}`;
  input.dataset.fieldId = id;
  input.min = String(toDisplay(field, field.min));
  input.max = String(toDisplay(field, field.max));
  input.step = String(inputStep(field));
  input.value = String(toDisplay(field, settings[id]));

  const unit = document.createElement("span");
  unit.className = "settings-unit";
  unit.textContent = unitLabel(field);

  control.append(input, unit);

  const range = document.createElement("p");
  range.className = "settings-range";
  const shipped = toDisplay(field, SETTINGS_DEFAULTS[id]);
  range.textContent = t("settings.range", {
    min: toDisplay(field, field.min),
    max: toDisplay(field, field.max),
    shipped: field.scale === "goldPrecise" ? fmtTwo.format(shipped) : fmtOne.format(shipped),
  });

  row.append(label, control, range);
  return row;
}

/** The whole screen, grouped by block. */
function render(settings) {
  els.groups.innerHTML = "";
  const groups = [...new Set(SETTINGS_FIELDS.map((field) => field.group))];
  for (const group of groups) {
    const card = document.createElement("section");
    card.className = "settings-card";

    const heading = document.createElement("h2");
    heading.textContent = t(`settings.group.${group}`);
    card.append(heading);

    const body = document.createElement("div");
    body.className = "settings-card-body";
    for (const field of SETTINGS_FIELDS.filter((entry) => entry.group === group)) {
      body.append(renderField(field, settings));
    }
    card.append(body);
    els.groups.append(card);
  }
}

/** Read the screen back into model units, clamping each field as it goes. */
function readScreen() {
  const raw = {};
  for (const input of els.groups.querySelectorAll("input[data-field-id]")) {
    const id = input.dataset.fieldId;
    const field = SETTINGS_FIELDS.find((entry) => fieldId(entry) === id);
    if (!field) continue;
    raw[id] = fromDisplay(field, input.value);
  }
  return normaliseSettings(raw);
}

/** Put a clamped value back into the box, so the player sees what was accepted. */
function syncScreen(settings) {
  for (const input of els.groups.querySelectorAll("input[data-field-id]")) {
    const id = input.dataset.fieldId;
    const field = SETTINGS_FIELDS.find((entry) => fieldId(entry) === id);
    if (!field || settings[id] === undefined) continue;
    input.value = String(toDisplay(field, settings[id]));
  }
}

els.apply.addEventListener("click", () => {
  const applied = readScreen();
  syncScreen(applied);
  saveStoredSettings(applied);
  // Apply in this page too, so what it shows is what the game would run with.
  applySettings(applied);
  showStatus(t("settings.saved"), "ok");
});

els.reset.addEventListener("click", () => {
  const shipped = normaliseSettings(SETTINGS_DEFAULTS);
  syncScreen(shipped);
  saveStoredSettings(shipped);
  // Restore the live constants too, so this page is already telling the truth.
  resetSettings();
  showStatus(t("settings.resetDone"), "ok");
});

/* ---------------------------------------------------------------- language (S13) */

function applyStaticTranslations() {
  document.documentElement.lang = translator.language;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
}

if (els.langSelect) {
  els.langSelect.value = translator.language;
  els.langSelect.addEventListener("change", (event) => {
    applyLanguage(translator, localStorage, event.target.value);
    applyStaticTranslations();
    render(currentSettings());
    showStatus(t("settings.reloaded"), "ok");
  });
}

/* ---------------------------------------------------------------- boot */

// The screen shows the values the game would actually run with right now.
const stored = loadStoredSettings();
const live = applySettings(stored);

applyStaticTranslations();
if (els.langSelect) els.langSelect.value = translator.language;
render(live);
showStatus(t("settings.hint", { count: SETTINGS_FIELDS.length }), "hint");
