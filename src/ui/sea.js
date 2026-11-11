/**
 * Sea screen: real-time sailing over the zone world.
 *
 * All rules live in ../model/world.js; this file only renders the world, reads the
 * keyboard and autosaves. Spanish labels (S10), English identifiers (S10).
 */

import { hullById, pieceById } from "../data/naval-data.js";
import { createAppTranslator } from "../i18n/index.js";
import { localisedHull, localisedZone } from "../i18n/terms.js";
import { compassPoint, windAt, windForecast } from "../model/wind.js";
import {
  COMBAT,
  aiStep,
  applyDamage,
  bearingTo,
  createEnemyCombatant,
  createPlayerCombatant,
  damageDealt,
  fireBroadside,
  loadedShare,
  maneuverFactor,
  readyDamage,
  sideForBearing,
  speedFactor,
  tickCombatant,
  wreckPrize,
} from "../model/combat.js";
import {
  captainShip,
  deserializeFleet,
  removeShip,
  serializeFleet,
  withShipCondition,
} from "../model/fleet.js";
import { needsRepair, repairCost, repairShip } from "../model/repair.js";
import {
  WORLD,
  ZONE_BANDS,
  createWorld,
  deserializeWorld,
  nearestEncounter,
  serializeWorld,
  updateWorld,
  zoneAtRadius,
} from "../model/world.js";

const SHIP_KEY = "barcos:current-ship:v1";
const FLEET_KEY = "barcos:fleet:v1";
const GAME_KEY = "barcos:game:v1";

const PX_PER_M = 0.4; // camera scale: 1 px on screen = 2.5 m of sea
const MINIMAP_RADIUS = 85;

const ZONE_PAINT = {
  costera: { deep: "#2e6f8e", shallow: "#3d87a8", ring: "rgba(255,255,255,0.16)" },
  abierto: { deep: "#1b4a70", shallow: "#245d86", ring: "rgba(255,255,255,0.12)" },
  abismo: { deep: "#131f36", shallow: "#1c2a4a", ring: "rgba(200,180,255,0.10)" },
};

const $ = (selector) => document.querySelector(selector);

const els = {
  canvas: $("#sea-canvas"),
  minimap: $("#minimap"),
  windCanvas: $("#wind-canvas"),
  windNow: $("#wind-now"),
  name: $("#hud-ship-name"),
  gold: $("#hud-gold"),
  zone: $("#hud-zone"),
  throttle: $("#hud-throttle"),
  speed: $("#hud-speed"),
  heading: $("#hud-heading"),
  hull: $("#hud-hull"),
  rigging: $("#hud-rigging"),
  crew: $("#hud-crew"),
  rounds: $("#hud-rounds"),
  banner: $("#banner"),
  targetPanel: $("#target-panel"),
  targetName: $("#target-name"),
  targetDistance: $("#target-distance"),
  targetHull: $("#target-hull"),
  targetRigging: $("#target-rigging"),
  targetCrew: $("#target-crew"),
  portPanel: $("#port-panel"),
  portCost: $("#port-cost"),
  gameoverOverlay: $("#gameover-overlay"),
  gameoverTitle: $("#gameover-title"),
  gameoverGold: $("#gameover-gold"),
  gameoverBack: $("#gameover-back"),
};

const fmtInt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const fmtOne = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

/* ---------------------------------------------------------------- i18n (S11-S13) */

/** The sea has no selector: it inherits the language chosen in the shipyard (S13). */
const translator = createAppTranslator(
  typeof localStorage === "undefined" ? null : localStorage,
  typeof navigator === "undefined" ? undefined : navigator.language,
);
const t = translator.t;

/** Translate the static sea markup (HUD labels, help line) once on boot. */
function applyStaticTranslations() {
  document.documentElement.lang = translator.language;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-html]")) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }
}

/* ---------------------------------------------------------------- boot state */

function loadFleet() {
  try {
    // The single-ship key is the save written before fleets existed: adopt it.
    const legacy = JSON.parse(localStorage.getItem(SHIP_KEY) ?? "null");
    const legacyShip = legacy && Number.isFinite(legacy.speedKn) ? legacy : null;
    const fleet = deserializeFleet(localStorage.getItem(FLEET_KEY), legacyShip);
    return { fleet, legacyShip };
  } catch {
    return { fleet: { ships: [], captainId: null }, legacyShip: null };
  }
}

function loadSavedGame() {
  try {
    const game = JSON.parse(localStorage.getItem(GAME_KEY));
    if (game && Number.isFinite(game.gold)) return game;
  } catch {
    /* fall through */
  }
  return null;
}

const loaded = loadFleet();
// `fleet` is reassigned whenever the condition of a hull changes (S22, S23).
let fleet = loaded.fleet;
const { legacyShip } = loaded;
const runtimeShip = captainShip(fleet);

const ui = {
  throttle: 0,
  rudder: 0,
  keys: new Set(),
  trail: [],
  bannerUntil: 0,
  lastEnemyWarning: 0,
};

let world = null;
let gold = 0;
let goldEarned = 0;
let playerCombat = null;
let gameOver = false;
let gameOverAt = 0;
let gameOverShown = false;
const fx = [];

/* ---------------------------------------------------------------- persistence */

function saveGame() {
  if (!world) return;
  try {
    world = { ...world, gold: goldEarned };
    const payload = {
      gold,
      world: serializeWorld(world),
      combat: playerCombat
        ? {
            player: {
              condition: playerCombat.condition,
              crew: playerCombat.crew,
              pieces: playerCombat.pieces.map((p) => ({
                shotsLeft: p.shotsLeft,
                reloadTimer: p.reloadTimer,
              })),
            },
          }
        : undefined,
    };
    localStorage.setItem(GAME_KEY, JSON.stringify(payload));
    // The damage also lives on the hull itself, so it survives the way back to the
    // shipyard and a change of captain (S23).
    if (playerCombat && runtimeShip) {
      fleet = withShipCondition(fleet, runtimeShip.id, {
        condition: playerCombat.condition,
        crewAlive: playerCombat.crew,
      });
    }
    localStorage.setItem(FLEET_KEY, serializeFleet(fleet));
  } catch {
    /* storage disabled: the voyage continues in memory */
  }
}

/* ---------------------------------------------------------------- input */

const THROTTLE_STEP = 0.25;

/** The home port: the island at the origin, same radius the sea draws (S22). */
const PORT_RADIUS_M = 110;

function inHomePort() {
  return world ? Math.hypot(world.ship.x, world.ship.y) <= PORT_RADIUS_M : false;
}

/**
 * Repair the captain's hull at the home port (S22). The condition lives on the
 * fleet entry, so the fix has to be written back there and not only in memory.
 */
function repairAtPort() {
  if (!world || gameOver || !playerCombat) return;
  if (!inHomePort()) {
    showBanner(t("sea.banner.repairAway"), "info", 2000);
    return;
  }

  const result = repairShip(runtimeShip, gold);
  if (!result.repaired) {
    showBanner(
      result.reason === "no-damage"
        ? t("sea.port.repairNoDamage", { name: runtimeShip.name })
        : t("sea.port.repairShort", { gold: fmtInt.format(result.missing ?? 0) }),
      result.reason === "no-damage" ? "info" : "danger",
      2600,
    );
    return;
  }

  gold = result.gold;
  // The repaired sheet is the new truth: keep the same hull in the fleet, with
  // its condition and its full complement written into its own entry (S23).
  Object.assign(runtimeShip, result.ship);
  playerCombat.condition = { ...result.ship.condition };
  playerCombat.crew = { ...result.ship.crewAlive };
  playerCombat.crewDamagePool = 0;
  fleet = withShipCondition(fleet, runtimeShip.id, {
    condition: result.ship.condition,
    crewAlive: result.ship.crewAlive,
  });

  saveGame();
  showBanner(
    t("sea.port.repairDone", {
      name: runtimeShip.name,
      gold: fmtInt.format(result.spent),
    }),
    "gold",
    3200,
  );
  updateHud();
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
  }
  if (key === "arrowup" || key === "w") {
    ui.throttle = Math.min(1, ui.throttle + THROTTLE_STEP);
  } else if (key === "arrowdown" || key === "s") {
    ui.throttle = Math.max(0, ui.throttle - THROTTLE_STEP);
  } else if (key === "q" || key === "e") {
    event.preventDefault();
    firePlayerBroadside(key === "q" ? "babor" : "estribor");
  } else if (key === "r") {
    event.preventDefault();
    repairAtPort();
  }
  ui.keys.add(key);
});

window.addEventListener("keyup", (event) => {
  ui.keys.delete(event.key.toLowerCase());
});

function readInput() {
  const left = ui.keys.has("arrowleft") || ui.keys.has("a");
  const right = ui.keys.has("arrowright") || ui.keys.has("d");
  // A shredded rig or a skeleton crew must be felt at the helm, not just in the HUD.
  const sailFactor = playerCombat ? speedFactor(playerCombat) : 1;
  const helmFactor = playerCombat ? maneuverFactor(playerCombat) : 1;
  return {
    turn: ((right ? 1 : 0) - (left ? 1 : 0)) * helmFactor,
    throttle: ui.throttle * sailFactor,
  };
}

/* ---------------------------------------------------------------- banner */

function showBanner(text, kind = "info", ms = 2200) {
  els.banner.textContent = text;
  els.banner.className = `sea-banner is-visible banner-${kind}`;
  ui.bannerUntil = performance.now() + ms;
}

function hideBannerIfDue(now) {
  if (ui.bannerUntil && now > ui.bannerUntil) {
    els.banner.classList.remove("is-visible");
    ui.bannerUntil = 0;
  }
}

/* ---------------------------------------------------------------- drawing */

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  els.canvas.width = Math.round(window.innerWidth * dpr);
  els.canvas.height = Math.round(window.innerHeight * dpr);
  els.canvas.style.width = `${window.innerWidth}px`;
  els.canvas.style.height = `${window.innerHeight}px`;
  const ctx = els.canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}



function drawSea(ctx) {
  const zone = zoneAtRadius(Math.hypot(world.ship.x, world.ship.y));
  const paint = ZONE_PAINT[zone.id] ?? ZONE_PAINT.costera;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, height * 0.1,
    width / 2, height / 2, height * 0.85,
  );
  gradient.addColorStop(0, paint.shallow);
  gradient.addColorStop(1, paint.deep);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(PX_PER_M, PX_PER_M);
  ctx.translate(-world.ship.x, -world.ship.y);

  // zone boundary rings and the edge of the known world
  for (const band of ZONE_BANDS) {
    ctx.beginPath();
    ctx.arc(0, 0, band.maxRadiusM, 0, Math.PI * 2);
    ctx.strokeStyle = paint.ring;
    ctx.lineWidth = 14;
    ctx.setLineDash([90, 60]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.arc(0, 0, WORLD.radiusM, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(190,80,60,0.4)";
  ctx.lineWidth = 22;
  ctx.stroke();

  // home port at the origin
  ctx.beginPath();
  ctx.arc(0, 0, 110, 0, Math.PI * 2);
  ctx.fillStyle = "#8a7a55";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 70, 0, Math.PI * 2);
  ctx.fillStyle = "#a9955f";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 90px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("⚓", 0, 32);

  drawEncounters(ctx);
  drawWake(ctx);
  drawPlayerShip(ctx);
  drawFx(ctx);

  ctx.restore();

  // The floating bars are drawn in screen space, so a bar stays readable at any
  // camera scale instead of shrinking with the hull it belongs to (S21).
  drawShipBars(ctx);
}

/* ---------------------------------------------------------------- floating bars (S21) */

const BAR = {
  /** Condition block, above the hull. */
  width: 108,
  /** Per-beam blocks, one on each side of the hull. */
  sideWidth: 54,
  /** Screen px of clear water kept between a hull's centre and the nearest block edge. */
  hullClear: 26,
  height: 6,
  gap: 3,
  padding: 5,
  hull: "#a13c2c",
  rigging: "#3d6fa8",
  crew: "#2f6b47",
  ready: "#e0a815",
  dealt: "rgba(224,168,21,0.28)",
  reload: "#9fc7e8",
  track: "rgba(10,18,28,0.62)",
  frame: "rgba(244,239,228,0.22)",
};

/** World metres to screen pixels, without the camera translation. */
function toScreen(x, y) {
  return {
    x: window.innerWidth / 2 + (x - world.ship.x) * PX_PER_M,
    y: window.innerHeight / 2 + (y - world.ship.y) * PX_PER_M,
  };
}

/** True when the enemy is close enough to be fought, which is what "a tiro" means (S21). */
function inGunshot(encounter) {
  return Math.hypot(encounter.x - world.ship.x, encounter.y - world.ship.y) <= COMBAT.engageRadiusM;
}

function drawBar(ctx, x, y, share, color, { backdrop = null, width = BAR.width } = {}) {
  ctx.fillStyle = BAR.track;
  ctx.fillRect(x, y, width, BAR.height);
  if (backdrop !== null && backdrop > 0) {
    // the part of the bar already earned, behind the part that is ready now
    ctx.fillStyle = BAR.dealt;
    ctx.fillRect(x, y, width * Math.min(1, backdrop), BAR.height);
  }
  if (share > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, width * Math.min(1, share), BAR.height);
  }
  ctx.strokeStyle = BAR.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, BAR.height - 1);
}

/** Size in screen px of a block with `rowCount` rows and bars `width` wide. */
function blockSize(rowCount, width) {
  return {
    w: width + BAR.padding * 2,
    h: rowCount * (BAR.height + BAR.gap) + BAR.padding * 2 - BAR.gap,
  };
}

/**
 * Where to centre a block so it sits on `angle` from the hull and just clears her:
 * the shortest distance along that direction at which the rectangle no longer
 * reaches `BAR.hullClear` px from the hull's centre, whatever the heading.
 */
function blockCentre(x, y, angle, size) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const alongX = Math.abs(dx) > 1e-6 ? (size.w / 2 + BAR.hullClear) / Math.abs(dx) : Infinity;
  const alongY = Math.abs(dy) > 1e-6 ? (size.h / 2 + BAR.hullClear) / Math.abs(dy) : Infinity;
  const reach = Math.min(alongX, alongY);
  return { x: x + dx * reach, y: y + dy * reach };
}

/** Frame and rows of one block, drawn at a rectangle whose centre is given. */
function drawBlock(ctx, rows, centreX, centreY, width) {
  const blockWidth = width + BAR.padding * 2;
  const blockHeight = rows.length * (BAR.height + BAR.gap) + BAR.padding * 2 - BAR.gap;
  const left = centreX - blockWidth / 2;
  const top = centreY - blockHeight / 2;

  ctx.fillStyle = "rgba(8,14,22,0.55)";
  ctx.fillRect(left, top, blockWidth, blockHeight);
  ctx.strokeStyle = BAR.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, blockWidth - 1, blockHeight - 1);

  let cursor = top + BAR.padding;
  for (const row of rows) {
    drawBar(ctx, left + BAR.padding, cursor, row.share, row.color, {
      backdrop: row.backdrop ?? null,
      width,
    });
    cursor += BAR.height + BAR.gap;
  }
}

/**
 * The bars of one hull (S21): the condition astern along her keel, and each beam's
 * damage and reload on its own side of her, so port and starboard are read where
 * they are instead of as one stack. Every block turns with the hull, because a
 * beam is a place on the ship, not a place on the screen. Condition sits on the
 * keel and the beams on the perpendicular, so the three never overlap.
 */
function drawBarsFor(ctx, combatant, x, y, distanceM, heading) {
  if (!combatant) return;

  const conditionRows = [
    { share: combatant.condition.hull / 100, color: BAR.hull },
    { share: combatant.condition.rigging / 100, color: BAR.rigging },
    { share: combatant.condition.crew / 100, color: BAR.crew },
  ];
  const stern = blockCentre(x, y, heading + Math.PI, blockSize(conditionRows.length, BAR.width));
  drawBlock(ctx, conditionRows, stern.x, stern.y, BAR.width);

  // Both beams are scaled against the same pair of maxima, so the two sides stay
  // comparable: the longer bar is the beam that hits harder, the fuller one the
  // beam that is readier.
  const dealt = Math.max(damageDealt(combatant, "babor"), damageDealt(combatant, "estribor"), 1);
  const ready = Math.max(
    readyDamage(combatant, "babor", distanceM),
    readyDamage(combatant, "estribor", distanceM),
    1,
  );

  for (const side of ["babor", "estribor"]) {
    // Starboard bears at heading + 90°, port at heading - 90°, the same convention
    // sideForBearing uses.
    const sign = side === "estribor" ? 1 : -1;
    const angle = heading + sign * (Math.PI / 2);
    const rows = [
      {
        share: readyDamage(combatant, side, distanceM) / ready,
        backdrop: damageDealt(combatant, side) / dealt,
        color: BAR.ready,
      },
      { share: loadedShare(combatant, side), color: BAR.reload },
    ];
    const at = blockCentre(x, y, angle, blockSize(rows.length, BAR.sideWidth));
    drawBlock(ctx, rows, at.x, at.y, BAR.sideWidth);
  }
}

/** Bars over the player's hull always, and over an enemy only once it is a target. */
function drawShipBars(ctx) {
  if (!world) return;

  const player = toScreen(world.ship.x, world.ship.y);
  drawBarsFor(ctx, playerCombat, player.x, player.y, 0, world.ship.heading ?? 0);

  for (const encounter of world.encounters) {
    if (encounter.type !== "enemy" || !encounter.combat) continue;
    if (encounter.combat.status !== "fighting") continue;
    if (!inGunshot(encounter)) continue;
    const at = toScreen(encounter.x, encounter.y);
    const distance = Math.hypot(encounter.x - world.ship.x, encounter.y - world.ship.y);
    drawBarsFor(ctx, encounter.combat, at.x, at.y, distance, encounter.heading ?? 0);
  }
}

function drawEncounters(ctx) {
  const now = performance.now();
  for (const encounter of world.encounters) {
    if (encounter.type === "treasure") {
      const pulse = 14 + Math.sin(now / 350 + encounter.id) * 5;
      ctx.beginPath();
      ctx.arc(encounter.x, encounter.y, 26, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(224,168,21,0.28)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(encounter.x, encounter.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = "#e0a815";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(encounter.x - 3, encounter.y - 4, pulse * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "#fff3c4";
      ctx.fill();
    } else if (encounter.type === "wreck") {
      drawWreck(ctx, encounter);
    } else {
      drawEnemySail(ctx, encounter);
    }
  }
}

/** A defeated enemy: a broken hull with its gold still aboard. */
function drawWreck(ctx, encounter) {
  const now = performance.now();
  const pulse = 20 + Math.sin(now / 300 + encounter.id) * 4;
  ctx.save();
  ctx.translate(encounter.x, encounter.y);
  ctx.rotate((encounter.heading ?? 0) + 0.6);
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(2, -14);
  ctx.lineTo(-26, -4);
  ctx.lineTo(-18, 12);
  ctx.closePath();
  ctx.fillStyle = "#2b2118";
  ctx.fill();
  ctx.strokeStyle = "rgba(120,90,60,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(encounter.x, encounter.y, pulse, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(224,168,21,0.22)";
  ctx.fill();
}

function drawEnemySail(ctx, encounter) {
  ctx.save();
  ctx.translate(encounter.x, encounter.y);
  ctx.rotate(encounter.heading ?? encounter.drift.heading);

  ctx.beginPath();
  ctx.moveTo(46, 0);
  ctx.lineTo(-34, -20);
  ctx.lineTo(-46, 0);
  ctx.lineTo(-34, 20);
  ctx.closePath();
  ctx.fillStyle = "#20242c";
  ctx.fill();
  ctx.strokeStyle = "rgba(161,60,44,0.9)";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(0, 26);
  ctx.strokeStyle = "#3a4048";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.restore();
}

function drawWake(ctx) {
  const trail = ui.trail;
  if (trail.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(trail[0].x, trail[0].y);
  for (const point of trail.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 26;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawPlayerShip(ctx) {
  const ship = world.ship;
  const hull = hullById(runtimeShip.hullId);
  const lengthRatio = hull ? Math.min(1.5, Math.max(0.7, hull.lengthM / 25)) : 1;
  const len = 70 * lengthRatio;
  const beam = 26 * lengthRatio;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.heading);

  ctx.beginPath();
  ctx.moveTo(len * 0.5, 0);
  ctx.lineTo(len * 0.1, -beam * 0.5);
  ctx.lineTo(-len * 0.5, -beam * 0.42);
  ctx.quadraticCurveTo(-len * 0.56, 0, -len * 0.5, beam * 0.42);
  ctx.lineTo(len * 0.1, beam * 0.5);
  ctx.closePath();
  ctx.fillStyle = "#3c5a7a";
  ctx.fill();
  ctx.strokeStyle = "#101c2a";
  ctx.lineWidth = 3;
  ctx.stroke();

  // masts
  ctx.strokeStyle = "#d9d2c2";
  ctx.lineWidth = 4;
  for (const t of [-0.2, 0.05, 0.22]) {
    ctx.beginPath();
    ctx.moveTo(len * t, -beam * 0.34);
    ctx.lineTo(len * t, beam * 0.34);
    ctx.stroke();
  }

  // rudder indicator
  if (readInput().turn !== 0) {
    ctx.strokeStyle = "rgba(224,168,21,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, 0);
    ctx.lineTo(-len * 0.62, readInput().turn * beam * 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMinimap() {
  const ctx = els.minimap.getContext("2d");
  const size = els.minimap.width;
  const center = size / 2;
  const scale = (MINIMAP_RADIUS - 6) / WORLD.radiusM;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(center, center, MINIMAP_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(16,28,42,0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(201,189,164,0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, MINIMAP_RADIUS - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(center, center);
  ctx.scale(scale, scale);

  for (const band of ZONE_BANDS) {
    ctx.beginPath();
    ctx.arc(0, 0, band.maxRadiusM, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 60;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 120, 0, Math.PI * 2);
  ctx.fillStyle = "#a9955f";
  ctx.fill();

  for (const encounter of world.encounters) {
    ctx.beginPath();
    ctx.arc(encounter.x, encounter.y, 90, 0, Math.PI * 2);
    ctx.fillStyle =
      encounter.type === "enemy" ? "#d0503c" : "#e0a815";
    ctx.fill();
  }

  // player arrow
  ctx.save();
  ctx.translate(world.ship.x, world.ship.y);
  ctx.rotate(world.ship.heading);
  ctx.beginPath();
  ctx.moveTo(220, 0);
  ctx.lineTo(-140, -120);
  ctx.lineTo(-140, 140);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/* ---------------------------------------------------------------- combat */

const rnd = () => Math.random();

function currentZone() {
  return zoneAtRadius(Math.hypot(world.ship.x, world.ship.y));
}

/** Lazily build an enemy's combat entity; keeps its own heading separate from drift. */
function ensureEnemyCombat(encounter) {
  if (!encounter.combat) {
    encounter.combat = createEnemyCombatant(encounter, currentZone(), world.seed);
    encounter.heading = encounter.heading ?? encounter.drift?.heading ?? 0;
    encounter.currentSpeedKn = 0;
    // from now on the combat AI owns this hull's movement, not the drift step
    encounter.engaged = true;
  }
  return encounter.combat;
}

function pushFx(type, x, y, x2, y2, ttl) {
  fx.push({ type, x, y, x2, y2, ttl, ttl0: ttl });
}

function playerMaxRangeM() {
  return Math.max(0, ...playerCombat.pieces.map((p) => pieceById(p.pieceId).rangeM));
}

/** Fire one side's guns at the nearest enemy that side bears on. */
function firePlayerBroadside(side) {
  if (!playerCombat || gameOver || playerCombat.status !== "fighting") return;

  const maxRange = playerMaxRangeM();
  let target = null;
  let targetDistance = Infinity;
  for (const encounter of world.encounters) {
    if (encounter.type !== "enemy") continue;
    if (encounter.combat && encounter.combat.status !== "fighting") continue;
    const distance = Math.hypot(encounter.x - world.ship.x, encounter.y - world.ship.y);
    if (distance > maxRange || distance >= targetDistance) continue;
    if (sideForBearing(world.ship.heading, bearingTo(world.ship, encounter)) !== side) continue;
    target = encounter;
    targetDistance = distance;
  }

  if (!target) {
    showBanner(t("sea.banner.noTarget", { side: t(`sea.sides.${side}`) }), "info", 1500);
    return;
  }

  const targetCombat = ensureEnemyCombat(target);
  if (!targetCombat) return;
  const { volley } = fireBroadside(playerCombat, side, targetDistance, rnd);
  if (volley.length === 0) {
    showBanner(t("sea.banner.reloading", { side: t(`sea.sides.${side}`) }), "info", 1200);
    return;
  }

  for (const shot of volley) {
    pushFx("tracer", world.ship.x, world.ship.y, target.x, target.y, 0.3);
    if (shot.hit) {
      applyDamage(targetCombat, shot.damage);
      pushFx("hit", target.x, target.y, target.x, target.y, 0.5);
    } else {
      pushFx("splash", target.x + (rnd() - 0.5) * 70, target.y + (rnd() - 0.5) * 70, 0, 0, 0.6);
    }
  }
}

/** Enemies inside the engage radius think, move and shoot. */
function processCombat(dt, now) {
  if (!playerCombat || gameOver) return;
  tickCombatant(playerCombat, dt);

  for (const encounter of world.encounters) {
    if (encounter.type !== "enemy") continue;
    const distance = Math.hypot(encounter.x - world.ship.x, encounter.y - world.ship.y);
    if (distance > COMBAT.engageRadiusM && !encounter.combat) continue;
    const combat = ensureEnemyCombat(encounter);
    if (!combat || combat.status !== "fighting") continue;

    tickCombatant(combat, dt);
    const result = aiStep(encounter, world.ship, dt, rnd);
    encounter.x = result.enemy.x;
    encounter.y = result.enemy.y;
    encounter.heading = result.enemy.heading;
    encounter.currentSpeedKn = result.enemy.currentSpeedKn;

    for (const shot of result.volley) {
      pushFx("tracer", encounter.x, encounter.y, world.ship.x, world.ship.y, 0.3);
      if (shot.hit) {
        applyDamage(playerCombat, shot.damage);
        pushFx("hit", world.ship.x, world.ship.y, world.ship.x, world.ship.y, 0.5);
      } else {
        pushFx("splash", world.ship.x + (rnd() - 0.5) * 70, world.ship.y + (rnd() - 0.5) * 70, 0, 0, 0.6);
      }
    }
  }

  resolveDefeatedEnemies();

  if (playerCombat.status !== "fighting" && !gameOver) {
    gameOver = true;
    gameOverAt = now;
    ui.throttle = 0;
  }
}

/** A sunk or surrendered enemy becomes a wreck whose gold the world model pays out. */
function resolveDefeatedEnemies() {
  const zone = currentZone();
  world.encounters = world.encounters.map((encounter) => {
    if (encounter.type !== "enemy" || !encounter.combat) return encounter;
    const status = encounter.combat.status;
    if (status !== "sunk" && status !== "surrendered") return encounter;
    showBanner(
      status === "sunk" ? t("sea.banner.sunk") : t("sea.banner.surrendered"),
      "gold",
      3500,
    );
    return {
      id: encounter.id,
      type: "wreck",
      x: encounter.x,
      y: encounter.y,
      heading: encounter.heading ?? 0,
      gold: wreckPrize(encounter, zone),
      zoneId: zone.id,
    };
  });
}

function showGameOver() {
  if (gameOverShown) return;
  gameOverShown = true;
  const sunk = playerCombat.status === "sunk";
  els.gameoverTitle.textContent = t(sunk ? "sea.gameOver.sunk" : "sea.gameOver.surrendered", {
    name: runtimeShip.name,
  });
  els.gameoverGold.textContent = t("sea.gameOver.purse", { gold: fmtInt.format(gold) });
  els.gameoverOverlay.classList.remove("is-hidden");
}

els.gameoverBack.addEventListener("click", () => {
  try {
    // The sunk hull leaves the fleet; the player keeps whatever else is in port.
    const remaining = removeShip(fleet, runtimeShip.id);
    localStorage.setItem(FLEET_KEY, serializeFleet(remaining));
    localStorage.removeItem(SHIP_KEY);
    localStorage.removeItem(GAME_KEY);
  } catch {
    /* nothing to remove */
  }
  window.location.href = "./index.html";
});

function drawFx(ctx) {
  for (const event of fx) {
    const life = Math.max(0, event.ttl / event.ttl0);
    if (event.type === "tracer") {
      ctx.strokeStyle = `rgba(224,168,21,${life})`;
      ctx.lineWidth = 2 / PX_PER_M;
      ctx.beginPath();
      ctx.moveTo(event.x, event.y);
      ctx.lineTo(event.x2, event.y2);
      ctx.stroke();
    } else if (event.type === "splash") {
      ctx.strokeStyle = `rgba(255,255,255,${life})`;
      ctx.lineWidth = 3 / PX_PER_M;
      ctx.beginPath();
      ctx.arc(event.x, event.y, 10 + (1 - life) * 50, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const radius = 12 + (1 - life) * 46;
      ctx.fillStyle = `rgba(224,96,32,${life * 0.85})`;
      ctx.beginPath();
      ctx.arc(event.x, event.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,220,120,${life})`;
      ctx.beginPath();
      ctx.arc(event.x, event.y, radius * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function tickFx(dt) {
  for (const event of fx) event.ttl -= dt;
  for (let i = fx.length - 1; i >= 0; i -= 1) {
    if (fx[i].ttl <= 0) fx.splice(i, 1);
  }
}

function updateTargetPanel() {
  let best = null;
  let bestDistance = Infinity;
  for (const encounter of world.encounters) {
    if (encounter.type !== "enemy" || !encounter.combat) continue;
    if (encounter.combat.status !== "fighting") continue;
    const distance = Math.hypot(encounter.x - world.ship.x, encounter.y - world.ship.y);
    if (distance > COMBAT.engageRadiusM || distance >= bestDistance) continue;
    best = encounter;
    bestDistance = distance;
  }

  if (!best) {
    els.targetPanel.classList.add("is-hidden");
    return;
  }
  els.targetPanel.classList.remove("is-hidden");
  els.targetName.textContent =
    localisedHull(best.hullId, t)?.name ?? t("sea.target.hostileSail");
  els.targetDistance.textContent = `${fmtInt.format(bestDistance)} m`;
  els.targetHull.style.width = `${best.combat.condition.hull}%`;
  els.targetRigging.style.width = `${best.combat.condition.rigging}%`;
  els.targetCrew.style.width = `${best.combat.condition.crew}%`;
}


/** The repair offer only exists while the hull is inside the home port (S22). */
function updatePortPanel() {
  if (!els.portPanel) return;
  const docked = inHomePort() && !gameOver && playerCombat;
  els.portPanel.classList.toggle("is-hidden", !docked);
  if (!docked) return;
  const cost = repairCost(runtimeShip);
  els.portCost.textContent =
    cost === 0
      ? t("sea.port.repairNoDamage", { name: runtimeShip.name })
      : t("sea.port.repairCost", { gold: fmtInt.format(cost) });
  els.portCost.classList.toggle("is-short", cost > 0 && gold < cost);
}

/* ---------------------------------------------------------------- wind rose (S18) */

/**
 * Draw the compass rose with two arrows: the wind now, and the wind 10 s ahead.
 * The arrow points where the wind blows towards; its length is the strength.
 */
function drawWindRose(now) {
  const canvas = els.windCanvas;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 12;

  ctx.clearRect(0, 0, size, size);

  // dial
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(16,28,42,0.5)";
  ctx.fill();
  ctx.strokeStyle = "rgba(201,189,164,0.45)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ticks every 45 degrees, longer on the axes
  for (let i = 0; i < 8; i += 1) {
    const angle = (i * Math.PI) / 4;
    const inner = i % 2 === 0 ? radius - 10 : radius - 6;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * (radius - 2), cy + Math.sin(angle) * (radius - 2));
    ctx.strokeStyle = "rgba(201,189,164,0.5)";
    ctx.lineWidth = i % 2 === 0 ? 2 : 1;
    ctx.stroke();
  }

  const timeS = world?.timeS ?? 0;
  const seed = world?.seed ?? 0;
  const current = windAt(seed, timeS);
  const forecast = windForecast(seed, timeS);

  // The forecast is drawn with an open ring at its tip, so it reads as "later"
  // even when it sits right on top of the current wind.
  drawWindArrow(ctx, cx, cy, current, radius, "#e0a815", 1);
  drawWindArrow(ctx, cx, cy, forecast, radius, "#9fc7e8", 0.82, true);

  // the hull, so the player can read the wind against their own heading
  if (world?.ship) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(world.ship.heading ?? 0);
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, -6);
    ctx.lineTo(-7, 6);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fill();
    ctx.restore();
  }

  // numeric readout
  if (els.windNow) {
    const compass = t(`sea.wind.compass.${compassPoint(current.direction)}`);
    els.windNow.textContent = t("sea.wind.summary", {
      compass,
      knots: fmtOne.format(current.strengthKn),
    });
  }
}

/** One arrow: direction is where it blows towards, length follows strength. */
function drawWindArrow(ctx, cx, cy, wind, radius, color, scale, ring = false) {
  const length = (radius - 22) * (0.35 + 0.65 * wind.strength) * scale;
  const angle = wind.direction;
  const tipX = cx + Math.cos(angle) * length;
  const tipY = cy + Math.sin(angle) * length;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = ring ? 2.5 : 3;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();

  if (ring) {
    // The forecast ends in an open ring instead of a solid head.
    ctx.beginPath();
    ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const head = 9;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(angle - 0.45) * head, tipY - Math.sin(angle - 0.45) * head);
    ctx.lineTo(tipX - Math.cos(angle + 0.45) * head, tipY - Math.sin(angle + 0.45) * head);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/* ---------------------------------------------------------------- HUD */

function updateHud() {
  const zone = zoneAtRadius(Math.hypot(world.ship.x, world.ship.y));
  els.name.textContent = `${runtimeShip.name} — ${runtimeShip.hullName}`;
  els.gold.textContent = fmtInt.format(gold);
  els.zone.textContent = localisedZone(zone, t).name;
  els.zone.style.color = zone.id === "abismo" ? "#c9a9ff" : zone.id === "abierto" ? "#9fc7e8" : "#bfe3c9";
  els.throttle.textContent = `${fmtInt.format(ui.throttle * 100)} %`;
  els.speed.textContent = `${fmtOne.format(world.ship.currentSpeedKn)} kn`;
  const degrees = ((world.ship.heading * 180) / Math.PI + 360) % 360;
  els.heading.textContent = `${String(Math.round(degrees)).padStart(3, "0")}°`;

  if (!playerCombat) return;
  const { condition } = playerCombat;
  els.hull.textContent = `${fmtInt.format(condition.hull)} %`;
  els.rigging.textContent = `${fmtInt.format(condition.rigging)} %`;
  els.crew.textContent = `${fmtInt.format(condition.crew)} %`;
  const swivelRounds = roundsLeft("swivel");
  els.rounds.textContent =
    `${fmtInt.format(roundsLeft("babor"))}/${fmtInt.format(roundsLeft("estribor"))}` +
    (swivelRounds > 0 ? ` · ${t("sea.roundsSwivel", { count: fmtInt.format(swivelRounds) })}` : "");
}

/** Men actually aboard, across the combat roles. */
function totalAboard(crew) {
  return ["marino", "artillero", "soldado", "remero"].reduce(
    (sum, role) => sum + (Number(crew?.[role]) || 0),
    0,
  );
}

/** Rounds still in the racks of one side. */
function roundsLeft(side) {
  if (!playerCombat) return 0;
  return playerCombat.pieces.reduce(
    (sum, piece) => (piece.side === side ? sum + piece.shotsLeft : sum),
    0,
  );
}

/* ---------------------------------------------------------------- main loop */

let lastTime = performance.now();

function frame(now) {
  if (!world) return;
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const before = goldEarned;
  world = updateWorld(world, gameOver ? {} : readInput(), dt);
  goldEarned = world.gold;
  if (goldEarned > before) {
    gold += goldEarned - before;
    showBanner(t("sea.banner.treasure", { gold: fmtInt.format(goldEarned - before) }), "gold");
  }

  processCombat(dt, now);
  tickFx(dt);

  // wake trail, thinned to keep it cheap
  if (world.ship.currentSpeedKn > 0.3) {
    const last = ui.trail[ui.trail.length - 1];
    const moved =
      !last || Math.hypot(world.ship.x - last.x, world.ship.y - last.y) > 30;
    if (moved) {
      ui.trail.push({ x: world.ship.x, y: world.ship.y });
      if (ui.trail.length > 40) ui.trail.shift();
    }
  } else if (ui.trail.length) {
    ui.trail.shift();
  }

  // enemy proximity warning, at most every 6 s
  const nearest = nearestEncounter(world, "enemy");
  if (nearest && nearest.distance < COMBAT.engageRadiusM && now - ui.lastEnemyWarning > 6000) {
    ui.lastEnemyWarning = now;
    showBanner(
      t("sea.banner.enemyNear", { distance: fmtInt.format(Math.round(nearest.distance)) }),
      "danger",
      3000,
    );
  }

  if (gameOver && !gameOverShown && now - gameOverAt > 1400) showGameOver();

  const ctx = els.canvas.getContext("2d");
  drawSea(ctx);
  drawMinimap();
  drawWindRose(now);
  updateHud();
  updateTargetPanel();
  updatePortPanel();
  hideBannerIfDue(now);

  requestAnimationFrame(frame);
}

function boot() {
  const savedGame = loadSavedGame();
  const savedWorld = savedGame?.world ? deserializeWorld(savedGame.world) : null;

  const worldSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  world =
    savedWorld && Math.abs(savedWorld.ship.speedKn - runtimeShip.speedKn) < 1
      ? savedWorld
      : createWorld(worldSeed, { speedKn: runtimeShip.speedKn }, 0);

  gold = savedGame?.gold ?? 0;
  goldEarned = world.gold;

  // Restore the guns from the autosave, or rig the ship out of the shipyard sheet.
  playerCombat = createPlayerCombatant(runtimeShip);
  const savedCombat = savedGame?.combat?.player;
  if (savedCombat && Array.isArray(savedCombat.pieces)) {
    // The sea save is the fresher of the two, because the fleet sheet is written
    // every three seconds and the sea save right after combat (S23).
    playerCombat.condition = { ...playerCombat.condition, ...savedCombat.condition };
    playerCombat.crew = { ...playerCombat.crew, ...savedCombat.crew };
    playerCombat.pieces = playerCombat.pieces.map((piece, index) => {
      const saved = savedCombat.pieces[index];
      return saved
        ? { ...piece, shotsLeft: saved.shotsLeft ?? piece.shotsLeft, reloadTimer: saved.reloadTimer ?? 0 }
        : piece;
    });
  }
  // Recompute the crew share from the men actually aboard, whatever source won.
  playerCombat.condition.crew = Math.min(
    100,
    Math.round((100 * totalAboard(playerCombat.crew)) / playerCombat.initialCrew),
  );
  if (playerCombat.condition.hull <= 0 || playerCombat.condition.crew <= COMBAT.surrenderCrewPct) {
    // The saved voyage ended in a sinking: show the same verdict instead of sailing on.
    playerCombat.status = playerCombat.condition.hull <= 0 ? "sunk" : "surrendered";
    gameOver = true;
    gameOverAt = 0;
  }

  applyStaticTranslations();
  setInterval(saveGame, 3000);
  window.addEventListener("beforeunload", saveGame);
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  updateHud();
  showBanner(t("sea.banner.depart", { name: runtimeShip.name }), "info", 2800);
  requestAnimationFrame(frame);
}

if (runtimeShip) {
  boot();
} else {
  // No ship in the water: the sea has nothing to sail. Back to the shipyard.
  window.location.replace("./index.html");
}
