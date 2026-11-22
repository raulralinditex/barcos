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
import { SETTINGS_BRANCHES, resolveSelection, selectionKey } from "../model/settings-branches.js";
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
  menu: $("#settings-menu"),
  groups: $("#settings-groups"),
  catalogue: $("#settings-catalogue"),
  status: $("#settings-status"),
  apply: $("#settings-apply"),
  reset: $("#settings-reset"),
};

/**
 * Where the chosen branch lives between sessions (S143-C).
 *
 * A branch id, or `branch/group` when the player opened one block. Read through
 * `resolveSelection`, so a stored value that no longer means anything falls back to the
 * first branch instead of leaving the screen empty.
 */
const NAV_KEY = "barcos:settings-nav:v1";

/** The branches the player has unfolded. Not stored: the menu reopens showing only hers. */
const expanded = new Set([SETTINGS_BRANCHES[0].id]);

/** What the right column is showing: a whole branch, or one block of it (S143-B). */
let selection = resolveSelection(readNav());

function readNav() {
  try {
    return localStorage.getItem(NAV_KEY);
  } catch {
    return null;
  }
}

function writeNav(next) {
  try {
    localStorage.setItem(NAV_KEY, selectionKey(next));
  } catch {
    // A storage failure keeps the choice for this session, like every other setting.
  }
}

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
 * (`control: "switch"`) instead of guessed from its range, because 0..1 is also the shape of
 * every percentage and share on this screen: a heuristic on the range would turn a 0.35 into a
 * checkbox that can only say 0 or 1. What keeps the declaration honest is a test, not this
 * function: every field that is yes/no by shape (0 to 1 in steps of 1) must declare a switch,
 * and a switch may only sit on such a field. The player asked for exactly that ("los editores
 * binarios, hazlos con un check"), which is why `combat.autofire` and `combat.showRange` are
 * checks now; S117 had kept them as numbers on purpose. The stored value stays the number the
 * model reads; only the control changes.
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

/** The whole screen, grouped by block. Every block is rendered; the menu hides the rest (S143-D). */
function render(settings) {
  els.groups.innerHTML = "";
  const groups = [...new Set(SETTINGS_FIELDS.map((field) => field.group))];
  for (const group of groups) {
    const card = document.createElement("section");
    card.className = "settings-card";
    // The block id is on the card, so the menu can show and hide it without knowing
    // anything else about the screen (S143-B).
    card.dataset.group = group;

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
  paintVisibility();
}

/* ---------------------------------------------------------------- the menu (S143) */

/**
 * Whether a card is on screen under the current selection (S143-B).
 *
 * Choosing a branch shows every block of it; choosing one block shows only that one. The
 * rest stay in the DOM — hidden, not removed — so Guardar, Restablecer todo and the reads
 * of the screen keep working over the whole set (S143-D).
 */
function isShown(group) {
  if (selection.group) return selection.group === group;
  const branch = SETTINGS_BRANCHES.find((entry) => entry.id === selection.branch);
  return Boolean(branch?.groups.includes(group));
}

/** Hide the blocks the selection left out, and the catalogue unless its branch is chosen. */
function paintVisibility() {
  for (const card of els.groups.querySelectorAll(".settings-card")) {
    card.hidden = !isShown(card.dataset.group);
  }
  if (els.catalogue) {
    const branch = SETTINGS_BRANCHES.find((entry) => entry.id === selection.branch);
    els.catalogue.hidden = !branch?.catalogue;
  }
}

/** One entry of the menu: a branch that unfolds into its blocks, or a block itself. */
function menuBranch(branch) {
  const item = document.createElement("li");
  item.className = "settings-menu-branch";
  item.dataset.branch = branch.id;
  const open = expanded.has(branch.id);
  item.classList.toggle("is-open", open);
  // A branch with no block to list (the catalogue) has nothing to unfold, so it is not a
  // disclosure control: it is one choice, like a block.
  item.classList.toggle("is-leaf", branch.groups.length === 0);

  const head = document.createElement("div");
  head.className = "settings-menu-head";

  if (branch.groups.length > 0) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "settings-menu-toggle";
    toggle.dataset.branchToggle = branch.id;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", t("settings.menu.unfold", { branch: t(branch.label) }));
    toggle.textContent = open ? "▾" : "▸";
    head.append(toggle);
  }

  const pick = document.createElement("button");
  pick.type = "button";
  pick.className = "settings-menu-branch-pick";
  pick.dataset.branchPick = branch.id;
  pick.textContent = t(branch.label);
  pick.setAttribute("aria-current", selection.branch === branch.id && !selection.group ? "true" : "false");
  head.append(pick);
  item.append(head);

  if (branch.groups.length > 0) {
    const list = document.createElement("ul");
    list.className = "settings-menu-groups";
    for (const group of branch.groups) {
      const entry = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-menu-group";
      button.dataset.groupPick = group;
      button.dataset.branch = branch.id;
      button.textContent = t(`settings.group.${group}`);
      const current = selection.branch === branch.id && selection.group === group;
      button.setAttribute("aria-current", current ? "true" : "false");
      entry.append(button);
      list.append(entry);
    }
    item.append(list);
  }

  return item;
}

/** The left column, in the order the branches are declared (S143-B). */
function renderMenu() {
  if (!els.menu) return;
  els.menu.innerHTML = "";
  els.menu.setAttribute("aria-label", t("settings.menu.aria"));

  const list = document.createElement("ul");
  list.className = "settings-menu-list";
  for (const branch of SETTINGS_BRANCHES) list.append(menuBranch(branch));
  els.menu.append(list);

  // One listener on the menu, so a repaint never leaves a dead button behind.
  els.menu.onclick = (event) => {
    const toggle = event.target.closest("[data-branch-toggle]");
    if (toggle) {
      const id = toggle.dataset.branchToggle;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      renderMenu();
      return;
    }
    const group = event.target.closest("[data-group-pick]");
    if (group) {
      selection = { branch: group.dataset.branch, group: group.dataset.groupPick };
      expanded.add(selection.branch);
      commitSelection();
      return;
    }
    const branch = event.target.closest("[data-branch-pick]");
    if (branch) {
      selection = { branch: branch.dataset.branchPick, group: null };
      expanded.add(selection.branch);
      commitSelection();
    }
  };
}

/** A choice was made: store it, repaint the menu and show only what it names (S143-C). */
function commitSelection() {
  writeNav(selection);
  renderMenu();
  paintVisibility();
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
  renderMenu();
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
renderMenu();
// The menu opens on the branch the player left, unfolded, with her blocks showing (S143-C).
expanded.add(selection.branch);
renderMenu();
paintVisibility();

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
