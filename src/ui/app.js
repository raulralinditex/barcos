/**
 * Astillero UI. Spanish labels (S10), English identifiers (S10).
 *
 * The canvas is not decoration: it draws one gun port per piece, split by side, so
 * the player sees the consequence of a battery on the hull instead of reading a number.
 */

import {
  AMMO,
  COUNTRIES,
  CREW_ROLES,
  DEFAULT_COUNTRY,
  HULLS,
  PIECES,
  START,
  ammoById,
  hullById,
  pieceById,
} from "../data/naval-data.js";
import { applyLanguage, createAppTranslator } from "../i18n/index.js";
import {
  defaultShipNameFor,
  issueMessage,
  localisedAmmo,
  localisedCrewRole,
  localisedHull,
  localisedHulls,
  localisedPiece,
  localisedPieces,
  familyLabel,
} from "../i18n/terms.js";
import {
  availableHulls,
  availablePieces,
  canChangeCountry,
  normaliseCountry,
  reconcileLoadout,
} from "../model/country.js";
import { minimumShipPrice, normaliseGold, priceShip } from "../model/economy.js";
import { bootSettings } from "../model/settings-storage.js";
import { bootCatalogue } from "../model/catalogue-storage.js";
import { withShipSailing, withShipYard } from "../model/fleet.js";
import { nextImageIndex, shipImagePaths } from "../model/ship-image.js";
import {
  addShip,
  captainShip,
  deserializeFleet,
  departYard,
  fleetUpkeep,
  isEmptyFleet,
  reconcileCaptainPosition,
  serializeFleet,
  shipsAvailableAtYard,
  setCaptain,
  tradingShip,
} from "../model/fleet.js";
import { conditionOf, damagedShips, priceWithPurse, repairCost, repairFleetShip, repairReport } from "../model/repair.js";
import { buildShip, toRuntimeShip } from "../model/shipyard.js";
import { repaintSettingsForLanguage } from "./settings-tab.js";
import { applyRefit, configFromShip, quoteRefit, REFIT } from "../model/refit.js";
import { canSellShip, salePrice, sellShip } from "../model/sale.js";
import { FORT, buyFortGun, fortBoughtGuns, fortGunCost, fortGunHeadroom, fortGunsPerSide, fortRepair, fortRepairQuote } from "../model/fort.js";
import { ARRIVAL_NOTICE_KEY, parseArrivalNotice } from "../model/arrival-notice.js";
import {
  affordableUnits,
  bindGameTime,
  buyCargo,
  marketBoardNow,
  priceStanding,
  sellStanding,
  tradedHere,
  normaliseMarkets,
  sellCargo,
  shipHold,
  withHold,
  withStock,
} from "../model/commerce.js";
import { GAME_TIME, burnSupply, supplySeconds } from "../model/game-time.js";
import { currentShipyard, deserializeWorld, shipyardZone } from "../model/world.js";
import { COMMODITIES, SHIPYARDS, shipyardById } from "../data/naval-data.js";
// S133: the yard selector of the title bar, the editable names and the automatic voyage.
import { arriveAt, voyageQuote } from "../model/voyage.js";
import {
  parseYardNames,
  serialiseYardNames,
  withYardName,
  yardDisplayName,
} from "../model/shipyard-names.js";
import { floatsAgain, isWreck, refloatCost } from "../model/sinking.js";
import { rearmQuote, rearmShip } from "../model/rearm.js";
import { REARM } from "../model/rearm.js";

const STORAGE_KEY = "barcos:config:v1";
const GAME_KEY = "barcos:game:v1";
const SHIP_KEY = "barcos:current-ship:v1";
const FLEET_KEY = "barcos:fleet:v1";
const COUNTRY_KEY = "barcos:country:v1";
/** The player's own names for the yards (S133), kept apart from the fleet and the sea. */
const YARD_NAMES_KEY = "barcos:yard-names:v1";
/** Automatic fire (S47): a preference, so erasing the game does not touch it. */

/**
 * The shipyard opens with a ship the 12,000 budget actually buys, so the player can
 * see a working example and then tear it apart, instead of staring at an empty hull.
 */
const DEFAULT_LOADOUT = {
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "falcon", qty: 2, side: "babor", shotsPerPiece: 30, ammoId: "metralla" },
    { pieceId: "falcon", qty: 2, side: "estribor", shotsPerPiece: 30, ammoId: "metralla" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45,
  cargoKg: 6_000,
  ballastKg: 3_000,
  equipmentKg: 2_500,
  reserveKg: 1_500,
};

const state = {
  gold: START.gold,
  country: DEFAULT_COUNTRY,
  hullId: DEFAULT_LOADOUT.hullId,
  batteries: DEFAULT_LOADOUT.batteries.map((entry) => ({ ...entry })),
  crew: { ...DEFAULT_LOADOUT.crew },
  days: DEFAULT_LOADOUT.days,
  cargoKg: DEFAULT_LOADOUT.cargoKg,
  ballastKg: DEFAULT_LOADOUT.ballastKg,
  equipmentKg: DEFAULT_LOADOUT.equipmentKg,
  reserveKg: DEFAULT_LOADOUT.reserveKg,
  shipName: "",
};

const MASS_SEGMENTS = [
  { key: "light", i18n: "mass.light", color: "#8c9aa8" },
  { key: "crew", i18n: "mass.crew", color: "#3d6fa8" },
  { key: "arms", i18n: "mass.ordnance", color: "#a13c2c" },
  { key: "provisions", i18n: "mass.provisions", color: "#2f6b47" },
  { key: "equipment", i18n: "mass.equipment", color: "#6b5b95" },
  { key: "ballast", i18n: "mass.ballast", color: "#7a6a52" },
  { key: "cargo", i18n: "mass.cargo", color: "#b8860b" },
  { key: "reserve", i18n: "mass.reserve", color: "#c9bda4" },
];

const $ = (selector) => document.querySelector(selector);

/* ---------------------------------------------------------------- i18n (S11-S13) */

/** One translator for the whole screen; the sea screen builds its own. Shared with the
 * settings tab so both repaints read the same language (S101). */
window.__barcosTranslator = createAppTranslator(
  typeof localStorage === "undefined" ? null : localStorage,
  typeof navigator === "undefined" ? undefined : navigator.language,
);
const translator = window.__barcosTranslator;
const t = translator.t;

/**
 * Translate the static markup: textContent, placeholders and aria labels.
 * Runs on boot and on every language change (S13), so no reload is needed.
 */
function applyStaticTranslations() {
  document.documentElement.lang = translator.language;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  for (const node of document.querySelectorAll("[data-i18n-aria]")) {
    node.setAttribute("aria-label", t(node.dataset.i18nAria));
  }
  // Keys whose value carries inline markup (the sea help line).
  for (const node of document.querySelectorAll("[data-i18n-html]")) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }
}

const els = {
  goldValue: $("#gold-value"),
  goldDelta: $("#gold-delta"),
  hullList: $("#hull-list"),
  countrySelect: $("#country-select"),
  countryNote: $("#country-note"),
  shipName: $("#ship-name"),
  canvas: $("#ship-canvas"),
  shipFigure: $("#ship-figure"),
  shipPhoto: $("#ship-photo"),
  shipPhotoCaption: $("#ship-photo-caption"),
  gunsBabor: $("#guns-babor"),
  gunsEstribor: $("#guns-estribor"),
  gunsTotal: $("#guns-total"),
  gunsBaborMax: $("#guns-babor-max"),
  gunsEstriborMax: $("#guns-estribor-max"),
  massBar: $("#mass-bar"),
  massLegend: $("#mass-legend"),
  massReadout: $("#mass-readout"),
  statDraft: $("#stat-draft"),
  statSpeed: $("#stat-speed"),
  statLoad: $("#stat-load"),
  statCargoRoom: $("#stat-cargo-room"),
  statPeople: $("#stat-people"),
  statUpkeep: $("#stat-upkeep"),
  pieceSelect: $("#piece-select"),
  addBattery: $("#add-battery"),
  batteryList: $("#battery-list"),
  crewList: $("#crew-list"),
  supplyList: $("#supply-list"),
  verdictIssues: $("#verdict-issues"),
  priceTotal: $("#price-total"),
  priceLabel: $("#price-label"),
  priceStrip: $("#price-strip"),
  refitBanner: $("#refit-banner"),
  refitMode: $("#refit-mode"),
  newShipBtn: $("#new-ship-btn"),
  launchBtn: $("#launch-btn"),
  setSailBtn: $("#set-sail-btn"),
  fortState: $("#fort-state"),
  fortHull: $("#fort-hull"),
  fortCrew: $("#fort-crew"),
  fortDetail: $("#fort-detail"),
  fortRepairBtn: $("#fort-repair-btn"),
  fortGunBtn: $("#fort-gun-btn"),
  fortUpgradeNote: $("#fort-upgrade-note"),
  marketYard: $("#market-yard"),
  marketZone: $("#market-zone"),
  marketHold: $("#market-hold"),
  marketShip: $("#market-ship"),
  marketBoard: $("#market-board"),
  marketStatus: $("#market-status"),
  purchaseNotice: $("#purchase-notice"),
  fleetList: $("#fleet-list"),
  fleetCount: $("#fleet-count"),
  fleetDetail: $("#fleet-detail"),
  fleetDetailName: $("#fleet-detail-name"),
  fleetDetailHull: $("#fleet-detail-hull"),
  fleetBars: $("#fleet-bars"),
  fleetHold: $("#fleet-hold"),
  fleetRepairBtn: $("#fleet-repair-btn"),
  fleetRearmBtn: $("#fleet-rearm-btn"),
  fleetSellBtn: $("#fleet-sell-btn"),
  fleetEmptyHint: $("#fleet-empty-hint"),
  eraseBtn: $("#erase-btn"),
  eraseDialog: $("#erase-dialog"),
  eraseCancel: $("#erase-cancel"),
  eraseConfirm: $("#erase-confirm"),
  langSelect: $("#lang-select"),
  yardSelect: $("#yard-select"),
  brandYard: $("#brand-yard"),
  brandWater: $("#brand-water"),
  yardRenameBtn: $("#yard-rename-btn"),
  yardNameInput: $("#yard-name-input"),
  yardTravelBtn: $("#yard-travel-btn"),
  yardVisitNote: $("#yard-visit-note"),
  dockDialog: $("#dock-dialog"),
  dockList: $("#dock-list"),
  dockNote: $("#dock-note"),
  dockLater: $("#dock-later"),
  gunsSwivel: $("#guns-swivel"),
};

const fmtInt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const fmtOne = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const fmtTwo = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

const kg = (value) => `${fmtInt.format(Math.round(value))} kg`;
const gold = (value) => `${fmtInt.format(Math.round(value))}`;

/* ---------------------------------------------------------------- persistence */

function saveConfig() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        country: state.country,
        hullId: state.hullId,
        batteries: state.batteries,
        crew: state.crew,
        days: state.days,
        cargoKg: state.cargoKg,
        ballastKg: state.ballastKg,
        equipmentKg: state.equipmentKg,
        reserveKg: state.reserveKg,
        shipName: state.shipName,
      }),
    );
    // The country has its own key (S26), so it survives even if the config is lost.
    localStorage.setItem(COUNTRY_KEY, state.country);
  } catch {
    /* storage disabled: the game still works for this session */
  }
}

/** The country the player chose, from its own key and then from the saved config. */
function loadCountry(saved) {
  try {
    const stored = localStorage.getItem(COUNTRY_KEY);
    if (stored) return normaliseCountry(stored);
  } catch {
    /* storage disabled */
  }
  return normaliseCountry(saved?.country);
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.country = loadCountry(null);
      return;
    }
    const saved = JSON.parse(raw);
    state.country = loadCountry(saved);
    if (saved.hullId && hullById(saved.hullId)) state.hullId = saved.hullId;
    if (Array.isArray(saved.batteries)) state.batteries = saved.batteries;
    if (saved.crew && typeof saved.crew === "object") state.crew = saved.crew;
    for (const key of ["days", "cargoKg", "ballastKg", "equipmentKg", "reserveKg"]) {
      if (Number.isFinite(saved[key])) state[key] = saved[key];
    }
    if (typeof saved.shipName === "string") state.shipName = saved.shipName;
    // A save written under another country must not leave an illegal loadout.
    applyCountryToLoadout();
  } catch {
    /* a corrupted save must never block the shipyard */
  }
}

/** The purse is shared with the sea screen: treasure earned out there buys here. */
function loadGold() {
  try {
    const game = JSON.parse(localStorage.getItem(GAME_KEY));
    // A corrupted or hand-edited save must not open the shop with a debt (S32).
    if (game && game.gold !== undefined) state.gold = normaliseGold(game.gold);
  } catch {
    /* keep the starting purse */
  }
}

/* ---------------------------------------------------------------- rendering */

function currentConfig() {
  return {
    hullId: state.hullId,
    batteries: state.batteries,
    crew: state.crew,
    days: state.days,
    cargoKg: state.cargoKg,
    ballastKg: state.ballastKg,
    equipmentKg: state.equipmentKg,
    reserveKg: state.reserveKg,
  };
}

/* ---------------------------------------------------------------- country (S26) */

/**
 * Bring the half-built loadout into the active country's catalogue. Called on boot
 * and on every country change, so no illegal hull or piece can stay on screen.
 */
function applyCountryToLoadout() {
  const reconciled = reconcileLoadout(currentConfig(), state.country);
  state.hullId = reconciled.hullId;
  state.batteries = reconciled.batteries;
  return reconciled;
}

/** The country's catalogue: what the shipyard is allowed to sell right now. */
const countryHulls = () => availableHulls(state.country);
const countryPieces = () => availablePieces(state.country);

/**
 * The country selector. It is only usable while the fleet is empty (S26): a player
 * who already owns a ship keeps the country they bought it in.
 */
function renderCountry() {
  if (!els.countrySelect) return;
  const editable = canChangeCountry(fleet);

  els.countrySelect.innerHTML = COUNTRIES.map(
    (id) => `<option value="${id}">${t(`shipyard.country.${id}`)}</option>`,
  ).join("");
  els.countrySelect.value = state.country;
  els.countrySelect.disabled = !editable;

  if (els.countryNote) {
    els.countryNote.textContent = editable
      ? t("shipyard.country.hint")
      : t("shipyard.country.locked", { country: t(`shipyard.country.${state.country}`) });
    els.countryNote.classList.toggle("is-locked", !editable);
  }
}

function changeCountry(next) {
  const country = normaliseCountry(next);
  if (country === state.country) return;
  if (!canChangeCountry(fleet)) return;
  state.country = country;
  applyCountryToLoadout();
  renderHulls();
  renderPieceSelect();
  render();
  renderCountry();
}

if (els.countrySelect) {
  els.countrySelect.addEventListener("change", (event) => changeCountry(event.target.value));
}

function renderHulls() {
  els.hullList.innerHTML = "";
  for (const hull of countryHulls()) {
    const min = minimumShipPrice(hull.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `hull-card${hull.id === state.hullId ? " is-active" : ""}`;
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", String(hull.id === state.hullId));
    card.dataset.hullId = hull.id;
    card.disabled = refitId !== null;
    card.innerHTML = `
      <span class="hull-card-name">${localisedHull(hull, t).name}</span>
      <span class="hull-card-meta">${t("shipyard.hullMeta", { country: localisedHull(hull, t).country, min: hull.arqueo[0], max: hull.arqueo[1] })}</span>
      <span class="hull-card-price">${t("shipyard.hullPrice", { price: gold(min) })}</span>
    `;
    card.addEventListener("click", () => {
      if (state.hullId === hull.id) return;
      state.hullId = hull.id;
      // Pieces beyond the new hull's limit would be silently illegal: trim them.
      state.batteries = state.batteries.filter((entry) => pieceById(entry.pieceId));
      render();
    });
    els.hullList.appendChild(card);
  }
}

function renderPieceSelect() {
  const current = els.pieceSelect.value;
  els.pieceSelect.innerHTML = "";
  for (const piece of countryPieces()) {
    const option = document.createElement("option");
    option.value = piece.id;
    option.textContent = `${localisedPiece(piece, t).name} · ${fmtOne.format(piece.shotKg)} kg · ${piece.rangeM} m`;
    els.pieceSelect.appendChild(option);
  }
  if (current && pieceById(current)) els.pieceSelect.value = current;
}

function renderBatteries() {
  els.batteryList.innerHTML = "";

  if (state.batteries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = t("shipyard.noGuns");
    els.batteryList.appendChild(empty);
    return;
  }

  state.batteries.forEach((entry, index) => {
    const piece = pieceById(entry.pieceId);
    if (!piece) return;

    const card = document.createElement("div");
    card.className = "battery";
    const pieceText = localisedPiece(piece, t);
    const sideOptions = piece.swivel
      ? `<option value="swivel" selected>${t("shipyard.battery.swivel")}</option>`
      : `<option value="babor"${entry.side === "babor" ? " selected" : ""}>${t("shipyard.babor")}</option>
         <option value="estribor"${entry.side === "estribor" ? " selected" : ""}>${t("shipyard.estribor")}</option>`;
    const source = piece.provenance === "R6" ? t("shipyard.battery.source.R6") : piece.provenance;
    card.innerHTML = `
      <div class="battery-top">
        <div>
          <div class="battery-name">${pieceText.name}</div>
          <div class="battery-family">${t("shipyard.battery.family", { family: familyLabel(piece.family, t), kg: fmtOne.format(piece.shotKg), reload: piece.reloadS })}</div>
        </div>
        <button class="battery-remove" type="button" aria-label="${t("shipyard.battery.remove", { name: pieceText.name })}">×</button>
      </div>
      <div class="battery-fields">
        <label><span>${t("shipyard.battery.side")}</span>
          <select data-field="side"${piece.swivel ? " disabled" : ""}>
            ${sideOptions}
          </select>
        </label>
        <label><span>${t("shipyard.battery.qty")}</span>
          <input type="number" min="0" max="40" step="1" value="${entry.qty}" data-field="qty" />
        </label>
        <label><span>${t("shipyard.battery.shots")}</span>
          <input type="number" min="0" max="${REARM.maxRoundsPerGun}" step="5" value="${entry.shotsPerPiece}" data-field="shotsPerPiece" />
        </label>
        <label><span>${t("shipyard.battery.ammo")}</span>
          <select data-field="ammoId">
            ${piece.ammo
              .map(
                (ammoId) =>
                  `<option value="${ammoId}"${entry.ammoId === ammoId ? " selected" : ""}>${localisedAmmo(ammoId, t).name}</option>`,
              )
              .join("")}
          </select>
        </label>
      </div>
      <div class="battery-meta">
        <span>${t("shipyard.battery.meta", { source, range: piece.rangeM })}</span>
        <span>${t("shipyard.battery.rounds", { value: fmtInt.format(entry.qty * entry.shotsPerPiece) })}</span>
      </div>
    `;

    card.querySelector(".battery-remove").addEventListener("click", () => {
      state.batteries.splice(index, 1);
      render();
    });

    card.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        if (field === "side" || field === "ammoId") {
          entry[field] = input.value;
        } else {
          const value = Math.max(0, Math.floor(Number(input.value) || 0));
          entry[field] = value;
          input.value = String(value);
        }
        render();
      });
    });

    els.batteryList.appendChild(card);
  });
}

function renderCrew() {
  els.crewList.innerHTML = "";
  for (const role of CREW_ROLES) {
    const qty = state.crew[role.id] ?? 0;
    const row = document.createElement("div");
    row.className = "crew-row";
    const roleText = localisedCrewRole(role, t);
    row.innerHTML = `
      <div>
        <h4>${roleText.name}</h4>
        <p>${roleText.description}</p>
        <p>${t("shipyard.crewTerms", { hire: gold(role.hireGold), wage: fmtOne.format(role.wageGoldPerDay) })}</p>
      </div>
      <label>
        <span>${t("shipyard.battery.qty")}</span>
        <input type="number" min="0" max="400" step="1" value="${qty}" data-role="${role.id}" />
      </label>
    `;
    row.querySelector("input").addEventListener("change", (event) => {
      const value = Math.max(0, Math.floor(Number(event.target.value) || 0));
      event.target.value = String(value);
      if (value === 0) delete state.crew[role.id];
      else state.crew[role.id] = value;
      render();
    });
    els.crewList.appendChild(row);
  }
}

function renderSupply(ship) {
  const hull = ship?.hull ?? hullById(state.hullId);
  const cargoMax = ship?.budget.cargoMaxKg ?? 0;
  const fields = [
    {
      key: "days",
      label: t("shipyard.days"),
      value: state.days,
      step: 5,
      max: 180,
      note: t("supply.daysNote", { kg: fmtOne.format(4.5) }),
    },
    {
      key: "cargoKg",
      label: t("shipyard.cargo"),
      value: state.cargoKg,
      step: 1000,
      max: Math.max(0, Math.floor(Math.max(cargoMax, 0))),
      note: t("supply.cargoNote", { room: kg(Math.max(cargoMax, 0)) }),
    },
    {
      key: "ballastKg",
      label: t("shipyard.ballast"),
      value: state.ballastKg,
      step: 1000,
      max: 200_000,
      note: t("supply.ballastNote"),
    },
    {
      key: "equipmentKg",
      label: t("shipyard.equipment"),
      value: state.equipmentKg,
      step: 500,
      max: 100_000,
      note: t("supply.equipmentNote"),
    },
    {
      key: "reserveKg",
      label: t("shipyard.reserveCapacity"),
      value: state.reserveKg,
      step: 500,
      max: 100_000,
      note: t("supply.reserveNote"),
    },
  ];

  els.supplyList.innerHTML = "";
  for (const field of fields) {
    const wrapper = document.createElement("div");
    wrapper.className = "supply-field";
    wrapper.innerHTML = `
      <div class="row">
        <strong>${field.label}</strong>
        <input type="number" min="0" max="${field.max}" step="${field.step}" value="${field.value}" data-supply="${field.key}" />
      </div>
      <small>${field.note}</small>
    `;
    wrapper.querySelector("input").addEventListener("change", (event) => {
      const value = Math.max(0, Math.floor(Number(event.target.value) || 0));
      event.target.value = String(value);
      state[field.key] = value;
      render();
    });
    els.supplyList.appendChild(wrapper);
  }

  if (hull) {
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent =
      hull.draftSource === "verified"
        ? `Calado de referencia verificado en el modelo: ${hull.draftRefM} m. ${hull.draftNote ?? ""}`
        : `Calado de referencia derivado (el modelo no lo da para este tipo): ${hull.draftRefM} m.`;
    els.supplyList.appendChild(note);
  }
}

function renderMassBar(ship) {
  const hull = ship.hull;
  const capacity = ship.budget.capacityKg;
  const denominator = Math.max(hull.displacementKg, ship.budget.realMassKg);

  const values = {
    light: hull.lightMassKg,
    crew: ship.budget.crewKg,
    arms: ship.budget.armsKg,
    provisions: ship.budget.provisionsKg,
    equipment: state.equipmentKg,
    ballast: state.ballastKg,
    cargo: state.cargoKg,
    reserve: state.reserveKg,
  };

  const addedMass = ship.budget.realMassKg - hull.lightMassKg;
  const overBy = addedMass - capacity;

  els.massBar.innerHTML = "";
  for (const segment of MASS_SEGMENTS) {
    const value = values[segment.key];
    if (!value || value <= 0) continue;
    const part = document.createElement("div");
    part.className = "mass-seg";
    part.style.width = `${(value / denominator) * 100}%`;
    part.style.background = segment.color;
    part.title = `${t(segment.i18n)}: ${kg(value)}`;
    els.massBar.appendChild(part);
  }

  if (overBy > 0) {
    const over = document.createElement("div");
    over.className = "mass-seg is-over";
    over.style.width = `${(Math.min(overBy, capacity * 0.25) / denominator) * 100}%`;
    over.style.background = "#7d2b1f";
    over.title = t("mass.over", { value: kg(overBy) });
    els.massBar.appendChild(over);
  }

  els.massReadout.textContent = t("mass.readout", { real: kg(ship.budget.realMassKg), max: kg(hull.displacementKg) });
  els.massReadout.classList.toggle("bad", overBy > 0);

  els.massLegend.innerHTML = MASS_SEGMENTS.filter((segment) => values[segment.key] > 0)
    .map(
      (segment) =>
        `<span><i class="mass-swatch" style="background:${segment.color}"></i>${t(segment.i18n)} <b>${kg(values[segment.key])}</b></span>`,
    )
    .join("");
}

function renderStats(ship) {
  const { budget, hull } = ship;
  els.statDraft.textContent = `${fmtTwo.format(budget.draftM)} m`;
  els.statDraft.classList.toggle("bad", budget.draftM > hull.draftRefM + 0.9);
  els.statSpeed.textContent = t("shipyard.knots", { value: fmtTwo.format(budget.speedKn) });
  els.statLoad.textContent = `${fmtOne.format(budget.loadFraction * 100)} %`;
  els.statCargoRoom.textContent = kg(Math.max(budget.cargoMaxKg, 0));
  els.statCargoRoom.classList.toggle("bad", budget.cargoMaxKg < 0);
  els.statPeople.textContent = t("shipyard.peopleCount", { value: fmtInt.format(budget.people) });
  els.statUpkeep.textContent = t("shipyard.upkeepPerDay", { value: fmtOne.format(ship.upkeep) });
}

function renderGuns(ship) {
  els.gunsBabor.textContent = String(ship.guns.sides.babor);
  els.gunsEstribor.textContent = String(ship.guns.sides.estribor);
  els.gunsTotal.textContent = String(ship.guns.total);
  const swivels = ship.guns.sides.swivel;
  els.gunsSwivel.textContent = swivels > 0 ? t("shipyard.swivels", { count: swivels }) : "";
  els.gunsBaborMax.textContent = `/ ${ship.hull.maxPiecesPerSide}`;
  els.gunsEstriborMax.textContent = `/ ${ship.hull.maxPiecesPerSide}`;
}

function renderVerdict(ship) {
  const issues = ship.issues.length
    ? ship.issues
    : [
        {
          level: "ok",
          code: "ready",
          message: t("shipyard.viable"),
        },
      ];

  els.verdictIssues.innerHTML = "";
  for (const issue of issues) {
    const row = document.createElement("div");
    row.className = `issue issue-${issue.level}`;
    const mark = issue.level === "error" ? "!" : issue.level === "warn" ? "▲" : "✓";
    // The "ready" row carries its own translated message; model issues carry a code.
    const text = refitId !== null && issue.code === "unaffordable"
      ? t("shipyard.refit.unaffordable", issue.params)
      : issue.message ?? issueMessage(issue, t);
    row.innerHTML = `<span class="issue-mark">${mark}</span><span>${text}</span>`;
    els.verdictIssues.appendChild(row);
  }
}

function renderPrice(ship, quote = null) {
  const cost = quote ? quote.net : ship.price.total;
  els.priceLabel.textContent = quote
    ? t(cost < 0 ? "shipyard.refit.refund" : "shipyard.refit.cost")
    : t("shipyard.total");
  els.priceTotal.textContent = gold(quote ? Math.abs(cost) : cost);
  els.priceStrip.classList.toggle("over", cost > state.gold);

  const diff = state.gold - cost;
  if (diff >= 0) {
    els.goldDelta.textContent = quote ? t("shipyard.refit.remaining", { gold: gold(diff) }) : `restan ${gold(diff)}`;
    els.goldDelta.className = "purse-delta pos";
  } else {
    els.goldDelta.textContent = quote ? t("shipyard.refit.missing", { gold: gold(-diff) }) : `faltan ${gold(-diff)}`;
    els.goldDelta.className = "purse-delta neg";
  }
}

/* ---------------------------------------------------------------- ship drawing */

function drawShip(ship) {
  const canvas = els.canvas;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth || 900;
  const cssHeight = 300;

  if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const hull = ship.hull;
  const longest = 55;
  const scale = Math.min(1, (cssWidth * 0.74) / (longest * 10));
  const lengthPx = hull.lengthM * 10 * scale;
  const beamPx = Math.max(26, hull.beamM * 6 * scale);
  const cx = cssWidth / 2;
  const cy = cssHeight * 0.56;

  // waterline
  ctx.strokeStyle = "rgba(23,54,93,0.22)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    const y = cy + beamPx * 0.42 + i * 9;
    ctx.beginPath();
    ctx.moveTo(cx - lengthPx * 0.7, y);
    ctx.bezierCurveTo(
      cx - lengthPx * 0.2, y + 3,
      cx + lengthPx * 0.2, y - 3,
      cx + lengthPx * 0.7, y,
    );
    ctx.stroke();
  }

  // hull outline: a pointed bow to the right, a squared stern to the left
  const halfLen = lengthPx / 2;
  const halfBeam = beamPx / 2;
  ctx.beginPath();
  ctx.moveTo(cx - halfLen, cy - halfBeam * 0.55);
  ctx.lineTo(cx + halfLen * 0.55, cy - halfBeam * 0.78);
  ctx.quadraticCurveTo(cx + halfLen * 1.06, cy - halfBeam * 0.3, cx + halfLen, cy);
  ctx.quadraticCurveTo(cx + halfLen * 1.06, cy + halfBeam * 0.3, cx + halfLen * 0.55, cy + halfBeam * 0.78);
  ctx.lineTo(cx - halfLen, cy + halfBeam * 0.55);
  ctx.quadraticCurveTo(cx - halfLen * 1.05, cy, cx - halfLen, cy - halfBeam * 0.55);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, cy - halfBeam, 0, cy + halfBeam);
  grad.addColorStop(0, "#3c5a7a");
  grad.addColorStop(0.5, "#22384f");
  grad.addColorStop(1, "#152435");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "#0f1a26";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // deck line
  ctx.strokeStyle = "rgba(244,239,228,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - halfLen * 0.94, cy);
  ctx.lineTo(cx + halfLen * 0.92, cy);
  ctx.stroke();

  // masts
  const mastPositions = [0.18, 0.0, -0.22];
  ctx.strokeStyle = "#5b4a33";
  ctx.lineWidth = 2.4;
  for (const pos of mastPositions) {
    const x = cx + halfLen * pos;
    ctx.beginPath();
    ctx.moveTo(x, cy - halfBeam * 0.1);
    ctx.lineTo(x, cy - beamPx * 1.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - beamPx * 0.26, cy - beamPx * 0.55);
    ctx.lineTo(x + beamPx * 0.26, cy - beamPx * 0.55);
    ctx.stroke();
  }

  // gun ports: one square per piece, upper row to starboard, lower row to port
  const sides = ship.guns.sides;
  const maxSide = Math.max(hull.maxPiecesPerSide, 1);
  const portSize = Math.max(4, Math.min(9, lengthPx / (maxSide * 2.6)));
  const usable = lengthPx * 0.72;
  const startX = cx - usable / 2;

  const drawRow = (count, y, sign) => {
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const x = startX + usable * t;
      const taper = 1 - Math.abs(t - 0.45) * 0.5;
      ctx.fillStyle = "#0a0f14";
      ctx.fillRect(x - portSize / 2, y - portSize / 2, portSize, portSize * taper);
      ctx.strokeStyle = "rgba(184,134,11,0.85)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x - portSize / 2, y - portSize / 2, portSize, portSize * taper);

      // a stub of barrel poking out on the side that faces the viewer
      ctx.strokeStyle = "#1c1c1c";
      ctx.lineWidth = Math.max(1.4, portSize * 0.28);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + sign * portSize * 0.9);
      ctx.stroke();
    }
  };

  drawRow(sides.babor, cy + halfBeam * 0.34, 1);
  drawRow(sides.estribor, cy - halfBeam * 0.34, -1);

  // swivels ride the rail on the centre line: a pivot post, not a gun port (S20)
  for (let i = 0; i < sides.swivel; i += 1) {
    const frac = sides.swivel === 1 ? 0.5 : i / (sides.swivel - 1);
    const x = startX + usable * frac;
    ctx.beginPath();
    ctx.arc(x, cy, Math.max(2.5, portSize * 0.45), 0, Math.PI * 2);
    ctx.fillStyle = "#b8860b";
    ctx.fill();
    ctx.strokeStyle = "#1c1c1c";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // side labels
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "rgba(23,54,93,0.75)";
  ctx.textAlign = "left";
  ctx.fillText(t("shipyard.canvasBabor", { count: sides.babor }), 10, cssHeight - 22);
  ctx.textAlign = "right";
  ctx.fillText(t("shipyard.canvasEstribor", { count: sides.estribor }), cssWidth - 10, 18);
  if (sides.swivel > 0) {
    ctx.textAlign = "center";
    ctx.fillText(t("shipyard.canvasSwivel", { count: sides.swivel }), cssWidth / 2, cssHeight - 22);
  }

  // draft marker
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(16,22,31,0.6)";
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(t("shipyard.canvasDraft", { value: fmtTwo.format(ship.budget.draftM) }), 10, 18);
}

/* ---------------------------------------------------------------- render */

let lastShip = null;
let lastAddedName = null;
let lastNoticeKey = "shipyard.added";
let arrivalNotice = null;
let refitId = null;

function renderArrivalNotice() {
  if (!arrivalNotice) return;
  els.purchaseNotice.textContent = t(arrivalNotice.short ? "sea.banner.autoRepairShort" : "sea.banner.autoRepair", {
    count: gold(arrivalNotice.count), gold: gold(arrivalNotice.gold),
  });
}

/**
 * The historical picture of the selected hull (S34).
 *
 * A missing or broken image is normal: the figure hides itself and the silhouette
 * below keeps doing the work. The credit is shown whenever a picture is shown,
 * because these are other people's work.
 */
let credits = null;

async function loadCredits() {
  // The pictures are an optional extra: no bundle means no pictures, silently, because
  // a missing optional asset is not an error the player should see (S34).
  try {
    const response = await fetch("./assets/ships/credits.json", { cache: "no-cache" });
    if (!response.ok) return;
    const parsed = await response.json();
    credits = parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    credits = null;
  }
}

/**
 * The hull picture opens whole on a click and closes on another click, on Escape or on
 * a click anywhere else (S41). It is plain state on the figure, so the CSS does the rest.
 */
function setPictureZoom(open) {
  if (!els.shipFigure) return;
  els.shipFigure.classList.toggle("is-zoomed", open);
}

if (els.shipPhoto && els.shipFigure) {
  document.addEventListener("click", (event) => {
    const zoomed = els.shipFigure.classList.contains("is-zoomed");
    if (event.target !== els.shipPhoto) {
      if (zoomed) setPictureZoom(false);
      return;
    }
    // The first click opens the picture full size, which is what the player expects. Once
    // it is open, a click turns the page to the hull's next picture (S76): a hull with one
    // picture simply stays where it is.
    if (!zoomed) {
      setPictureZoom(true);
      return;
    }
    const count = shipImagePaths(credits, pictureHullId).length;
    pictureIndex = nextImageIndex(pictureIndex, count);
    const hull = lastShip?.hull;
    if (hull) renderHullPicture(hull);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setPictureZoom(false);
  });
}

/** Which of a hull's pictures is on screen (S76). Reset when the hull changes. */
let pictureIndex = 0;
/** The hull whose picture is showing, so a redraw does not reset the rotation. */
let pictureHullId = null;

function renderHullPicture(hull) {
  if (!els.shipPhoto || !els.shipFigure) return;

  const hide = () => {
    setPictureZoom(false);
    els.shipFigure.classList.add("is-hidden");
    els.shipPhoto.removeAttribute("src");
  };

  const pictures = shipImagePaths(credits, hull?.id);
  if (pictures.length === 0) {
    // No picture, or one whose licence was never recorded: show nothing rather than an
    // unattributed image. The silhouette below carries the hull.
    hide();
    return;
  }

  // A different hull starts from her first picture (S76).
  if (pictureHullId !== hull.id) {
    pictureHullId = hull.id;
    pictureIndex = 0;
  }
  const at = Math.min(pictureIndex, pictures.length - 1);
  const picture = pictures[at];

  // Reloading the same picture on every keystroke would flicker: keep the src.
  const key = `${hull.id}:${at}`;
  if (els.shipPhoto.dataset.pictureKey !== key) {
    els.shipPhoto.dataset.pictureKey = key;
    els.shipPhoto.dataset.hullId = hull.id;
    els.shipPhoto.alt = t("shipyard.hullPhoto", { name: localisedHull(hull, t).name });
    els.shipPhoto.onerror = hide;
    els.shipPhoto.src = picture.path;
    els.shipFigure.classList.remove("is-hidden");
  }

  if (els.shipPhotoCaption) {
    els.shipPhotoCaption.textContent = t("shipyard.hullPhotoCredit", {
      author: picture.author,
      license: picture.license,
    });
    els.shipPhotoCaption.classList.remove("is-hidden");
  }
}

function render() {
  autoSaveRefit();
  const refitShip = fleet.ships.find((entry) => entry.id === refitId);
  const quote = refitShip ? quoteRefit(refitShip, currentConfig(), state.gold) : null;
  const ship = quote
    ? { ...quote.built, issues: quote.issues, errors: quote.errors, warnings: quote.warnings, feasible: quote.feasible }
    : buildShip(currentConfig(), state.gold);
  if (!ship) return;
  lastShip = ship;
  els.refitBanner.classList.toggle("is-hidden", !refitShip);
  els.refitMode.textContent = refitShip ? t("shipyard.refit.mode", { name: refitShip.name }) : "";
  els.launchBtn.textContent = t(refitShip ? "shipyard.refit.save" : "shipyard.launch");

  renderHullPicture(ship.hull);
  renderGuns(ship);
  renderMassBar(ship);
  renderStats(ship);
  renderVerdict(ship);
  renderPrice(ship, quote);
  renderBatteries();
  renderCrew();
  renderSupply(ship);
  drawShip(ship);

  els.goldValue.textContent = gold(state.gold);
  els.launchBtn.disabled = !ship.feasible;
  syncLaunchButton();

  for (const card of els.hullList.children) {
    const isActive =
      card.querySelector(".hull-card-name")?.textContent === localisedHull(ship.hull, t).name;
    card.classList.toggle("is-active", isActive);
    card.setAttribute("aria-selected", String(isActive));
    card.disabled = Boolean(refitShip);
  }

  saveConfig();
}

/* ---------------------------------------------------------------- launch */

/**
 * Save the refit editor into the selected hull. The button saves and leaves the mode
 * (`leave`); the automatic refit saves in place and keeps her selected, so the next
 * change is a refit of the same hull.
 */
function saveRefit({ leave }) {
  const target = localFleet().ships.find((entry) => entry.id === refitId);
  if (!target) return false;
  const name = state.shipName.trim() || target.name;
  const result = applyRefit(target, { ...currentConfig(), name }, state.gold);
  if (!result.applied) return false;
  fleet = { ...fleet, ships: fleet.ships.map((entry) => entry.id === target.id ? result.ship : entry) };
  state.gold = result.gold;
  saveFleet();
  savePurse(result.ship, target.id === fleet.captainId, { refit: true });
  arrivalNotice = null;
  lastAddedName = name;
  lastNoticeKey = "shipyard.refit.saved";
  els.purchaseNotice.textContent = t(lastNoticeKey, { name });
  els.goldValue.textContent = gold(state.gold);
  if (leave) {
    refitId = null;
    renderFleet();
    // The refitted hull is fleet business (S98): her strip and her sail checks are what
    // the player wants to see next; the builder stays where the mode put it.
    showScreen("flota");
  } else {
    renderFleet();
  }
  return true;
}

/** A loadout as a string that does not depend on key order. */
function stableJson(value) {
  return JSON.stringify(value, (_key, node) =>
    node && typeof node === "object" && !Array.isArray(node)
      ? Object.fromEntries(Object.entries(node).sort(([a], [b]) => (a < b ? -1 : 1)))
      : node);
}

/**
 * The automatic refit (setting `refit.autoSave`, on by default): every change the editor
 * holds that differs from the selected hull is saved at once. A change that cannot be
 * saved (it does not fit, or the purse is short) stays in the editor with its verdict on
 * screen, and is saved the moment it can be. Returns whether something was saved.
 */
function autoSaveRefit() {
  if (!(REFIT.autoSave > 0) || !refitId) return false;
  // A refit is a presence action (S133-C): a visit shows the hull, it does not touch her.
  if (visitingYard()) return false;
  const target = localFleet().ships.find((entry) => entry.id === refitId);
  if (!target || isWreck(target)) return false;
  const quote = quoteRefit(target, currentConfig(), state.gold);
  const before = buildShip(configFromShip(target))?.config;
  if (!quote?.feasible || !before) return false;
  const loadoutChanged = stableJson(quote.built.config) !== stableJson(before);
  const renamed = (state.shipName.trim() || target.name) !== target.name;
  if (!loadoutChanged && !renamed) return false;
  return saveRefit({ leave: false });
}

/** The save button belongs to buying, and to refitting only when it is not automatic. */
function syncLaunchButton() {
  const buying = activeScreen === "comprar";
  const refitting = activeScreen === "flota" && Boolean(refitId);
  els.launchBtn.style.display = buying || (refitting && !(REFIT.autoSave > 0)) ? "" : "none";
}

function launch() {
  const ship = lastShip;
  if (!ship || !ship.feasible) return;

  // The afford check is against the purse in hand, not the one the builder quoted
  // with: a second click after a purchase must not go into debt.
  if (!refitId && ship.price.total > state.gold) return;

  const target = fleet.ships.find((entry) => entry.id === refitId);
  if (target) {
    saveRefit({ leave: true });
    return;
  }

  const name = state.shipName.trim() || defaultShipName(ship.hull);
  const runtime = { ...toRuntimeShip(ship, { name }), yardId: screenShipyard()?.id ?? null };

  // The new captain is built here; preserve the voyage location and the old captain's
  // combat record rather than replacing the sea save with a home-port start.
  state.gold -= ship.price.total;
  const previousCaptainId = fleet.captainId;
  fleet = addShip(fleet, runtime);
  const previous = fleet.ships.find((entry) => entry.id === previousCaptainId);
  if (previous?.sails === false && previous.yardId === null) {
    fleet = withShipYard(fleet, previous.id, runtime.yardId);
  }
  saveFleet();
  savePurse(null, false, { promoteFrom: previousCaptainId, promoteTo: runtime.id });
  try {
    localStorage.removeItem(SHIP_KEY);
  } catch {
    /* the ship still exists in memory for this session */
  }

  // The buy screen reads like the old one (S105): the purchase answers in her notice
  // and the player stays where she was building.
  renderFleet();
  showScreen("comprar");
  arrivalNotice = null;
  lastAddedName = name;
  lastNoticeKey = "shipyard.added";
  els.purchaseNotice.textContent = t(lastNoticeKey, { name });
}

function defaultShipName(hull) {
  return defaultShipNameFor(hull.id, t);
}

/* ---------------------------------------------------------------- events */

els.addBattery.addEventListener("click", () => {
  const pieceId = els.pieceSelect.value;
  const piece = pieceById(pieceId);
  // The shop only sells the active country's ordnance (S26), whatever the picker says.
  if (!piece || !countryPieces().some((entry) => entry.id === piece.id)) return;
  const side = piece.swivel
    ? "swivel"
    : state.batteries.filter((b) => b.side === "babor").length
        <= state.batteries.filter((b) => b.side === "estribor").length
      ? "babor"
      : "estribor";
  state.batteries.push({
    pieceId,
    qty: 2,
    side,
    shotsPerPiece: 20,
    ammoId: piece.ammo[0],
  });
  render();
});

els.shipName.addEventListener("input", (event) => {
  state.shipName = event.target.value;
  saveConfig();
});
// A rename is a change too: with the automatic refit on it is saved when the box is left.
els.shipName.addEventListener("change", () => {
  if (autoSaveRefit()) render();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === tab.dataset.tab);
    });
  });
});

/* ---------------------------------------------------------------- screen tabs (S97, S105) */

/** The screen's four rooms. The ship+rig panels are one DOM (S99): re-parented, not cloned. */
const SCREENS = ["flota", "comprar", "astillero", "mercado", "configuracion"];
let activeScreen = "flota";
/** Where the ship+rig column lives while nobody is building (user S105). */
let builderScreen = "comprar";

const $shipAndRig = () => [document.querySelector(".panel-ship"), document.querySelector(".panel-build")];

/**
 * Make the room read like the original build screen (user S105). Buying shows the hull
 * shelf; the fleet and the yard rooms show their own column instead, and the shared
 * ship+rig panels move in behind it so every room keeps the same three-column shape.
 * Only the room's own foot actions show: no refit banner while buying, no price while
 * reading the fort.
 */
function showScreen(next) {
  if (!SCREENS.includes(next)) return;
  if (reconcileSavedCaptain()) renderFleet();
  activeScreen = next;
  for (const tab of document.querySelectorAll(".screen-tab")) {
    const on = tab.dataset.screen === next;
    tab.classList.toggle("is-active", on);
    tab.setAttribute("aria-selected", String(on));
  }
  for (const panel of document.querySelectorAll(".screen-panel")) {
    panel.classList.toggle("is-active", panel.dataset.screenPanel === next);
  }
  // The hull shelf belongs to the buy room alone: the fleet and the yard rooms hold
  // their own column in its place (S105).
  document.querySelector(".panel-hulls").toggleAttribute("hidden", next !== "comprar");
  // The ship+rig panels stand in every build-like room (S105): buying, refitting, the
  // fleet room and the yard room all read like the original three-column screen, with
  // only the left column swapped. In pure-reading rooms they still render.
  const standIn = next !== "configuracion";
  for (const node of $shipAndRig()) node.toggleAttribute("hidden", !standIn);
  const slot = document.getElementById(standIn ? `${next}-builder-slot` : null);
  if (standIn && slot) {
    // The parking slots ship hidden so an empty room shows no gap; a slot that holds
    // the ship+rig panels must be visible, or her children inherit the hidden state.
    slot.removeAttribute("hidden");
    for (const node of $shipAndRig()) slot.appendChild(node);
  }

  // The footer shows only what the room needs (S98/S99, S105): buying shows the price
  // and the add button; refitting shows the price and the save button; the fleet shows
  // setting sail; the yard and the settings own none of them. In the fleet and yard
  // rooms the ship+rig panels render read-only: their foot actions stay hidden.
  const buying = next === "comprar";
  const refitting = next === "flota" && Boolean(refitId);
  const editing = buying || refitting;
  els.priceStrip.style.display = editing ? "" : "none";
  syncLaunchButton();
  els.setSailBtn.style.display = next === "flota" ? "" : "none";
  els.verdictIssues.style.display = editing ? "" : "none";
  // The ship+rig panels stand in read-only rooms too (S105): her banner, her verdict
  // chips and her button states must not leak the mode the room came from, so the
  // render runs here as well with the refit target already cleared.
  // The market trades with the selected hull, and the rig beside it is that hull's rig:
  // entering with nobody selected (or a wreck) selects the captain first.
  if (next === "mercado") ensureMarketSelection();
  // The title bar's selector and the voyage offer belong to every room (S133-A).
  renderYardSelector();
  renderYardTravel();
  if (next !== "configuracion") render();
  // The yard's room repaints on entry: her state may have changed at sea since the
  // last look (S100).
  if (next === "astillero") renderFort();
  // The market belongs to the yard she is moored at (S118), so it repaints on entry.
  if (next === "mercado") renderMarket();
  if (next === "configuracion") repaintSettingsForLanguage();
}


/* ---------------------------------------------------------------- market (S118) */

/**
 * Which yard the astillero screen is trading with (S118).
 *
 * The screen is a place, so it trades with the yard the captain is moored at. When the
 * save carries no voyage — the player is ashore, between voyages — it trades with the
 * home port, which is where she would walk to. Anything unreadable resolves to the home
 * port as well, so a broken save opens the market instead of an empty screen.
 */
let markets = {};
let marketQuotes = new Map();
let quotedYardId = null;

function savedCaptainPosition() {
  const game = readFortSave();
  return (game?.world ? deserializeWorld(game.world)?.ship : null) ?? game?.ship;
}

/** The yard the captain's hull is moored at right now (S133-C). */
function captainYard() {
  const ship = savedCaptainPosition();
  const yard = ship && Number.isFinite(ship.x) && Number.isFinite(ship.y)
    ? currentShipyard({ x: ship.x, y: ship.y })
    : null;
  return yard ?? SHIPYARDS.find((entry) => entry.home) ?? SHIPYARDS[0] ?? null;
}

/* ---------------------------------------------------------------- yard selector (S133) */

/**
 * Which yard the screen is showing (S133-A). It is the yard the player picked in the title
 * bar's selector; with nobody picked it is the yard the captain is moored at, which is the
 * yard the screen has always shown (S118). A pick that is not a real yard is no pick, so a
 * broken save opens on the captain's own water.
 */
let viewedYardId = null;

/** The player's own names for the yards, per yard id (S133-B). */
let yardNames = loadYardNames();

function loadYardNames() {
  try {
    return parseYardNames(localStorage.getItem(YARD_NAMES_KEY));
  } catch {
    return {};
  }
}

function saveYardNames() {
  try {
    localStorage.setItem(YARD_NAMES_KEY, serialiseYardNames(yardNames));
  } catch {
    /* storage disabled: the names still live for this session */
  }
}

function screenShipyard() {
  return shipyardById(viewedYardId) ?? captainYard();
}

/** The name the selector shows: the player's own, else the one the yard shipped with. */
function yardName(yard) {
  return yardDisplayName(yard, yardNames, t);
}

/**
 * True while the screen is only visiting a yard (S133-C): her data is on show, but every
 * action that needs the captain's presence is disabled, because she is moored elsewhere.
 */
function visitingYard() {
  const shown = screenShipyard();
  const moored = captainYard();
  return Boolean(shown && moored && shown.id !== moored.id);
}

/** The reason a presence action is refused right now, in the player's language. */
function visitReason() {
  return t("shipyard.yard.visitNote", { name: yardName(screenShipyard()) });
}

/**
 * Refuse a presence action while the screen is a visit, saying why (S133-C). Returns true
 * when the action was refused, so a handler can return on it.
 */
function refuseVisit() {
  if (!visitingYard()) return false;
  els.purchaseNotice.classList.add("is-error");
  els.purchaseNotice.textContent = visitReason();
  return true;
}

/** The list of yards in the title bar, with the yard on screen selected (S133-A). */
function renderYardSelector() {
  if (!els.yardSelect) return;
  const shown = screenShipyard();
  els.yardSelect.textContent = "";
  for (const yard of SHIPYARDS) {
    const option = document.createElement("option");
    option.value = yard.id;
    option.textContent = yardName(yard);
    els.yardSelect.append(option);
  }
  els.yardSelect.value = shown?.id ?? "";
  els.yardSelect.title = shown ? yardName(shown) : "";
  if (els.yardRenameBtn) els.yardRenameBtn.disabled = !shown;
  renderYardTitle(shown);
}

/**
 * The title bar names the yard on screen and her water (S134). The app's own name is not
 * the answer here: this screen is that yard's, so it reads her name, and the line under
 * it says which water she is in.
 */
function renderYardTitle(yard) {
  if (!yard) return;
  const zone = shipyardZone(yard);
  if (els.brandYard) els.brandYard.textContent = yardName(yard);
  if (els.brandWater) {
    els.brandWater.textContent = zone
      ? t("shipyard.yard.water", { zone: t(`zone.${zone.id}.name`) })
      : t("app.brandSub");
  }
}

/**
 * Repaint every room that reads a yard (S134): the title, the selector, the fleet list and
 * her panel, the yard's own room, the market and the refit editor. Changing the selector
 * used to repaint them one by one, which left whichever room was not listed showing the
 * previous yard's numbers.
 */
function renderYardRooms() {
  renderYardSelector();
  renderYardTravel();
  renderFleet();
  renderFort();
  renderMarket();
  render();
}

/** The captain's live supply, in days, as the shipyard knows it (S133-D). */
function captainSupplyDays() {
  const captain = captainShip(fleet);
  const days = Number(captain?.days);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/** What the voyage to the yard on screen would cost (S133-D), or null with no voyage. */
function voyageToShownYard() {
  const to = screenShipyard();
  const from = captainYard();
  if (!to || !from || to.id === from.id) return null;
  return voyageQuote(from.id, to.id, {
    speedKn: captainShip(fleet)?.speedKn ?? 0,
    supplyDays: captainSupplyDays(),
    gold: state.gold,
    upkeep: fleetUpkeep(fleet),
  });
}

/** The voyage that has been quoted but not yet charged (S133-E). */
let quotedVoyageTo = null;

/**
 * The visit note and the voyage button (S133-C, S133-E): the button reports the quote
 * before charging anything, and only the second press spends the supply and the gold.
 */
function renderYardTravel() {
  if (!els.yardTravelBtn || !els.yardVisitNote) return;
  const visiting = visitingYard();
  const quote = visiting ? voyageToShownYard() : null;
  const target = screenShipyard();
  els.yardVisitNote.classList.toggle("is-hidden", !visiting);
  if (visiting) els.yardVisitNote.textContent = visitReason();
  els.yardTravelBtn.classList.toggle("is-hidden", !quote);
  if (!quote) {
    quotedVoyageTo = null;
    return;
  }
  const name = yardName(target);
  const quoted = quotedVoyageTo === target.id;
  els.yardTravelBtn.disabled = !quote.canMake;
  els.yardTravelBtn.textContent = quoted
    ? t("shipyard.yard.travelConfirm", { name })
    : t("shipyard.yard.travel", { name });
  if (!quoted) els.yardTravelBtn.title = "";
  if (quoted) {
    els.yardTravelBtn.title = quote.canMake
      ? t("shipyard.yard.travelQuote", {
          name,
          distance: gold(quote.distanceM),
          days: gold(quote.days),
          supply: gold(quote.supplyDays),
          gold: gold(quote.gold),
        })
      : t("shipyard.yard.travelShort", {
          supply: gold(quote.supplyShort),
          gold: gold(quote.goldShort),
        });
  }
}

/**
 * Move the captain to the yard on screen and charge what the quote said (S133-D, S133-E).
 *
 * The sea save is the record of where she is and what she carries, so the arrival is
 * written there too: the position (or the next boot would read her back at the old yard),
 * the purse, and the captain's own supply. Every other hull keeps her mooring.
 */
function sailToShownYard() {
  const target = screenShipyard();
  const quote = voyageToShownYard();
  if (!target || !quote || !quote.canMake) return false;
  const captain = captainShip(fleet);
  const result = arriveAt(fleet, target.id, quote);
  if (!result || !captain) return false;

  fleet = {
    ...result.fleet,
    ships: result.fleet.ships.map((ship) => ship.id === captain.id
      ? { ...ship, days: Math.max(0, (Number(ship.days) || 0) - result.supplyDaysSpent) }
      : ship),
  };
  state.gold = Math.max(0, state.gold - result.goldSpent);
  saveFleet();

  // The sea's per-hull reserve is the live supply (S132): spend the same days there, or
  // the next voyage would sail with the reserve the captain left the old yard with.
  const game = readFortSave() ?? {};
  const patch = { gold: state.gold, ship: { ...(game.ship ?? {}), x: target.x, y: target.y, heading: 0 } };
  const reserves = game.supplyByHull && typeof game.supplyByHull === "object" ? { ...game.supplyByHull } : null;
  if (reserves && Object.prototype.hasOwnProperty.call(reserves, captain.id)) {
    const burned = burnSupply(reserves[captain.id], supplySeconds(result.supplyDaysSpent));
    reserves[captain.id] = burned.secondsLeft;
    patch.supplyByHull = reserves;
    if (Number(game.supplyLeftS) >= 0 && game.supplyLeftS !== undefined) patch.supplyLeftS = burned.secondsLeft;
  }
  if (typeof game.world === "string") {
    try {
      const world = JSON.parse(game.world);
      world.ship = { ...(world.ship ?? {}), x: target.x, y: target.y, heading: 0 };
      patch.world = JSON.stringify(world);
    } catch {
      /* a broken sea save is left alone: the arrival still lives on the fleet sheet */
    }
  }
  writeFortSave({}, patch);

  quotedVoyageTo = null;
  els.goldValue.textContent = gold(state.gold);
  els.purchaseNotice.classList.remove("is-error");
  els.purchaseNotice.textContent = t("shipyard.yard.arrived", {
    name: yardName(target),
    days: gold(result.supplyDaysSpent),
    gold: gold(result.goldSpent),
  });
  renderYardRooms();
  return true;
}

if (els.yardSelect) {
  els.yardSelect.addEventListener("change", (event) => {
    const yard = shipyardById(event.target.value);
    viewedYardId = yard?.id ?? null;
    quotedVoyageTo = null;
    els.purchaseNotice.classList.remove("is-error");
    els.purchaseNotice.textContent = "";
    // The refit editor is a room of the yard on screen: a hull of another yard must not
    // stay selected, or the panel would edit her from the wrong water.
    if (refitId && !localFleet().ships.some((ship) => ship.id === refitId)) refitId = null;
    renderYardRooms();
  });
}

/** The pencil opens the inline rename, which is the only way a name is edited (S133-B). */
function openYardRename() {
  const yard = screenShipyard();
  if (!yard || !els.yardNameInput) return;
  els.yardNameInput.value = yardName(yard);
  els.yardNameInput.classList.remove("is-hidden");
  els.yardNameInput.focus();
  els.yardNameInput.select();
}

/** Store the typed name; an empty or whitespace name brings the shipped one back. */
function commitYardRename() {
  const yard = screenShipyard();
  if (!yard || !els.yardNameInput) return;
  yardNames = withYardName(yardNames, yard.id, els.yardNameInput.value);
  saveYardNames();
  els.yardNameInput.value = "";
  els.yardNameInput.classList.add("is-hidden");
  els.purchaseNotice.classList.remove("is-error");
  els.purchaseNotice.textContent = t("shipyard.yard.renamed", { name: yardName(yard) });
  renderYardSelector();
  renderYardTravel();
  renderMarket();
}

if (els.yardRenameBtn) {
  els.yardRenameBtn.addEventListener("click", openYardRename);
}

if (els.yardNameInput) {
  els.yardNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitYardRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      els.yardNameInput.value = "";
      els.yardNameInput.classList.add("is-hidden");
    }
  });
  // Leaving the field saves too, so the control is usable without the keyboard shortcut.
  els.yardNameInput.addEventListener("blur", () => {
    if (els.yardNameInput.classList.contains("is-hidden")) return;
    commitYardRename();
  });
}

if (els.yardTravelBtn) {
  els.yardTravelBtn.addEventListener("click", () => {
    const target = screenShipyard();
    if (!target) return;
    const quote = voyageToShownYard();
    if (!quote) return;
    // First press quotes; the second one charges (S133-E).
    if (quotedVoyageTo !== target.id) {
      quotedVoyageTo = target.id;
      renderYardTravel();
      els.purchaseNotice.classList.remove("is-error");
      els.purchaseNotice.textContent = quote.canMake
        ? t("shipyard.yard.travelQuote", {
            name: yardName(target),
            distance: gold(quote.distanceM),
            days: gold(quote.days),
            supply: gold(quote.supplyDays),
            gold: gold(quote.gold),
          })
        : t("shipyard.yard.travelShort", {
            supply: gold(quote.supplyShort),
            gold: gold(quote.goldShort),
          });
      return;
    }
    if (!sailToShownYard()) {
      els.purchaseNotice.classList.add("is-error");
      els.purchaseNotice.textContent = t("shipyard.yard.travelShort", {
        supply: gold(quote.supplyShort),
        gold: gold(quote.goldShort),
      });
      quotedVoyageTo = null;
      renderYardTravel();
    }
  });
}

/** Persist only a real change, before any room reads its local fleet. */
function reconcileSavedCaptain() {
  const next = reconcileCaptainPosition(fleet, savedCaptainPosition());
  if (next === fleet) return false;
  fleet = next;
  if (refitId && !localFleet().ships.some((ship) => ship.id === refitId)) refitId = null;
  saveFleet();
  return true;
}

/**
 * The selected hull, which is the one whose hold the market reads and writes. The
 * selection is the fleet's own (`refitId`), so the market, the fleet list and the rig
 * panel always talk about the same hull; with no usable selection it is the captain.
 */
function localFleet() {
  const yard = screenShipyard();
  // The visitors' window is the yard the captain is moored at (S130): a visit to another
  // yard shows her own moored hulls, never the squadron that is sailing elsewhere.
  return { ...fleet, ships: shipsAvailableAtYard(fleet, yard?.id, captainYard()?.id) };
}

function marketShip() {
  return tradingShip(localFleet(), refitId);
}

/** Make the selection a hull that can trade, so the rig panel stands for her too. */
function ensureMarketSelection() {
  const ship = marketShip();
  if (ship && ship.id !== refitId) selectRefitShip(ship, { openRoom: false });
}

/**
 * Buy one unit at the yard (S118). The hold is written back to the captain's fleet entry
 * and the purse to the shared game save, which is the only record of gold (S32).
 */
function marketBuy(commodityId) {
  if (refuseVisit()) return;
  const ship = marketShip();
  const yard = screenShipyard();
  const zone = yard ? shipyardZone(yard) : null;
  const quote = yard?.id === quotedYardId ? marketQuotes.get(commodityId) : null;
  if (!ship || !zone || !quote) return;
  const hold = shipHold(ship);
  const trade = buyCargo(
    { manifest: hold.manifest, capacityKg: ship.capacityKg, cargoKg: ship.cargoKg, gold: state.gold },
    commodityId,
    1,
    yard.id,
    { unitPrice: quote.buy, availableStock: quote.stock },
  );
  if (!trade) {
    els.marketStatus.textContent = t("market.refused");
    return;
  }
  applyMarketTrade(ship, trade.hold, trade.gold, yard.id, commodityId, -trade.units);
  els.marketStatus.textContent = t("market.paid", {
    gold: gold(trade.paid),
    units: trade.units,
    name: t(commodityNameKey(commodityId)),
  });
}

/** Sell every unit of one commodity the captain is carrying (S118). */
function marketSell(commodityId) {
  if (refuseVisit()) return;
  const ship = marketShip();
  const yard = screenShipyard();
  const zone = yard ? shipyardZone(yard) : null;
  if (!ship || !zone) return;
  const quote = yard?.id === quotedYardId ? marketQuotes.get(commodityId) : null;
  if (!quote) return;
  const hold = shipHold(ship);
  const units = hold.manifest.filter((entry) => entry.commodityId === commodityId)
    .reduce((sum, entry) => sum + entry.units, 0);
  if (!units) {
    els.marketStatus.textContent = t("market.nothing");
    return;
  }
  // The yard pays unit by unit from her own stock (S125): quoting one price for the whole
  // load let a single sale of 500 silver pay 288000 into a market holding 60.
  const trade = sellCargo(
    { manifest: hold.manifest, gold: state.gold },
    commodityId,
    units,
    yard.id,
    // A yard with no memory yet is a yard at rest, not a yard without prices (S125):
    // passing `undefined` would fall back to the flat quote and the first sale of the
    // game would be the one that escapes the curve.
    { unitPrice: quote.sell, memory: markets[yard.id] ?? {} },
  );
  if (!trade) {
    els.marketStatus.textContent = t("market.nothing");
    return;
  }
  applyMarketTrade(ship, trade.hold, trade.gold, yard.id, commodityId, trade.units);
  els.marketStatus.textContent = t("market.earned", {
    gold: gold(trade.earned),
    units: trade.units,
    name: t(commodityNameKey(commodityId)),
  });
}

/** Write a trade where it belongs: the hold on the hull, the purse in the save. */
function applyMarketTrade(ship, hold, nextGold, yardId, commodityId, delta) {
  fleet = {
    ...fleet,
    ships: fleet.ships.map((entry) => (entry.id === ship.id ? withHold(entry, hold) : entry)),
  };
  saveFleet();
  // The rig panel shows this hull's cargo (Aparejo / Carga): it follows the trade.
  const traded = fleet.ships.find((entry) => entry.id === ship.id);
  if (traded && traded.id === refitId) state.cargoKg = traded.cargoKg;
  state.gold = normaliseGold(nextGold);
  markets = { ...markets, [yardId]: withStock(markets[yardId], commodityId, delta) };
  // Gold and markets belong to the same sea save, not to the fort's nested state.
  writeFortSave({}, { gold: state.gold, markets });
  els.goldValue.textContent = gold(state.gold);
  render();
  renderMarket();
  renderFleet();
}

const commodityNameKey = (commodityId) =>
  COMMODITIES.find((entry) => entry.id === commodityId)?.nameKey ?? commodityId;

/** The hulls that can take goods aboard, with the selected one chosen. */
function renderMarketShipPicker(ship) {
  if (!els.marketShip) return;
  els.marketShip.textContent = "";
  for (const entry of localFleet().ships.filter((candidate) => !isWreck(candidate))) {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name ?? entry.hullName ?? entry.id;
    els.marketShip.append(option);
  }
  els.marketShip.value = ship?.id ?? "";
  els.marketShip.disabled = els.marketShip.options.length < 2;
}

els.marketShip?.addEventListener("change", () => {
  const ship = tradingShip(localFleet(), els.marketShip.value);
  if (!ship) return;
  selectRefitShip(ship, { openRoom: false });
  renderFleet();
  render();
  renderMarket();
});

/** The market board of the yard the screen is in (S118). */
function renderMarket() {
  if (!els.marketBoard) return;
  const yard = screenShipyard();
  const zone = yard ? shipyardZone(yard) : null;
  const ship = marketShip();
  els.marketYard.textContent = yard ? yardName(yard) : t("market.noYard");
  // The line names the water and the goods this yard trades: her market is her own.
  els.marketZone.textContent = zone
    ? t("market.zone", {
        zone: t(`zone.${zone.id}.name`),
        goods: COMMODITIES.filter((entry) => tradedHere(yard.id, entry.id)).map((entry) => t(entry.nameKey)).join(", "),
      })
    : t("market.noYard");

  renderMarketShipPicker(ship);
  const hold = ship ? shipHold(ship) : { manifest: [], cargoKg: 0 };
  els.marketHold.textContent = ship
    ? t("market.hold", { used: gold(hold.cargoKg), capacity: gold(ship.capacityKg ?? 0) })
    : t("market.noYard");

  const board = zone ? marketBoardNow(yard.id, markets[yard.id]) : [];
  quotedYardId = yard?.id ?? null;
  marketQuotes = new Map(board.map((row) => [row.id, row]));
  // A visit trades nothing (S133-C): her board is on show, but the buttons need the
  // captain's presence, and they say so instead of silently failing.
  const visiting = visitingYard();
  const disabled = visiting ? ` disabled title="${visitReason().replace(/"/g, "&quot;")}"` : "";
  // Where this yard stands on each good, against the rest of her own markets (S135).
  const standing = (commodityId) => priceStanding(commodityId, yard.id, markets);
  const standingTitle = (commodityId) => {
    const state = standing(commodityId);
    if (state === "even") return "";
    return t(state === "cheaper" ? "market.standingCheaper" : "market.standingDearer", {
      name: t(commodityNameKey(commodityId)),
    });
  };
  // The sale side has its own question: where do they pay the most (S136).
  const saleStanding = (commodityId) => sellStanding(commodityId, yard.id, markets);
  const saleTitle = (commodityId) => {
    const state = saleStanding(commodityId);
    if (state === "even") return "";
    return t(state === "best" ? "market.saleBest" : "market.saleWorst", {
      name: t(commodityNameKey(commodityId)),
    });
  };
  els.marketBoard.innerHTML = board
    .map((row) => {
      const stock = hold.manifest.filter((entry) => entry.commodityId === row.id).reduce((sum, entry) => sum + entry.units, 0);
      const room = ship && zone
        ? affordableUnits({ capacityKg: ship.capacityKg, cargoKg: ship.cargoKg, gold: state.gold }, row.id, yard.id, { unitPrice: row.buy, availableStock: row.stock })
        : 0;
      return `
        <li class="market-row" data-commodity="${row.id}">
          <span class="market-name is-${standing(row.id)}" title="${standingTitle(row.id)}">${t(row.nameKey)}</span>
          <span class="market-kg">${gold(row.kgPerUnit)} kg</span>
          <span class="market-price">${t("market.buy")} ${gold(row.buy)}</span>
          <span class="market-price is-${saleStanding(row.id)}" title="${saleTitle(row.id)}">${t("market.sell")} ${gold(row.sell)}</span>
          <span class="market-stock">${gold(stock)}</span>
          <span class="market-yard-stock">${t("market.yardStock", { units: gold(Math.floor(row.stock)) })}</span>
          <span class="market-actions">
            <button class="btn market-buy" type="button" data-buy="${row.id}" ${room > 0 && !visiting ? "" : "disabled"}${disabled}>${t("market.buyOne")}</button>
            <button class="btn market-sell" type="button" data-sell="${row.id}" ${stock > 0 && !visiting ? "" : "disabled"}${disabled}>${t("market.sellAll")}</button>
          </span>
        </li>`;
    })
    .join("");
  if (board.length === 0) els.marketBoard.innerHTML = `<li class="market-empty">${t("market.noYard")}</li>`;
}

/** Where the ship+rig column currently lives, for the boot decision and the tests. */
function moveBuilder(toScreen) {
  builderScreen = toScreen;
}

for (const tab of document.querySelectorAll(".screen-tab")) {
  tab.addEventListener("click", () => {
    const next = tab.dataset.screen;
    // Buying always rebuilds from nothing (S99): entering Comprar exits the refit mode.
    if (next === "comprar" && refitId) {
      refitId = null;
      renderFleet();
    }
    showScreen(next);
  });
}

els.launchBtn.addEventListener("click", () => {
  if (refuseVisit()) return;
  launch();
});

// The market board is redrawn on every trade, so its actions are delegated (S118).
els.marketBoard?.addEventListener("click", (event) => {
  const buy = event.target.closest("[data-buy]");
  if (buy) return marketBuy(buy.dataset.buy);
  const sell = event.target.closest("[data-sell]");
  if (sell) return marketSell(sell.dataset.sell);
});

// The automatic-fire switch moved to the settings screen (S88), where every other
// design number lives. Nothing on this screen owns it any more.

els.setSailBtn.addEventListener("click", () => {
  // A visit does not sail (S133-C): the voyage to that yard is the travel button's job.
  if (refuseVisit()) return;
  // A yard in enemy hands closes the repairs, not the sailing (S92). The player has to be
  // able to put to sea to go and take her back; blocking the departure is what used to
  // lock the whole save, because from inside the shipyard there was no other way out.
  // The warning still shows, so nobody sails without knowing the port is closed to them.
  const game = (() => {
    try {
      return JSON.parse(localStorage.getItem(GAME_KEY) ?? "null");
    } catch {
      return null;
    }
  })();
  const fort = game?.fort;
  const heldByEnemy = Boolean(fort && (fort.status === "surrendered" || fort.status === "sunk"));
  if (heldByEnemy) {
    // Sailing is allowed; the notice is a warning, not a refusal (S91: it reads as an error).
    els.purchaseNotice.classList.add("is-error");
    els.purchaseNotice.textContent = t("shipyard.fort.closed");
  } else {
    els.purchaseNotice.classList.remove("is-error");
    els.purchaseNotice.textContent = "";
  }
  fleet = departYard(fleet, screenShipyard()?.id);
  saveFleet();
  saveConfig();
  window.location.href = "./sea.html";
});

/* ---------------------------------------------------------------- fleet (S7) */

/** Load the owned ships, adopting the single-ship save written before fleets. */
function loadFleetState() {
  try {
    const legacy = JSON.parse(localStorage.getItem(SHIP_KEY) ?? "null");
    const legacyShip = legacy && Number.isFinite(legacy.speedKn) ? legacy : null;
    return deserializeFleet(localStorage.getItem(FLEET_KEY), legacyShip);
  } catch {
    return { ships: [], captainId: null };
  }
}

let fleet = loadFleetState();

/**
 * The shipyard's own state (S74), read from the sea save: her hull, her garrison and the
 * guns her victories have earned. The shipyard does not run the fight; it only reports it,
 * so there is one source of truth and it is the sea's.
 */
function readFortSave() {
  try {
    return JSON.parse(localStorage.getItem(GAME_KEY) ?? "null") ?? null;
  } catch {
    return null;
  }
}

/**
 * Patch the fort save in `barcos:game:v1` (S100). The sea save is the fort's only record,
 * so a repair or a purchase must land there, or the next voyage would wash it away.
 */
function writeFortSave(patch, recordPatch = {}) {
  const record = readFortSave() ?? {};
  const fort = record.fort && typeof record.fort === "object" ? record.fort : {};
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify({ ...record, ...recordPatch, fort: { ...fort, ...patch } }));
  } catch {
    /* storage disabled: the change still lives in memory for this session */
  }
}

function renderFort() {
  if (!els.fortState) return;
  const game = readFortSave();
  const fort = game?.fort;
  const victories = Math.max(0, Math.floor(Number(game?.victories) || 0));
  const condition = fort?.condition ?? { hull: 100, crew: 100 };
  const status = fort?.status ?? "fighting";
  const taken = status === "surrendered" || status === "sunk";
  const bought = fortBoughtGuns(fort ?? {});

  els.fortState.textContent = taken ? t("shipyard.fort.taken") : t("shipyard.fort.ours");
  els.fortState.className = `fort-state${taken ? " is-taken" : ""}`;
  els.fortHull.style.width = `${Math.max(0, Math.min(100, Math.round(Number(condition.hull) || 0)))}%`;
  els.fortCrew.style.width = `${Math.max(0, Math.min(100, Math.round(Number(condition.crew) || 0)))}%`;
  const perSide = fortGunsPerSide({ victories, boughtGuns: bought });
  els.fortDetail.textContent = t("shipyard.fort.detail", {
    guns: perSide * 2,
    victories,
    needed: FORT.gunsPerVictories - (victories % FORT.gunsPerVictories),
  });

  // The yard's own room (S100): a taken yard sells nothing; a whole one offers nothing
  // to fix, and a capped battery offers nothing to buy. A visit (S133-C) offers neither,
  // because both need the captain's presence.
  const visiting = visitingYard();
  const quote = fortRepairQuote({ condition: { hull: condition.hull, crew: condition.crew }, status });
  const headroom = fortGunHeadroom(fort ?? {}, { victories });
  els.fortRepairBtn.disabled = visiting || taken || !quote.repairable || state.gold < quote.cost;
  els.fortGunBtn.disabled = visiting || taken || headroom <= 0 || state.gold < fortGunCost();
  els.fortRepairBtn.title = visiting ? visitReason() : "";
  els.fortGunBtn.title = visiting ? visitReason() : "";
  els.fortGunBtn.textContent = headroom <= 0
    ? t("shipyard.fort.gunsCapped")
    : t("shipyard.fort.buyGunPlain", { gold: gold(fortGunCost()) });
  els.fortRepairBtn.textContent = quote.repairable
    ? t("shipyard.fort.repair", { gold: gold(priceWithPurse(quote.cost, state.gold)) })
    : t("shipyard.fort.repairPlain");
  els.fortUpgradeNote.textContent = visiting
    ? visitReason()
    : taken
      ? t("shipyard.fort.takenNote")
      : bought > 0
        ? t(bought === 1 ? "shipyard.fort.bought.one" : "shipyard.fort.bought.many", { count: bought })
        : "";
}

/**
 * Write the topped-up racks back into the sea save (S121). The rearm is useless if only
 * the fleet sheet learns about it: the sea rebuilds every gun from `combat`, so that is
 * where the rounds have to land or the next voyage sails with empty racks again.
 */
function writeRackedRounds(shipId, live) {
  if (!live || !Array.isArray(live.pieces)) return;
  const record = readFortSave();
  if (!record?.combat) return;
  const combat = record.combat;
  const isCaptain = fleet.captainId === shipId;
  const patched = isCaptain
    ? { ...combat, player: { ...combat.player, pieces: live.pieces } }
    : { ...combat, escorts: { ...combat.escorts, [shipId]: { ...combat.escorts?.[shipId], pieces: live.pieces } } };
  // The first argument of `writeFortSave` is the FORT patch; a top-level field of the
  // sea save goes in the second one, or the racks would be written under `fort.combat`.
  writeFortSave({}, { combat: patched });
}

/**
 * What the sea save says is left in one hull's racks (S121). The fleet sheet carries the
 * bought loadout, not the rounds: only the sea knows what a battle spent, so the quote
 * has to read it from there or the yard would always think the racks are full.
 *
 * A hull with nothing saved (never sailed, or a save written before this feature) comes
 * back null, which the quote reads as "nothing owed" — the safe direction, because it can
 * never charge for rounds that were never spent.
 */
function readLiveCombat(shipId) {
  const game = readFortSave();
  const combat = game?.combat;
  if (!combat) return null;
  const isCaptain = fleet.captainId === shipId;
  const saved = isCaptain ? combat.player : combat.escorts?.[shipId];
  if (!saved || !Array.isArray(saved.pieces)) return null;
  return { pieces: saved.pieces };
}

function saveFleet() {
  try {
    localStorage.setItem(FLEET_KEY, serializeFleet(fleet));
  } catch {
    /* the fleet still exists for this session */
  }
}

/** Redraw the fleet strip: every owned hull, with the captain marked. */
function renderFleet() {
  const captain = captainShip(fleet);
  const local = localFleet();
  // A visit reads the yard but does not sail from it (S133-C): the captain is elsewhere.
  els.setSailBtn.disabled = visitingYard() || !local.ships.some((ship) => ship.id === captain?.id && !isWreck(ship));
  els.setSailBtn.title = visitingYard() ? visitReason() : "";
  renderFort();
  // Country remains locked by the whole fleet, not just this yard.
  renderCountry();
  els.fleetCount.textContent = isEmptyFleet(local)
    ? t("fleet.count.none")
    : t(local.ships.length === 1 ? "fleet.count.one" : "fleet.count.many", {
        count: local.ships.length,
      });

  if (isEmptyFleet(local)) {
    els.fleetList.innerHTML = `<li class="fleet-empty">${t("fleet.empty")}</li>`;
    renderFleetDetail();
    return;
  }

  els.fleetList.innerHTML = local.ships
    .map((ship) => {
      const isCaptain = ship.id === captain?.id;
      // The captain always sails; every other hull sails if its check is on (S35).
      const sails = isCaptain || ship.sails !== false;
      const wreck = isWreck(ship);
      return `
        <li class="fleet-item${isCaptain ? " is-captain" : ""}${sails ? " is-sailing" : ""}${ship.id === refitId ? " is-refitting" : ""}${wreck ? " is-wreck" : ""}" data-ship-id="${ship.id}">
          <input class="fleet-check" type="checkbox" data-sail="${ship.id}"
            ${sails ? "checked" : ""} ${isCaptain ? "disabled" : ""}
            aria-label="${t("fleet.sails", { name: ship.name })}"
            title="${isCaptain ? t("fleet.sailsCaptain") : t("fleet.sails", { name: ship.name })}" />
          <button class="fleet-ship" type="button" data-refit="${ship.id}" title="${t("shipyard.refit.select")}">
            <span class="fleet-mark">${isCaptain ? "⚓" : "·"}</span>
            <span class="fleet-name">${ship.name}</span>
            <span class="fleet-hull">${ship.hullName}</span>
            ${wreck ? `<span class="fleet-tag fleet-tag-wreck" title="${t("fleet.wreckHint")}">${t("fleet.wreck")}</span>` : ""}
          </button>
          ${isCaptain ? `<span class="fleet-tag" title="${t("fleet.isCaptain")}">${t("fleet.captain")}</span>` : `<button class="fleet-captain-button" type="button" data-captain="${ship.id}" title="${t("fleet.promote")}">${t("shipyard.refit.captain")}</button>`}
        </li>`;
    })
    .join("");

  renderFleetDetail();
}

/**
 * The selected hull's panel (S108): her condition bars and the repair and sell actions
 * that used to sit on every row. They live here once, so the list reads as a list and
 * the actions belong to whoever is selected — which is also who the refit editor holds.
 */
function renderFleetDetail() {
  const local = localFleet();
  const ship = local.ships.find((entry) => entry.id === refitId) ?? null;
  if (!els.fleetDetail) return;
  const hasFleet = !isEmptyFleet(local);
  els.fleetDetail.hidden = !ship;
  els.fleetEmptyHint.hidden = !hasFleet || Boolean(ship);
  if (!ship) return;

  els.fleetDetailName.textContent = ship.name ?? "";
  els.fleetDetailHull.textContent = ship.hullName ?? "";
  renderFleetHold(ship);

  // The same segments the sea paints (S21), in the dock's order, with the dock's words.
  const condition = conditionOf(ship);
  els.fleetBars.textContent = "";
  for (const segment of ["hull", "rigging", "crew", "morale"]) {
    const value = Math.max(0, Math.min(100, Math.round(Number(condition[segment]) || 0)));
    const row = document.createElement("div");
    row.className = `fleet-bar-row is-${segment}`;
    const label = document.createElement("span");
    label.textContent = t(DOCK_SEGMENT_KEY[segment]);
    const track = document.createElement("div");
    track.className = "fleet-bar-track";
    const fill = document.createElement("div");
    fill.className = `fleet-bar-fill is-${segment}`;
    fill.style.width = `${value}%`;
    track.append(fill);
    const pct = document.createElement("span");
    pct.className = "fleet-bar-pct";
    pct.textContent = `${value}%`;
    row.append(label, track, pct);
    els.fleetBars.append(row);
  }

  // A wreck has one action (S117): float her again. She cannot be repaired at the
  // bottom, and a hull nobody can sail is not a hull a buyer wants. A visit does none of
  // it (S133-C): the hull is here, the captain is not.
  const visiting = visitingYard();
  if (isWreck(ship)) {
    const refloat = refloatCost(ship);
    els.fleetRepairBtn.disabled = visiting || state.gold < refloat;
    els.fleetRepairBtn.textContent = t("fleet.refloat", { gold: gold(priceWithPurse(refloat, state.gold)) });
    els.fleetRepairBtn.title = t("fleet.wreckHint");
    els.fleetSellBtn.disabled = true;
    els.fleetSellBtn.textContent = t("shipyard.sell", { gold: gold(0) });
    if (els.fleetRearmBtn) els.fleetRearmBtn.hidden = true;
    return;
  }

  // Repair and sell, priced and gated exactly as they were on the row.
  const cost = repairCost(ship);
  els.fleetRepairBtn.disabled = visiting || !(cost > 0);
  els.fleetRepairBtn.textContent = cost > 0
    ? t("fleet.repair", { gold: gold(priceWithPurse(cost, state.gold)) })
    : t("fleet.repairNone");
  els.fleetRepairBtn.title = cost > 0
    ? t("fleet.repairTitle", { name: ship.name, gold: gold(priceWithPurse(cost, state.gold)) })
    : t("fleet.repairSound", { name: ship.name });

  // S121: what the yard charges to put the rounds back. A hull in port has no live racks
  // to measure, so the button reads her loadout and offers nothing to top up until the
  // sea save says how much she actually spent.
  const liveCombat = readLiveCombat(ship.id);
  const rearm = rearmQuote(ship, liveCombat);
  if (els.fleetRearmBtn) {
    els.fleetRearmBtn.hidden = !rearm.rearmable;
    els.fleetRearmBtn.disabled = visiting || !rearm.rearmable || state.gold < rearm.cost;
    els.fleetRearmBtn.textContent = rearm.rearmable
      ? t("fleet.rearm", { gold: gold(priceWithPurse(rearm.cost, state.gold)), rounds: fmtInt.format(rearm.rounds) })
      : "";
    els.fleetRearmBtn.title = rearm.rearmable
      ? t("fleet.rearmTitle", { name: ship.name, rounds: fmtInt.format(rearm.rounds) })
      : "";
  }

  const canSell = canSellShip(fleet, ship.id) &&
    (ship.id !== fleet.captainId || local.ships.some((entry) => entry.id !== ship.id && !isWreck(entry)));
  els.fleetSellBtn.disabled = visiting || !canSell;
  els.fleetSellBtn.textContent = t("shipyard.sell", { gold: gold(salePrice(ship)) });
  els.fleetSellBtn.title = canSell
    ? t("shipyard.sellTitle", { name: ship.name, gold: gold(salePrice(ship)) })
    : t("shipyard.sellLast");
}

/**
 * What the selected hull is carrying (S124). The market loads her hold and the sea saves
 * it, but the fleet panel used to show her condition and nothing else: a player who bought
 * a cargo could not see it anywhere without sailing back to a yard.
 *
 * The manifest is the merchandise, and `cargoKg` is that plus whatever loose cargo the
 * builder loaded. The two are shown apart, because only the manifest can be sold and only
 * the loose part explains a hold that reads heavier than her manifest.
 */
function renderFleetHold(ship) {
  if (!els.fleetHold) return;
  const hold = shipHold(ship);
  const capacity = Math.max(0, Number(ship.capacityKg) || 0);
  // A hull with no hold at all (nothing aboard, no room recorded) says nothing: an empty
  // line on every hull would be noise, and this panel is a summary, not a manifest book.
  if (capacity === 0 && hold.cargoKg === 0) {
    els.fleetHold.hidden = true;
    els.fleetHold.textContent = "";
    return;
  }
  els.fleetHold.hidden = false;
  els.fleetHold.textContent = "";

  const full = capacity > 0 && hold.cargoKg >= capacity;
  const sum = document.createElement("div");
  sum.className = `fleet-hold-line is-sum${full ? " is-full" : ""}`;
  const used = document.createElement("span");
  used.className = "fleet-hold-used";
  used.textContent = hold.cargoKg > 0
    ? t("fleet.hold", { used: fmtInt.format(hold.cargoKg), capacity: fmtInt.format(capacity) })
    : t("fleet.holdEmpty");
  const tag = document.createElement("span");
  tag.textContent = full ? t("fleet.holdFull") : `${fmtInt.format(Math.max(0, capacity - hold.cargoKg))} kg`;
  sum.append(used, tag);
  els.fleetHold.append(sum);

  for (const entry of hold.manifest) {
    if (!entry.units) continue;
    const row = document.createElement("div");
    row.className = "fleet-hold-line";
    const name = document.createElement("span");
    name.textContent = t("fleet.holdRow", {
      units: fmtInt.format(entry.units),
      name: t(commodityNameKey(entry.commodityId)),
      kg: fmtInt.format(entry.kg),
    });
    row.append(name);
    els.fleetHold.append(row);
  }

  // Loose cargo is the builder's hand-typed weight: it is not merchandise and cannot be
  // sold, but it still weighs and it is why a hold can read heavier than her manifest.
  const loose = Math.max(0, hold.cargoKg - hold.manifest.reduce((total, entry) => total + entry.kg, 0));
  if (loose > 0) {
    const row = document.createElement("div");
    row.className = "fleet-hold-line";
    const name = document.createElement("span");
    name.textContent = `${t("fleet.holdGeneric")} · ${fmtInt.format(loose)} kg`;
    row.append(name);
    els.fleetHold.append(row);
  }
}

/** Select an owned ship and copy her bought configuration into the refit editor. */
function selectRefitShip(ship, { openRoom = true } = {}) {
  if (!localFleet().ships.some((entry) => entry.id === ship?.id)) return;
  const config = configFromShip(ship);
  refitId = ship.id;
  for (const key of ["hullId", "batteries", "crew", "days", "cargoKg", "ballastKg", "equipmentKg", "reserveKg"]) {
    state[key] = config[key];
  }
  state.shipName = config.name ?? "";
  els.shipName.value = state.shipName;
  // The refit editor is the Flota tab's business (S98, S105): the ship+rig panels move
  // into the fleet room, which now reads like the old build screen in refit mode.
  // The boot picks the captain only to fill the editor, so it must not choose the room
  // the player lands in (S109).
  if (openRoom) showScreen("flota");
}

els.fleetList.addEventListener("click", (event) => {
  const promote = event.target.closest("[data-captain]");
  if (promote) {
    if (!localFleet().ships.some((entry) => entry.id === promote.dataset.captain && !isWreck(entry))) return;
    const previousCaptainId = fleet.captainId;
    fleet = setCaptain(fleet, promote.dataset.captain);
    const previous = fleet.ships.find((entry) => entry.id === previousCaptainId);
    if (previous?.sails === false && previous.yardId === null) {
      fleet = withShipYard(fleet, previous.id, screenShipyard()?.id);
    }
    saveFleet();
    savePurse(null, false, { promoteFrom: previousCaptainId, promoteTo: fleet.captainId });
    renderFleet();
    return;
  }
  // Any click on a row selects that hull (S108): her bars and her actions live in the
  // panel below the list, so picking her is what fills it. The row's own button is the
  // refit editor's door as it always was.
  const select = event.target.closest("[data-refit]");
  const ship = localFleet().ships.find((entry) => entry.id === select?.dataset.refit);
  if (!ship) return;
  selectRefitShip(ship);
  renderFleet();
  render();
});

/* ---------------------------------------------------------------- fleet actions (S108) */

// Repairing is the player's decision, one hull at a time (S86): the sea no longer repairs
// on arrival, so this button is where a damaged hull is put right. It acts on the hull
// the fleet list has selected.
els.fleetRearmBtn?.addEventListener("click", () => {
  if (refuseVisit()) return;
  const target = localFleet().ships.find((entry) => entry.id === refitId);
  if (!target || isWreck(target)) return;
  const live = readLiveCombat(target.id);
  const result = rearmShip(target, live, state.gold);
  if (!result) {
    els.purchaseNotice.textContent = t("fleet.rearmNone");
    return;
  }
  fleet = { ...fleet, ships: fleet.ships.map((entry) => (entry.id === target.id ? result.ship : entry)) };
  state.gold = result.gold;
  saveFleet();
  // The rounds live in the sea save's racks, so the rearm is written there too (S121).
  writeRackedRounds(target.id, result.live);
  writeFortSave({}, { gold: state.gold });
  els.goldValue.textContent = gold(state.gold);
  els.purchaseNotice.textContent = t("fleet.rearmed", {
    name: target.name,
    rounds: fmtInt.format(result.quote.rounds),
    gold: gold(result.quote.cost),
  });
  renderFleet();
  render();
});

els.fleetRepairBtn.addEventListener("click", () => {
  if (refuseVisit()) return;
  const target = localFleet().ships.find((entry) => entry.id === refitId);
  if (!target) return;
  // A wreck is floated, not repaired (S117): the yard charges a full repair for her and
  // hands back the same ship, whole again, with no cargo — that went down with her.
  if (isWreck(target)) {
    const price = refloatCost(target);
    if (state.gold < price) {
      els.purchaseNotice.textContent = t("fleet.refloatShort", {
        name: target.name,
        gold: gold(price - state.gold),
      });
      return;
    }
    const floated = floatsAgain(target);
    fleet = { ...fleet, ships: fleet.ships.map((entry) => (entry.id === target.id ? floated : entry)) };
    state.gold -= price;
    saveFleet();
    writeFortSave({}, { gold: state.gold });
    els.goldValue.textContent = gold(state.gold);
    els.purchaseNotice.textContent = t("fleet.refloated", { name: floated.name, gold: gold(price) });
    renderFleet();
    render();
    return;
  }
  const captain = captainShip(fleet);
  const result = repairFleetShip(fleet, target.id, state.gold, { allowCaptain: true });
  if (!result.repaired) return;
  fleet = result.fleet;
  state.gold = result.gold;
  saveFleet();
  const repaired = fleet.ships.find((ship) => ship.id === target.id) ?? null;
  savePurse(repaired, target.id === captain?.id);
  els.goldValue.textContent = gold(state.gold);
  lastNoticeKey = "fleet.repaired";
  lastAddedName = repaired?.name ?? null;
  els.purchaseNotice.textContent = t("fleet.repaired", {
    name: repaired?.name ?? "",
    gold: gold(result.spent ?? 0),
  });
  dockSignature = null;
  renderFleet();
  render();
});

// Selling pays a share of the hull's value and takes her out of the fleet (S62). The last
// hull is refused by the model, and the button is already disabled in that case.
els.fleetSellBtn.addEventListener("click", () => {
  if (refuseVisit()) return;
  const local = localFleet();
  const target = local.ships.find((entry) => entry.id === refitId);
  if (!target) return;
  const successor = local.ships.find((entry) => entry.id !== target.id && !isWreck(entry));
  if (target.id === fleet.captainId && !successor) return;
  const result = sellShip(fleet, target.id, state.gold);
  if (!result) return;
  fleet = target.id === fleet.captainId ? setCaptain(result.fleet, successor.id) : result.fleet;
  state.gold = result.gold;
  // A hull being refitted cannot be sold under the player's feet.
  if (refitId && !fleet.ships.some((entry) => entry.id === refitId)) refitId = null;
  saveFleet();
  savePurse();
  els.goldValue.textContent = gold(state.gold);
  lastNoticeKey = null;
  els.purchaseNotice.textContent = t("shipyard.sold", { name: result.ship.name, gold: gold(result.price) });
  renderFleet();
  render();
});

els.newShipBtn.addEventListener("click", () => {
  refitId = null;
  renderFleet();
  render();
});

/* ---------------------------------------------------------------- the yard's room (S100) */

// Repairing the fort charges her quote against the purse and writes both back to the
// sea save, her only record.
els.fortRepairBtn.addEventListener("click", () => {
  if (refuseVisit()) return;
  const record = readFortSave();
  const fort = record?.fort && typeof record.fort === "object" ? { ...record.fort } : null;
  if (!fort) return;
  const result = fortRepair(fort, state.gold);
  if (!result.applied) return;
  state.gold = result.gold;
  savePurse();
  writeFortSave({ condition: { ...result.fort.condition } });
  els.goldValue.textContent = gold(state.gold);
  lastNoticeKey = "shipyard.fort.repaired";
  lastAddedName = null;
  els.purchaseNotice.textContent = t(lastNoticeKey, { gold: gold(result.cost) });
  renderFort();
});

// One purchase arms both sides (S100): the count rides with the fort save, and the sea
// rebuilds her battery from it on the next boot.
els.fortGunBtn.addEventListener("click", () => {
  if (refuseVisit()) return;
  const record = readFortSave();
  const fort = record?.fort && typeof record.fort === "object" ? { ...record.fort } : {};
  const result = buyFortGun(fort, state.gold);
  if (!result.applied) return;
  state.gold = result.gold;
  savePurse();
  writeFortSave({ boughtGuns: result.fort.boughtGuns });
  els.goldValue.textContent = gold(state.gold);
  lastNoticeKey = "shipyard.fort.gunBought";
  lastAddedName = null;
  els.purchaseNotice.textContent = t(lastNoticeKey, { gold: gold(result.cost) });
  renderFort();
});

/**
 * Mark a hull to sail with the captain (S35). The choice lives on the fleet entry, so
 * it is saved with the fleet: a new ship is born marked, and a save written before the
 * checks existed sails with everything, which is what it used to do.
 */
els.fleetList.addEventListener("change", (event) => {
  const check = event.target.closest("[data-sail]");
  if (!check) return;
  const shipId = check.dataset.sail;
  if (!localFleet().ships.some((entry) => entry.id === shipId && !isWreck(entry))) return;
  const captain = captainShip(fleet);
  if (shipId === captain?.id) {
    // The captain cannot stay ashore: she is the ship the player sails.
    check.checked = true;
    return;
  }
  fleet = withShipSailing(fleet, shipId, check.checked);
  if (!check.checked) fleet = withShipYard(fleet, shipId, screenShipyard()?.id);
  saveFleet();
  renderFleet();
});

/* ---------------------------------------------------------------- dock dialog (S25) */

/**
 * The shipyard asks the same question as the port (S25), with the shop's purse. The
 * captain is repaired through her fleet entry here because nobody sails in the
 * shipyard, and the sea save is patched too: `barcos:game:v1` keeps the condition
 * and crew of the last voyage, and the sea prefers it on boot (see `boot()`), so
 * leaving it behind would undo the repair the next time the player puts to sea.
 */
const DOCK_SEGMENT_KEY = {
  hull: "shipyard.dock.hull",
  rigging: "shipyard.dock.rigging",
  crew: "shipyard.dock.crew",
  morale: "shipyard.dock.morale",
};

function damageSummary(damaged) {
  if (damaged.length === 0) return t("shipyard.dock.sound");
  return damaged.map((segment) => t(DOCK_SEGMENT_KEY[segment])).join(", ");
}

/**
 * The purse the shipyard shows and the sea save that carries it, kept in step. A hull
 * repaired here is patched in the sea save too (S23): the sea prefers that save to the
 * fleet sheet on boot, so the captain's part and each escort's part both have to move,
 * or the repair is undone the next time the player puts to sea.
 */
function savePurse(patchedShip = null, isCaptain = false, { refit = false, promoteFrom = null, promoteTo = null } = {}) {
  let game = null;
  try {
    game = JSON.parse(localStorage.getItem(GAME_KEY) ?? "null");
  } catch {
    game = null;
  }
  const record = game && typeof game === "object" ? game : {};
  const combat = record.combat;
  const patch = patchedShip ? { condition: { ...patchedShip.condition }, crew: { ...patchedShip.crewAlive } } : null;
  let patchedCombat = combat;
  if (combat && promoteFrom && promoteTo && promoteFrom !== promoteTo) {
    // `player` belongs to the old captain, not to whichever hull is captain now.
    // Move both saved combatants before a refit or sea boot can read them by role.
    const { player, ...rest } = combat;
    const { [promoteTo]: nextPlayer, ...escorts } = combat.escorts ?? {};
    if (player) escorts[promoteFrom] = player;
    patchedCombat = { ...rest, escorts, ...(nextPlayer ? { player: nextPlayer } : {}) };
  } else if (patch && isCaptain && combat?.player) {
    const player = refit ? { ...combat.player, crew: patch.crew } : { ...combat.player, ...patch };
    if (refit) delete player.pieces;
    patchedCombat = { ...combat, player };
  } else if (patch && !isCaptain && combat?.escorts?.[patchedShip.id]) {
    const escort = combat.escorts[patchedShip.id];
    patchedCombat = {
      ...combat,
      escorts: { ...combat.escorts, [patchedShip.id]: { ...escort, ...(refit ? { crew: patch.crew } : patch) } },
    };
  }
  try {
    localStorage.setItem(
      GAME_KEY,
      JSON.stringify({ ...record, gold: state.gold, ...(patchedCombat ? { combat: patchedCombat } : {}) }),
    );
  } catch {
    /* the purse still lives in memory for this session */
  }
}

/** A refit picked from the fleet opens the builder inside the Flota tab (S98). */
document.addEventListener("click", (event) => {
  const select = event.target.closest("[data-refit]");
  if (!select || !event.target.closest("#fleet-list")) return;
  moveBuilder("flota");
  showScreen("flota");
});

let dockSignature = null;

/** One row per damaged hull, rebuilt only when what it shows changes. */
function renderDockList() {
  const container = els.dockList;
  if (!container) return;
  const ships = damagedShips(localFleet());
  const signature = ships
    .map((ship) => {
      const report = repairReport(ship);
      return [ship.id, ship.name, report.hull, report.rigging, report.crew, report.morale, report.crewAlive, report.cost].join(":");
    })
    .join("|") + `:${state.gold}`;
  if (signature === dockSignature) return;
  dockSignature = signature;
  container.textContent = "";

  for (const ship of ships) {
    const report = repairReport(ship);
    const row = document.createElement("div");
    row.className = "dock-ship";
    row.dataset.shipId = ship.id;

    const head = document.createElement("div");
    head.className = "dock-ship-head";
    const name = document.createElement("span");
    name.className = "dock-ship-name";
    name.textContent = ship.name ?? ship.hullId ?? ship.id;
    const hull = document.createElement("span");
    hull.className = "dock-ship-hull";
    hull.textContent = t("shipyard.dock.hullPct", { hull: gold(report.hull) });
    head.append(name, hull);

    const detail = document.createElement("div");
    detail.className = "dock-ship-detail";
    const rigging = document.createElement("span");
    rigging.textContent = t("shipyard.dock.riggingPct", { rigging: gold(report.rigging) });
    const crew = document.createElement("span");
    crew.textContent = t("shipyard.dock.crewMen", {
      alive: gold(report.crewAlive),
      bought: gold(report.crewBought),
      crew: gold(report.crew),
    });
    detail.append(rigging, crew);

    const needs = document.createElement("p");
    needs.className = "dock-ship-needs";
    needs.textContent = t("shipyard.dock.needs", { segments: damageSummary(report.damaged) });
    if (state.gold > 0 && state.gold < report.cost) {
      needs.textContent += ` · ${t("shipyard.dock.partial", {
        gold: gold(state.gold), percent: (100 * state.gold / report.cost).toFixed(1),
      })}`;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "dock-ship-button";
    button.dataset.shipId = ship.id;
    button.textContent = t("shipyard.dock.button", { gold: gold(priceWithPurse(report.cost, state.gold)) });
    button.disabled = state.gold <= 0 && report.cost > 0;
    button.classList.toggle("is-short", button.disabled);
    button.addEventListener("click", () => repairFromDock(ship.id));

    row.append(head, detail, needs, button);
    container.append(row);
  }
}

/** The missing gold for the cheapest damaged hull, or zero when the purse covers all. */
function dockShortfall() {
  const costs = damagedShips(localFleet()).map((ship) => repairCost(ship));
  if (costs.length === 0) return 0;
  return Math.max(0, Math.min(...costs) - state.gold);
}

function updateDockNote() {
  if (!els.dockNote) return;
  const missing = dockShortfall();
  els.dockNote.textContent = missing > 0 ? t("shipyard.dock.missing", { gold: gold(missing) }) : "";
  els.dockNote.classList.toggle("is-hidden", missing === 0);
}

function closeDockDialog() {
  if (!els.dockDialog) return;
  if (els.dockDialog.open) els.dockDialog.close();
  els.dockDialog.classList.add("is-hidden");
}

/** Ask on opening the screen when the fleet has something to repair (S25). */
function openDockDialog() {
  if (!els.dockDialog) return;
  if (damagedShips(localFleet()).length === 0) return;
  dockSignature = null;
  renderDockList();
  updateDockNote();
  els.dockDialog.classList.remove("is-hidden");
  // Opened non-modally on purpose: it asks, it does not trap. The port panel and
  // the S24 buttons behind it must keep taking clicks (S25: they coexist).
  if (typeof els.dockDialog.show === "function" && !els.dockDialog.open) {
    els.dockDialog.show();
  }
}

/**
 * Repair one hull with the shop's purse. Every hull, the captain included, goes
 * through the fleet entry (S23); the captain's saved combat is patched as well, so
 * the sea does not undo the repair on boot.
 */
function repairFromDock(shipId) {
  if (!localFleet().ships.some((ship) => ship.id === shipId)) return;
  const captain = captainShip(fleet);
  const result = repairFleetShip(fleet, shipId, state.gold, { allowCaptain: true });
  if (!result.repaired) {
    updateDockNote();
    renderDockList();
    return;
  }

  fleet = result.fleet;
  state.gold = result.gold;
  saveFleet();
  const repaired = fleet.ships.find((ship) => ship.id === shipId) ?? null;
  savePurse(repaired, shipId === captain?.id);

  els.goldValue.textContent = gold(state.gold);
  renderFleet();
  renderDockList();
  updateDockNote();
  if (damagedShips(localFleet()).length === 0) closeDockDialog();
}

if (els.dockLater) els.dockLater.addEventListener("click", closeDockDialog);

/* ---------------------------------------------------------------- erase save (S8) */

els.eraseBtn.addEventListener("click", () => els.eraseDialog.showModal());
els.eraseCancel.addEventListener("click", () => els.eraseDialog.close());
els.eraseConfirm.addEventListener("click", () => {
  try {
    for (const key of [STORAGE_KEY, GAME_KEY, SHIP_KEY, FLEET_KEY, COUNTRY_KEY]) {
      localStorage.removeItem(key);
    }
  } catch {
    /* storage disabled: nothing to erase */
  }
  window.location.reload();
});

window.addEventListener("resize", () => {
  if (lastShip) drawShip(lastShip);
});


/* ---------------------------------------------------------------- language (S13) */

/** Repaint everything after a language change, without reloading the page. */
function repaintForLanguage() {
  applyStaticTranslations();
  if (lastAddedName !== null) {
    els.purchaseNotice.textContent = t(lastNoticeKey, { name: lastAddedName });
  } else {
    renderArrivalNotice();
  }
  renderCountry();
  renderHulls();
  renderPieceSelect();
  // The title bar speaks the new language too (S133-F).
  renderYardSelector();
  renderYardTravel();
  renderMarket();
  renderFleet();
  render();
  if (els.dockDialog && !els.dockDialog.classList.contains("is-hidden")) {
    dockSignature = null;
    renderDockList();
    updateDockNote();
  }
  if (lastShip) {
    els.launchBtn.disabled = !lastShip.feasible;
  }
}

if (els.langSelect) {
  els.langSelect.value = translator.language;
  els.langSelect.addEventListener("change", (event) => {
    applyLanguage(translator, localStorage, event.target.value);
    // Every room speaks when the language changes (S13, S101): the settings tab keeps
    // her own DOM, so she paints herself too.
    repaintSettingsForLanguage();
    repaintForLanguage();
  });
}

/* ---------------------------------------------------------------- boot */

// The tuning settings are applied before the shipyard prices anything (S33), and the
// stored catalogue before the shipyard lists a single hull (S83).
bootSettings();
bindGameTime(GAME_TIME);
markets = normaliseMarkets(readFortSave()?.markets);
bootCatalogue();
// A new game opens with the configured purse (S77). The state above was built before the
// settings were applied, so it is set again here; `loadGold` then replaces it with the
// saved purse, which is what a game in progress must keep.
state.gold = normaliseGold(START.gold);
// The hull pictures' credits are fetched once; the pictures themselves load lazily.
await loadCredits();
applyStaticTranslations();
if (els.langSelect) els.langSelect.value = translator.language;
loadConfig();
loadGold();
reconcileSavedCaptain();
const captain = captainShip(fleet);
// The boot fills the editor with the captain but leaves the room to the entry rule
// below (S109): landing on the fleet was the boot's side effect, not a decision.
//
// It also does not enter refit mode (S129). Doing so left `refitId` pointing at the
// captain while the entry screen is Comprar, and that screen disables every hull card
// and turns the button into "Save refit": the player could not choose a hull at all and
// the click silently refitted the captain, which reads as "it always buys the same ship".
if (captain) selectRefitShip(captain, { openRoom: false });
refitId = null;
renderFleet();
renderCountry();
renderHulls();
renderPieceSelect();
if (state.shipName) els.shipName.value = state.shipName;
render();
// The yard opens on the fleet (S97); the builder waits in the Comprar slot until a refit
// or the buy tab asks for it.
// Old settings links land on their room too: config.html now redirects with the hash.
const entryScreen = "comprar";
const targetScreen = SCREENS.includes(window.location.hash.slice(1)) ? window.location.hash.slice(1) : entryScreen;
showScreen(targetScreen);
try {
  arrivalNotice = parseArrivalNotice(localStorage.getItem(ARRIVAL_NOTICE_KEY));
  localStorage.removeItem(ARRIVAL_NOTICE_KEY);
} catch {
  /* storage disabled: the shipyard still opens */
}
renderArrivalNotice();
// Repairing is the player's decision (S86): the shipyard no longer opens the repair
// dialog on its own. The button on each fleet entry is the way in, and the dialog stays
// reachable from there for the fleet-wide view.
