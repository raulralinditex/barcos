/**
 * Astillero UI. Spanish labels (S10), English identifiers (S10).
 *
 * The canvas is not decoration: it draws one gun port per piece, split by side, so
 * the player sees the consequence of a battery on the hull instead of reading a number.
 */

import {
  AMMO,
  CREW_ROLES,
  HULLS,
  PIECES,
  STARTING_GOLD,
  ammoById,
  hullById,
  pieceById,
} from "../data/naval-data.js";
import { minimumShipPrice, priceShip } from "../model/economy.js";
import {
  addShip,
  captainShip,
  deserializeFleet,
  isEmptyFleet,
  serializeFleet,
  setCaptain,
} from "../model/fleet.js";
import { buildShip, toRuntimeShip } from "../model/shipyard.js";

const STORAGE_KEY = "barcos:config:v1";
const GAME_KEY = "barcos:game:v1";
const SHIP_KEY = "barcos:current-ship:v1";
const FLEET_KEY = "barcos:fleet:v1";

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
  gold: STARTING_GOLD,
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
  { key: "light", label: "Casco vacío", color: "#8c9aa8" },
  { key: "crew", label: "Dotación", color: "#3d6fa8" },
  { key: "arms", label: "Armas y munición", color: "#a13c2c" },
  { key: "provisions", label: "Provisiones", color: "#2f6b47" },
  { key: "equipment", label: "Equipo", color: "#6b5b95" },
  { key: "ballast", label: "Lastre", color: "#7a6a52" },
  { key: "cargo", label: "Mercancía", color: "#b8860b" },
  { key: "reserve", label: "Reserva (no pesa)", color: "#c9bda4" },
];

const $ = (selector) => document.querySelector(selector);

const els = {
  goldValue: $("#gold-value"),
  goldDelta: $("#gold-delta"),
  hullList: $("#hull-list"),
  shipName: $("#ship-name"),
  canvas: $("#ship-canvas"),
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
  priceBlock: $(".price"),
  launchBtn: $("#launch-btn"),
  sailDialog: $("#sail-dialog"),
  sailTitle: $("#sail-title"),
  sailBody: $("#sail-body"),
  sailBack: $("#sail-back"),
  sailGo: $("#sail-go"),
  fleetList: $("#fleet-list"),
  fleetCount: $("#fleet-count"),
  eraseBtn: $("#erase-btn"),
  eraseDialog: $("#erase-dialog"),
  eraseCancel: $("#erase-cancel"),
  eraseConfirm: $("#erase-confirm"),
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
  } catch {
    /* storage disabled: the game still works for this session */
  }
}

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.hullId && hullById(saved.hullId)) state.hullId = saved.hullId;
    if (Array.isArray(saved.batteries)) state.batteries = saved.batteries;
    if (saved.crew && typeof saved.crew === "object") state.crew = saved.crew;
    for (const key of ["days", "cargoKg", "ballastKg", "equipmentKg", "reserveKg"]) {
      if (Number.isFinite(saved[key])) state[key] = saved[key];
    }
    if (typeof saved.shipName === "string") state.shipName = saved.shipName;
  } catch {
    /* a corrupted save must never block the shipyard */
  }
}

/** The purse is shared with the sea screen: treasure earned out there buys here. */
function loadGold() {
  try {
    const game = JSON.parse(localStorage.getItem(GAME_KEY));
    if (game && Number.isFinite(game.gold)) state.gold = game.gold;
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

function renderHulls() {
  els.hullList.innerHTML = "";
  for (const hull of HULLS) {
    const min = minimumShipPrice(hull.id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = `hull-card${hull.id === state.hullId ? " is-active" : ""}`;
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", String(hull.id === state.hullId));
    card.dataset.hullId = hull.id;
    card.innerHTML = `
      <span class="hull-card-name">${hull.name}</span>
      <span class="hull-card-meta">${hull.country} · arqueo ${hull.arqueo[0]}-${hull.arqueo[1]}</span>
      <span class="hull-card-price">desde ${gold(min)} doblones</span>
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
  for (const piece of PIECES) {
    const option = document.createElement("option");
    option.value = piece.id;
    option.textContent = `${piece.name} · ${fmtOne.format(piece.shotKg)} kg · ${piece.rangeM} m`;
    els.pieceSelect.appendChild(option);
  }
  if (current && pieceById(current)) els.pieceSelect.value = current;
}

function renderBatteries() {
  els.batteryList.innerHTML = "";

  if (state.batteries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Sin artillería. Un barco sin piezas no puede luchar: solo huir.";
    els.batteryList.appendChild(empty);
    return;
  }

  state.batteries.forEach((entry, index) => {
    const piece = pieceById(entry.pieceId);
    if (!piece) return;

    const card = document.createElement("div");
    card.className = "battery";
    card.innerHTML = `
      <div class="battery-top">
        <div>
          <div class="battery-name">${piece.name}</div>
          <div class="battery-family">${piece.family} · ${fmtOne.format(piece.shotKg)} kg de proyectil · ${piece.reloadS} s de recarga</div>
        </div>
        <button class="battery-remove" type="button" aria-label="Quitar ${piece.name}">×</button>
      </div>
      <div class="battery-fields">
        <label><span>Costado</span>
          <select data-field="side">
            <option value="babor"${entry.side === "babor" ? " selected" : ""}>Babor</option>
            <option value="estribor"${entry.side === "estribor" ? " selected" : ""}>Estribor</option>
          </select>
        </label>
        <label><span>Cantidad</span>
          <input type="number" min="0" max="40" step="1" value="${entry.qty}" data-field="qty" />
        </label>
        <label><span>Disparos/pieza</span>
          <input type="number" min="0" max="200" step="5" value="${entry.shotsPerPiece}" data-field="shotsPerPiece" />
        </label>
        <label><span>Munición</span>
          <select data-field="ammoId">
            ${piece.ammo
              .map(
                (ammoId) =>
                  `<option value="${ammoId}"${entry.ammoId === ammoId ? " selected" : ""}>${ammoById(ammoId).name}</option>`,
              )
              .join("")}
          </select>
        </label>
      </div>
      <div class="battery-meta">
        <span>${piece.provenance === "R6" ? "Dato R6" : piece.provenance} · alcance ${piece.rangeM} m</span>
        <span>${fmtInt.format(entry.qty * entry.shotsPerPiece)} disparos</span>
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
    row.innerHTML = `
      <div>
        <h4>${role.name}</h4>
        <p>${role.description}</p>
        <p>${gold(role.hireGold)} doblones al contratar · ${fmtOne.format(role.wageGoldPerDay)} al día</p>
      </div>
      <label>
        <span>Cantidad</span>
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
      label: "Días de provisión",
      value: state.days,
      step: 5,
      max: 180,
      note: `${fmtOne.format(4.5)} kg por persona y día, con un 12 % de pérdidas.`,
    },
    {
      key: "cargoKg",
      label: "Mercancía",
      value: state.cargoKg,
      step: 1000,
      max: Math.max(0, Math.floor(Math.max(cargoMax, 0))),
      note: `Hueco real del casco: ${kg(Math.max(cargoMax, 0))}.`,
    },
    {
      key: "ballastKg",
      label: "Lastre",
      value: state.ballastKg,
      step: 1000,
      max: 200_000,
      note: "Sin lastre un casco vacío no aguanta el velamen.",
    },
    {
      key: "equipmentKg",
      label: "Equipo y recipientes",
      value: state.equipmentKg,
      step: 500,
      max: 100_000,
      note: "Barriles, cables, cureñas de repuesto, herramientas.",
    },
    {
      key: "reserveKg",
      label: "Reserva de capacidad",
      value: state.reserveKg,
      step: 500,
      max: 100_000,
      note: "Ocupa presupuesto de carga, pero no es masa embarcada.",
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
    part.title = `${segment.label}: ${kg(value)}`;
    els.massBar.appendChild(part);
  }

  if (overBy > 0) {
    const over = document.createElement("div");
    over.className = "mass-seg is-over";
    over.style.width = `${(Math.min(overBy, capacity * 0.25) / denominator) * 100}%`;
    over.style.background = "#7d2b1f";
    over.title = `Exceso: ${kg(overBy)}`;
    els.massBar.appendChild(over);
  }

  els.massReadout.textContent = `${kg(ship.budget.realMassKg)} de ${kg(hull.displacementKg)} de desplazamiento`;
  els.massReadout.classList.toggle("bad", overBy > 0);

  els.massLegend.innerHTML = MASS_SEGMENTS.filter((segment) => values[segment.key] > 0)
    .map(
      (segment) =>
        `<span><i class="mass-swatch" style="background:${segment.color}"></i>${segment.label} <b>${kg(values[segment.key])}</b></span>`,
    )
    .join("");
}

function renderStats(ship) {
  const { budget, hull } = ship;
  els.statDraft.textContent = `${fmtTwo.format(budget.draftM)} m`;
  els.statDraft.classList.toggle("bad", budget.draftM > hull.draftRefM + 0.9);
  els.statSpeed.textContent = `${fmtTwo.format(budget.speedKn)} nudos`;
  els.statLoad.textContent = `${fmtOne.format(budget.loadFraction * 100)} %`;
  els.statCargoRoom.textContent = kg(Math.max(budget.cargoMaxKg, 0));
  els.statCargoRoom.classList.toggle("bad", budget.cargoMaxKg < 0);
  els.statPeople.textContent = `${fmtInt.format(budget.people)} personas`;
  els.statUpkeep.textContent = `${fmtOne.format(ship.upkeep)} al día`;
}

function renderGuns(ship) {
  els.gunsBabor.textContent = String(ship.guns.sides.babor);
  els.gunsEstribor.textContent = String(ship.guns.sides.estribor);
  els.gunsTotal.textContent = String(ship.guns.total);
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
          message: "El barco es viable y está pagado. Podés botarlo.",
        },
      ];

  els.verdictIssues.innerHTML = "";
  for (const issue of issues) {
    const row = document.createElement("div");
    row.className = `issue issue-${issue.level}`;
    const mark = issue.level === "error" ? "!" : issue.level === "warn" ? "▲" : "✓";
    row.innerHTML = `<span class="issue-mark">${mark}</span><span>${issue.message}</span>`;
    els.verdictIssues.appendChild(row);
  }
}

function renderPrice(ship) {
  els.priceTotal.textContent = gold(ship.price.total);
  els.priceBlock.classList.toggle("over", ship.price.total > state.gold);

  const diff = state.gold - ship.price.total;
  if (diff >= 0) {
    els.goldDelta.textContent = `restan ${gold(diff)}`;
    els.goldDelta.className = "purse-delta pos";
  } else {
    els.goldDelta.textContent = `faltan ${gold(-diff)}`;
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

  // side labels
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = "rgba(23,54,93,0.75)";
  ctx.textAlign = "left";
  ctx.fillText(`BABOR ${sides.babor}`, 10, cssHeight - 22);
  ctx.textAlign = "right";
  ctx.fillText(`ESTRIBOR ${sides.estribor}`, cssWidth - 10, 18);

  // draft marker
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(16,22,31,0.6)";
  ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`${fmtTwo.format(ship.budget.draftM)} m de calado`, 10, 18);
}

/* ---------------------------------------------------------------- render */

let lastShip = null;

function render() {
  const ship = buildShip(currentConfig(), state.gold);
  if (!ship) return;
  lastShip = ship;

  renderGuns(ship);
  renderMassBar(ship);
  renderStats(ship);
  renderVerdict(ship);
  renderPrice(ship);
  renderBatteries();
  renderCrew();
  renderSupply(ship);
  drawShip(ship);

  els.goldValue.textContent = gold(state.gold);
  els.launchBtn.disabled = !ship.feasible;

  for (const card of els.hullList.children) {
    const isActive = card.querySelector(".hull-card-name")?.textContent === ship.hull.name;
    card.classList.toggle("is-active", isActive);
    card.setAttribute("aria-selected", String(isActive));
  }

  saveConfig();
}

/* ---------------------------------------------------------------- launch */

function launch() {
  const ship = lastShip;
  if (!ship || !ship.feasible) return;

  const name = state.shipName.trim() || defaultShipName(ship.hull);
  const runtime = toRuntimeShip(ship, { name });

  // The launching is the purchase: charge the purse and add the hull to the fleet,
  // where it becomes the captain. A new hull sails a new sea.
  state.gold -= ship.price.total;

  fleet = addShip(fleet, runtime);

  try {
    localStorage.setItem(FLEET_KEY, serializeFleet(fleet));
    localStorage.setItem(GAME_KEY, JSON.stringify({ gold: state.gold }));
    // the fleet is the source of truth now; drop the single-ship key
    localStorage.removeItem(SHIP_KEY);
  } catch {
    /* the ship still exists in memory for this session */
  }

  renderFleet();
  renderPrice(ship);
  els.goldValue.textContent = gold(state.gold);

  els.sailTitle.textContent = `${name} — ${ship.hull.name}`;
  els.sailBody.innerHTML = `
    <dl class="sail-stats">
      <div><dt>Casco</dt><dd>${ship.hull.name}</dd></div>
      <div><dt>País</dt><dd>${ship.hull.country}</dd></div>
      <div><dt>Eslora</dt><dd>${fmtOne.format(ship.hull.lengthM)} m</dd></div>
      <div><dt>Desplazamiento</dt><dd>${kg(ship.hull.displacementKg)}</dd></div>
      <div><dt>Masa embarcada</dt><dd>${kg(ship.budget.realMassKg)}</dd></div>
      <div><dt>Calado</dt><dd>${fmtTwo.format(ship.budget.draftM)} m</dd></div>
      <div><dt>Velocidad</dt><dd>${fmtTwo.format(ship.budget.speedKn)} nudos</dd></div>
      <div><dt>Dotación</dt><dd>${fmtInt.format(ship.budget.people)} personas</dd></div>
      <div><dt>Artillería</dt><dd>${ship.guns.total} piezas (${ship.guns.sides.babor}/${ship.guns.sides.estribor})</dd></div>
      <div><dt>Provisiones</dt><dd>${state.days} días</dd></div>
      <div><dt>Mercancía</dt><dd>${kg(state.cargoKg)}</dd></div>
      <div><dt>Coste</dt><dd>${gold(ship.price.total)} doblones</dd></div>
      <div><dt>Mantenimiento</dt><dd>${fmtOne.format(ship.upkeep)} al día</dd></div>
      <div><dt>Resto de la bolsa</dt><dd>${gold(state.gold)} doblones</dd></div>
    </dl>
    <p>${
      ship.warnings.length
        ? `Zarpa con ${ship.warnings.length} advertencia(s): ${ship.warnings.map((w) => w.code).join(", ")}.`
        : "Sin advertencias. La nave está en condiciones."
    }</p>
  `;
  els.sailDialog.showModal();
}

function defaultShipName(hull) {
  const names = {
    patache: "Avispa",
    "carabela-latina": "Niña",
    jacht: "Duyfken",
    zabra: "Augusta",
    "galeon-pequeno": "Golden Hind",
    fluyt: "Ruyter",
    "nao-armada": "Rosario",
    "galeon-guerra": "Revenge",
    "gran-mercante": "Batavia",
    galeaza: "Galeaza",
    "gran-galeon": "San Martín",
    "gran-buque-real": "Triumph",
  };
  return names[hull.id] ?? "Sin nombre";
}

/* ---------------------------------------------------------------- events */

els.addBattery.addEventListener("click", () => {
  const pieceId = els.pieceSelect.value;
  const piece = pieceById(pieceId);
  if (!piece) return;
  const side = state.batteries.filter((b) => b.side === "babor").length
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

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.panel === tab.dataset.tab);
    });
  });
});

els.launchBtn.addEventListener("click", launch);
els.sailBack.addEventListener("click", () => els.sailDialog.close());
els.sailGo.addEventListener("click", () => {
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
  els.fleetCount.textContent =
    isEmptyFleet(fleet)
      ? "sin naves"
      : `${fleet.ships.length} ${fleet.ships.length === 1 ? "nave" : "naves"}`;

  if (isEmptyFleet(fleet)) {
    els.fleetList.innerHTML =
      '<li class="fleet-empty">Todavía no tenés naves. Construí la primera y botala.</li>';
    return;
  }

  els.fleetList.innerHTML = fleet.ships
    .map((ship) => {
      const isCaptain = ship.id === captain?.id;
      return `
        <li class="fleet-item${isCaptain ? " is-captain" : ""}" data-ship-id="${ship.id}">
          <button class="fleet-ship" type="button" data-captain="${ship.id}"
            ${isCaptain ? "disabled" : ""}
            title="${isCaptain ? "Capitana de la flota" : "Capitanea esta nave"}">
            <span class="fleet-mark">${isCaptain ? "⚓" : "·"}</span>
            <span class="fleet-name">${ship.name}</span>
            <span class="fleet-hull">${ship.hullName}</span>
          </button>
          ${isCaptain ? '<span class="fleet-tag">capitana</span>' : ""}
        </li>`;
    })
    .join("");
}

els.fleetList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-captain]");
  if (!button) return;
  fleet = setCaptain(fleet, button.dataset.captain);
  saveFleet();
  renderFleet();
});

/* ---------------------------------------------------------------- erase save (S8) */

els.eraseBtn.addEventListener("click", () => els.eraseDialog.showModal());
els.eraseCancel.addEventListener("click", () => els.eraseDialog.close());
els.eraseConfirm.addEventListener("click", () => {
  try {
    for (const key of [STORAGE_KEY, GAME_KEY, SHIP_KEY, FLEET_KEY]) {
      localStorage.removeItem(key);
    }
  } catch {
    /* storage disabled: nothing to erase */
  }
  window.location.reload();
});

/** If a ship is already in the water (another session), offer sailing it directly. */
function offerExistingShip() {
  const captain = captainShip(fleet);
  if (!captain || !captain.name) return;
  const link = document.createElement("a");
  link.className = "btn";
  link.href = "./sea.html";
  link.textContent = `⚓ Zarpar con ${captain.name}`;
  els.launchBtn.parentElement.appendChild(link);
}

window.addEventListener("resize", () => {
  if (lastShip) drawShip(lastShip);
});

/* ---------------------------------------------------------------- boot */

loadConfig();
loadGold();
renderFleet();
renderHulls();
renderPieceSelect();
if (state.shipName) els.shipName.value = state.shipName;
render();
offerExistingShip();
