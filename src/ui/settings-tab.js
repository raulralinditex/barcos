/**
 * Settings tab (S101). The same view over `src/model/settings.js` that config.html used
 * to own, mounted into the shipyard's Configuración tab: the screen still never decides
 * a rule, it asks the model for the fields, shows each one in the unit a player
 * understands, writes back through the same model and stores the result.
 */

import { createAppTranslator } from "../i18n/index.js";
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
import { applyCatalogue, loadStoredCatalogue, saveStoredCatalogue } from "../model/catalogue-storage.js";
import { createCatalogueEditor } from "./catalogue-editor.js";

const $ = (selector) => document.querySelector(selector);

// The app publishes her translator on the window, but this module is evaluated before
// that assignment runs (imports hoist), so the shared one is read at call time: the
// language change repaint sees what the page speaks, not what the module was born with.
const ownTranslator = createAppTranslator(
  typeof localStorage === "undefined" ? null : localStorage,
  typeof navigator === "undefined" ? undefined : navigator.language,
);
const t = (...args) => (window.__barcosTranslator ?? ownTranslator).t(...args);

const els = {
  groups: $("#settings-groups"),
  catalogue: $("#settings-catalogue"),
  status: $("#settings-status"),
  apply: $("#settings-apply"),
  reset: $("#settings-reset"),
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

/**
 * Whether a field is a switch rather than a number (S117). It is declared on the field
 * (`control: "switch"`) instead of guessed from its range: `combat.autofire` has exactly
 * the same 0..1 shape and is deliberately still a number, so a heuristic would quietly
 * change a control the player already knows. The stored value stays the number the model
 * reads; only the control changes.
 */
const isSwitch = (field) => field.control === "switch";

/** One row: label, input in display units, unit and the allowed range. */
function renderField(field, settings) {
  const id = fieldId(field);
  const row = document.createElement("div");
  row.className = "settings-row";
  row.dataset.fieldId = id;

  const label = document.createElement("label");
  label.className = "settings-label";
  label.htmlFor = `field-${id}`;
  // A row built from data (one per yard and good) names its parts by i18n key, resolved
  // here so the label follows the language.
  const labelArgs = field.labelArgs
    ? Object.fromEntries(Object.entries(field.labelArgs).map(([name, key]) => [name, t(key)]))
    : undefined;
  label.textContent = t(field.label, labelArgs);

  const control = document.createElement("div");
  control.className = "settings-control";

  const input = document.createElement("input");
  input.id = `field-${id}`;
  input.dataset.fieldId = id;
  // A switch is a checkbox whose checked state is 1 (S117); everything else is a number.
  if (isSwitch(field)) {
    input.type = "checkbox";
    input.checked = Number(settings[id]) > 0;
  } else {
    input.type = "number";
    input.min = String(toDisplay(field, field.min));
    input.max = String(toDisplay(field, field.max));
    input.step = String(inputStep(field));
    input.value = String(toDisplay(field, settings[id]));
  }

  const unit = document.createElement("span");
  unit.className = "settings-unit";
  unit.textContent = isSwitch(field) ? "" : unitLabel(field);

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
    raw[id] = input.type === "checkbox" ? (input.checked ? 1 : 0) : fromDisplay(field, input.value);
  }
  return normaliseSettings(raw);
}

/** Put a clamped value back into the box, so the player sees what was accepted. */
function syncScreen(settings) {
  for (const input of els.groups.querySelectorAll("input[data-field-id]")) {
    const id = input.dataset.fieldId;
    const field = SETTINGS_FIELDS.find((entry) => fieldId(entry) === id);
    if (!field || settings[id] === undefined) continue;
    if (input.type === "checkbox") input.checked = Number(settings[id]) > 0;
    else input.value = String(toDisplay(field, settings[id]));
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

/** Repaint everything after a language change (S13): fields, catalogue and status. */
export function repaintSettingsForLanguage() {
  for (const node of document.querySelectorAll('.screen-panel[data-screen-panel="configuracion"] [data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  render(currentSettings());
  if (els.catalogue) {
    els.catalogue.textContent = "";
    const editor = createCatalogueEditor({
      t,
      catalogue: loadStoredCatalogue(),
      formatNumber: (value) => fmtOne.format(value),
      onChange: (next) => {
        applyCatalogue(next);
        saveStoredCatalogue(next);
        showStatus(t("catalogue.saved"), "ok");
      },
    });
    els.catalogue.append(editor.root);
  }
  showStatus(t("settings.reloaded"), "ok");
}

/* ---------------------------------------------------------------- boot */

// The tab shows the values the game would actually run with right now. The shipyard
// already applied the stored settings on her own boot (S33); loading them again is the
// same values reaching the same constants, so this only reads.
const live = applySettings(loadStoredSettings());

render(live);

// The catalogue editor (S80-S82) sits under the tuning blocks: it is the same screen
// and the same idea, one level down. What it writes is stored apart, because a shipped
// record that was never touched must not be frozen into an old save (S83).
const catalogue = loadStoredCatalogue();
applyCatalogue(catalogue);
if (els.catalogue) {
  const editor = createCatalogueEditor({
    t,
    catalogue,
    formatNumber: (value) => fmtOne.format(value),
    onChange: (next) => {
      applyCatalogue(next);
      saveStoredCatalogue(next);
      showStatus(t("catalogue.saved"), "ok");
    },
  });
  els.catalogue.append(editor.root);
}

showStatus(t("settings.hint", { count: SETTINGS_FIELDS.length }), "hint");
