/**
 * Sea screen: real-time sailing over the zone world.
 *
 * All rules live in ../model/world.js; this file only renders the world, reads the
 * keyboard and autosaves. Spanish labels (S10), English identifiers (S10).
 */

import { ammoById, hullById, pieceById } from "../data/naval-data.js";
import { createAppTranslator } from "../i18n/index.js";
import { localisedAmmo, localisedHull, localisedZone } from "../i18n/terms.js";
import { compassPoint, windAt, windForecast } from "../model/wind.js";
import {
  COMBAT,
  aiStep,
  applyDamage,
  bearingTo,
  createEnemyCombatant,
  createPlayerCombatant,
  refreshStatus,
  damageDealt,
  fireBroadside,
  AMMO_SWITCH,
  ammoKeyAmmoId,
  markEngaged,
  openingBonus,
  rangeCircleM,
  describeAmmo,
  loadedShare,
  maneuverFactor,
  setBroadsideAmmo,
  readyDamage,
  sideCapacity,
  sideForBearing,
  speedFactor,
  tickCombatant,
  wreckPrize,
} from "../model/combat.js";
import {
  captainShip,
  deserializeFleet,
  fleetUpkeep,
  removeShip,
  withLiveCondition,
  sailingShips,
  serializeFleet,
  setCaptain,
  withShipCondition,
} from "../model/fleet.js";
import {
  REPAIR,
  damagedFleetShips,
  needsRepair,
  repairCost,
  repairFleetShip,
  repairShip,
} from "../model/repair.js";
import { ARRIVAL_NOTICE_KEY } from "../model/arrival-notice.js";
import { normaliseGold } from "../model/economy.js";
import { bootSettings } from "../model/settings-storage.js";
import { bootCatalogue } from "../model/catalogue-storage.js";
import { AUTOFIRE } from "../model/settings.js";
import { burnSupply, supplySeconds } from "../model/game-time.js";
import {
  closestTarget,
  escortFire,
  nextCommandShip,
  pruneAllies,
  squadronStatus,
} from "../model/squadron.js";
import { createEscort } from "../model/formation.js";
import { hasEnemyInGunshot, hullBarShare, timeScaleOnEngage } from "../model/sea-hud.js";
import { flagColours, flagFor } from "../model/flag.js";
import { conditionShare, duelRoster, duelVisible } from "../model/duel-panel.js";
import {
  canAssaultFort,
  createFortCombatant,
  damageFort,
  damageOccupiedFort,
  fortFire,
  fortHeldByEnemy,
  fortOccupierCondition,
  occupierFire,
  occupyFort,
  portClosed,
} from "../model/fort.js";
import { hullTurnFactor } from "../model/turning.js";
import { createTrail, stepTrail, trailWidthPx } from "../model/damage-trail.js";
import { normaliseAutoFire, targetForSide } from "../model/autofire.js";
import { priceWithPurse } from "../model/repair.js";
import { captureableShip, withPrize } from "../model/sale.js";
import {
  WORLD,
  clampToSafeZone,
  insideSafeZone,
  safeZoneRadiusM,
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
  ammo: $("#hud-ammo"),
  banner: $("#banner"),
  duelPanel: $("#duel-panel"),
  duelRoster: $("#duel-roster"),
  timeBadge: $("#time-badge"),
  portPanel: $("#port-panel"),
  portCost: $("#port-cost"),
  portFleet: $("#port-fleet"),
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
    // A corrupted or hand-edited save must not sail with a debt (S32).
    if (game && game.gold !== undefined) return { ...game, gold: normaliseGold(game.gold) };
  } catch {
    /* fall through */
  }
  return null;
}

const loaded = loadFleet();
// `fleet` is reassigned whenever the condition of a hull changes (S22, S23).
let fleet = loaded.fleet;
const { legacyShip } = loaded;
let runtimeShip = captainShip(fleet);

const ui = {
  /** Simulation steps per frame: 1, 2, 4 or 8, cycled by the time-warp key (S31). */
  timeScale: 1,
  /** Automatic fire (S47): the shipyard check, read once when the sea opens. */
  autoFire: true,
  /** Whether an enemy was engaged on the last step, so S43 acts only on the edge. */
  wasEngaged: false,
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
/**
 * The crew's reserve, in seconds of game time (S67). It is the shipyard's `days` of
 * provisions expressed in the clock the sea actually runs on, and it burns as the
 * voyage goes: every whole day it gives up is a day of wages the crew is owed.
 */
let supplyLeftS = 0;
/** Set once, so the "no provisions" warning fires on the moment it runs out. */
let supplyWarned = false;
/**
 * The shipyard as a combatant (S74). She is built at boot and kept in the save, so her
 * damage and her garrison survive a reload, like a hull's.
 */
let fortCombat = null;
/** Victories the player has won, which is what grows the yard's battery (S74). */
let victories = 0;
/** The escorts at sea: `{ id, name, x, y, heading, currentSpeedKn, speedKn, combat }` (S36). */
let escorts = [];
let gameOver = false;
let gameOverAt = 0;
let gameOverShown = false;
const fx = [];
// The initial position is seeded at boot, so only movement into port counts.
let wasInPort = false;

/* ---------------------------------------------------------------- persistence */

/** Write the fleet back after it changed (a lost escort, a repair). */
function saveFleetState() {
  try {
    localStorage.setItem(FLEET_KEY, serializeFleet(fleet));
  } catch {
    /* storage disabled: the change still lives in memory */
  }
}

function saveGame() {
  if (!world) return;
  try {
    world = { ...world, gold: goldEarned };
    const payload = {
      gold,
      supplyLeftS,
      victories,
      fort: fortCombat
        ? {
            condition: { ...fortCombat.condition },
            crew: { ...fortCombat.crew },
            status: fortCombat.status,
            // The player's investment rides with the save (S100): bought guns reload
            // with her, because the combatant is rebuilt from the save on boot.
            boughtGuns: Math.max(0, Math.floor(Number(fortCombat.boughtGuns) || 0)),
            // The occupiers travel with the save (S93): a half-broken occupation has to
            // come back half-broken, or the player would retake her for free on reload.
            occupation: fortCombat.occupation
              ? {
                  condition: { ...fortCombat.occupation.condition },
                  crew: { ...fortCombat.occupation.crew },
                  initialCrew: fortCombat.occupation.initialCrew,
                  crewDamagePool: fortCombat.occupation.crewDamagePool,
                }
              : undefined,
          }
        : undefined,
      world: serializeWorld(world),
      combat: playerCombat
        ? {
            escorts: Object.fromEntries(
              escorts.map((escort) => [
                escort.id,
                { condition: escort.combat.condition, crew: escort.combat.crew },
              ]),
            ),
            player: {
              condition: playerCombat.condition,
              crew: playerCombat.crew,
              pieces: playerCombat.pieces.map((p) => ({
                // The round chosen in the fight survives a reload (S65): it is the
                // player's order, not a detail of the last volley.
                pieceId: p.pieceId,
                ammoId: p.ammoId,
                shotsLeft: p.shotsLeft,
                reloadTimer: p.reloadTimer,
              })),
            },
          }
        : undefined,
    };
    localStorage.setItem(GAME_KEY, JSON.stringify(payload));
    // The damage also lives on the hull itself, so it survives the way back to the
    // shipyard and a change of captain (S23). Every hull, not only the captain (S90): an
    // escort's damage used to stay in the sea save alone, so the shipyard quoted her
    // repair from a stale sheet.
    fleet = withLiveCondition(fleet, [
      { id: runtimeShip?.id, combat: playerCombat },
      ...escorts.map((escort) => ({ id: escort.id, combat: escort.combat })),
    ]);
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

/** Quote and repair the actual combatants, not their last saved fleet copies. */
function liveRepairShip(ship) {
  if (!ship) return ship;
  const combat = ship.id === runtimeShip?.id
    ? playerCombat
    : escorts.find((escort) => escort.id === ship.id)?.combat;
  return combat ? { ...ship, condition: combat.condition, crewAlive: combat.crew } : ship;
}

function liveRepairFleet() {
  return { ...fleet, ships: (fleet?.ships ?? []).map(liveRepairShip) };
}

function repairFleetShipFromLive(shipId) {
  const ship = (fleet?.ships ?? []).find((entry) => entry.id === shipId);
  if (!ship) return repairFleetShip(fleet, shipId, gold);
  const live = liveRepairShip(ship);
  const source = withShipCondition(fleet, shipId, { condition: live.condition, crewAlive: live.crewAlive });
  return repairFleetShip(source, shipId, gold);
}

/** Describe a partial offer as a share of the remaining damage, not condition. */
function partialRepairOffer(cost) {
  return gold > 0 && gold < cost
    ? t("sea.port.partial", { gold: fmtInt.format(gold), percent: fmtOne.format(gold / cost * 100) })
    : "";
}

function repairResultText(result, name, fullKey) {
  return result.partial
    ? t("sea.port.partialDone", {
        name, gold: fmtInt.format(result.spent), percent: fmtOne.format(result.fraction * 100),
      })
    : t(fullKey, { name, gold: fmtInt.format(result.spent) });
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
  // A yard in enemy hands takes the repairs with her (S74).
  if (portClosed(fortCombat)) {
    showBanner(t("sea.banner.portClosed"), "danger", 3000);
    return;
  }

  const result = repairShip(liveRepairShip(runtimeShip), gold);
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
  // its condition and surviving crew written into its own entry (S23).
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
    repairResultText(result, runtimeShip.name, "sea.port.repairDone"),
    "gold",
    3200,
  );
  updateHud();
}

/**
 * A hull repaired through its fleet entry is also a live combatant at sea (S36). The
 * sea save is written from the combatants and wins on reload (S23), so the fix has to
 * reach the escort too or it would come back damaged on the next boot.
 */
function healEscortFromFleet(shipId) {
  const escort = escorts.find((entry) => entry.id === shipId);
  if (!escort?.combat) return;
  const ship = (fleet?.ships ?? []).find((entry) => entry.id === shipId);
  if (!ship) return;
  escort.combat.condition = { ...ship.condition };
  escort.combat.crew = { ...ship.crewAlive };
  escort.combat.crewDamagePool = 0;
  refreshStatus(escort.combat);
}

/**
 * Repair one of the fleet's other hulls from the port list (S24). The price and the
 * verdicts are the captain's; what changes is where the result is written: on that
 * ship's own fleet entry, never on the ship the player is sailing.
 */
function repairFleetShipAtPort(shipId) {
  if (!world || gameOver || !playerCombat || !inHomePort()) return;
  if (portClosed(fortCombat)) {
    showBanner(t("sea.banner.portClosed"), "danger", 3000);
    return;
  }
  const ship = (fleet?.ships ?? []).find((entry) => entry.id === shipId);
  if (!ship) return;

  const result = repairFleetShipFromLive(shipId);
  if (!result.repaired) {
    showBanner(
      result.reason === "no-damage"
        ? t("sea.port.repairNoDamage", { name: ship.name })
        : t("sea.port.repairShort", { gold: fmtInt.format(result.missing ?? 0) }),
      result.reason === "no-damage" ? "info" : "danger",
      2600,
    );
    return;
  }

  fleet = result.fleet;
  gold = result.gold;
  healEscortFromFleet(shipId);
  saveGame();
  showBanner(
    repairResultText(result, ship.name, "sea.port.fleetDone"),
    "gold",
    3200,
  );
  updatePortPanel();
  updateHud();
}

/* ---------------------------------------------------------------- automatic port repair (S49) */

/**
 * Arriving at the home port opens the shipyard, but it no longer repairs anything
 * (S86): repairing is the player's decision, one hull at a time, with the button each
 * hull carries in the fleet panel. What is left here is the arrival itself — save the
 * voyage and go to the shipyard, where the repair buttons are.
 */
function updatePortArrival() {
  const inPort = inHomePort();
  const arrived = inPort && !wasInPort;
  wasInPort = inPort;
  if (!arrived || gameOver || !playerCombat) return false;

  // Nothing is spent and no hull is touched: the shop asks, the player answers.
  try {
    localStorage.removeItem(ARRIVAL_NOTICE_KEY);
  } catch {
    /* storage disabled: continue to the shipyard */
  }
  saveGame();
  window.location.href = "./index.html";
  return true;
}

/**
 * Time warp (S31): the key cycles the simulation through ×1, ×2, ×4 and ×8 so the
 * long stretch between two objectives does not have to be waited out. The world is
 * advanced in the same small steps as real time, once per multiplier, instead of one
 * step that many times longer, so reloads, drift and pick-up radii behave exactly as
 * they do at normal speed.
 */
const TIME_SCALES = [1, 2, 4, 8];

function nextTimeScale(current) {
  const index = TIME_SCALES.indexOf(current);
  return TIME_SCALES[(index + 1) % TIME_SCALES.length];
}

/** Redraw the ×N badge and its accessible label for the active multiplier. */
function renderTimeBadge() {
  if (!els.timeBadge) return;
  const scale = ui.timeScale;
  els.timeBadge.textContent = t("sea.time.badge", { scale });
  els.timeBadge.setAttribute("aria-label", t("sea.time.now", { scale }));
  els.timeBadge.classList.toggle("is-hidden", scale === 1);
}

/**
 * The fast-forward goes back to x1 when an enemy engages (S43), once per engagement:
 * pressing T again in the middle of the fight is the player's call.
 */
function dropTimeOnEngage() {
  const engaged = world.encounters.some(
    (encounter) => encounter.type === "enemy" && encounter.combat?.status === "fighting",
  );
  const next = timeScaleOnEngage(ui.timeScale, ui.wasEngaged, engaged);
  ui.wasEngaged = engaged;
  if (!next.dropped) return;
  ui.timeScale = next.timeScale;
  renderTimeBadge();
  showBanner(t("sea.banner.timeEngage"), "danger", 3000);
}

function toggleTimeWarp() {
  ui.timeScale = nextTimeScale(ui.timeScale);
  renderTimeBadge();
  showBanner(t("sea.banner.timeWarp", { scale: ui.timeScale }), "info", 1500);
}

/**
 * Load the guns with the round a key stands for (S65). The guns that cannot fire it keep
 * the round they already had, and the banner says how many of each, so the player can see
 * that a 32-pounder did not follow the order.
 */
function chooseAmmunition(key) {
  const ammoId = ammoKeyAmmoId(key);
  if (!ammoId || !playerCombat) return;
  const result = setBroadsideAmmo(playerCombat, ammoId);
  if (result.switched === 0 && result.kept === 0) return;
  const name = localisedAmmo(ammoId, t).name;
  showBanner(
    result.kept > 0
      ? t("sea.banner.ammoMixed", { ammo: name, switched: result.switched, kept: result.kept })
      : t("sea.banner.ammo", { ammo: name, switched: result.switched }),
    "info",
    2200,
  );
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
  } else if (key === "1" || key === "2" || key === "3") {
    event.preventDefault();
    // The middle of a fight is exactly when the round has to change (S65).
    if (!event.repeat) chooseAmmunition(key);
  } else if (key === "t") {
    event.preventDefault();
    if (!event.repeat) toggleTimeWarp();
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

  // A taken yard flies a warning instead of the anchor (S74).
  if (portClosed(fortCombat)) {
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(161,60,44,0.85)";
    ctx.lineWidth = 22;
    ctx.stroke();
  }

  // The safe zone around the shipyard (S66): the water no hostile may enter.
  if (safeZoneRadiusM() > 0) {
    ctx.beginPath();
    ctx.arc(0, 0, safeZoneRadiusM(), 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(143,208,255,0.35)";
    ctx.setLineDash([60, 45]);
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(143,208,255,0.05)";
    ctx.fill();
  }

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

  // A yard the enemy holds flies her colours over the anchor (S93): the player has to be
  // able to see, from the water, that the harbour she is sailing into is not hers.
  if (fortCombat && fortHeldByEnemy(fortCombat)) {
    ctx.beginPath();
    ctx.arc(0, 0, 190, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(161,60,44,0.9)";
    ctx.lineWidth = 16;
    ctx.setLineDash([40, 30]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#a13c2c";
    ctx.font = "600 120px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("⚔", 0, 44);
  }

  drawRangeCircles(ctx);
  drawEncounters(ctx);
  drawWake(ctx);
  drawPlayerShip(ctx);
  drawFx(ctx);

  ctx.restore();

  // The floating bars are drawn in screen space, so a bar stays readable at any
  // camera scale instead of shrinking with the hull it belongs to (S21).
  drawShipBars(ctx);

  // Keep allied hulls visible even when the captain's stern bars overlap their station.
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(PX_PER_M, PX_PER_M);
  ctx.translate(-world.ship.x, -world.ship.y);
  for (const escort of escorts) drawEscortShip(ctx, escort);
  ctx.restore();
}

/* ---------------------------------------------------------------- floating bars (S21) */

const BAR = {
  /** Condition block, above the hull. */
  width: 108,
  /** Per-beam blocks, one on each side of the hull. */
  sideWidth: 54,
  /** Screen px of clear water kept between a hull's centre and the nearest block edge. */
  hullClear: 26,
  /**
   * The "already dealt" backdrop is read in full broadsides of the scale: four of
   * them is what COMBAT.damageScale is calibrated to sink a reference hull with.
   */
  dealtVolleys: 4,
  height: 6,
  gap: 3,
  padding: 5,
  hull: "#a13c2c",
  rigging: "#3d6fa8",
  crew: "#2f6b47",
  ready: "#e0a815",
  dealt: "rgba(224,168,21,0.28)",
  /** The part of a condition bar that was just lost (S52). */
  trail: "#f5e6c8",
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

function drawBar(ctx, x, y, share, color, { backdrop = null, width = BAR.width, trail = null } = {}) {
  ctx.fillStyle = BAR.track;
  ctx.fillRect(x, y, width, BAR.height);
  if (trail) {
    // What the bar just lost stays in view behind the fill (S52), however short the bar
    // and however small the hit. At the very end of a bar it is drawn over the fill's end
    // instead of past the edge.
    const trailPx = Math.min(width, trailWidthPx(trail, width));
    if (trailPx > 0) {
      const start = Math.min(x + width * Math.min(1, Math.max(0, share)), x + width - trailPx);
      ctx.fillStyle = BAR.trail;
      ctx.fillRect(start, y, trailPx, BAR.height);
    }
  }
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
      trail: row.trail ?? null,
      width,
    });
    cursor += BAR.height + BAR.gap;
  }
}

/** One lost-tramo state per condition bar, kept with its combatant (S52). */
const trailStates = new WeakMap();
/** World seconds that passed since the last frame was drawn: the tramo follows the world clock. */
let frameWorldDt = 0;

/** Step and return the lost-tramo state of one condition bar of `combatant`. */
function trailFor(combatant, key, share) {
  let states = trailStates.get(combatant);
  if (!states) {
    states = {};
    trailStates.set(combatant, states);
  }
  states[key] = stepTrail(states[key] ?? createTrail(share), share, frameWorldDt);
  return states[key];
}

/**
 * The bars of one hull (S21): the condition astern along her keel, and each beam's
 * damage and reload on its own side of her, so port and starboard are read where
 * they are instead of as one stack. Every block turns with the hull, because a
 * beam is a place on the ship, not a place on the screen. Condition sits on the
 * keel and the beams on the perpendicular, so the three never overlap.
 */
function drawBarsFor(ctx, combatant, x, y, distanceM, heading, scale, widthShare = 1) {
  if (!combatant) return;
  // A tougher hull is drawn with longer condition bars than a light one (S59).
  const conditionWidth = Math.round(BAR.width * widthShare);

  const conditionRows = [
    { share: combatant.condition.hull / 100, color: BAR.hull, key: "hull" },
    { share: combatant.condition.rigging / 100, color: BAR.rigging, key: "rigging" },
    { share: combatant.condition.crew / 100, color: BAR.crew, key: "crew" },
  ].map((row) => ({ ...row, trail: trailFor(combatant, row.key, row.share) }));
  const stern = blockCentre(x, y, heading + Math.PI, blockSize(conditionRows.length, conditionWidth));
  drawBlock(ctx, conditionRows, stern.x, stern.y, conditionWidth);

  // One scale for every hull on screen (`scale`, in `sideCapacity` units): a bar is a
  // share of the strongest beam in view, not of its own ship, so a patache's
  // broadside reads as small next to a galleon's and the two can be compared.

  for (const side of ["babor", "estribor"]) {
    // Starboard bears at heading + 90°, port at heading - 90°, the same convention
    // sideForBearing uses.
    const sign = side === "estribor" ? 1 : -1;
    const angle = heading + sign * (Math.PI / 2);
    const rows = [
      {
        share: readyDamage(combatant, side, distanceM) / scale,
        backdrop: damageDealt(combatant, side) / (scale * BAR.dealtVolleys),
        color: BAR.ready,
      },
      { share: loadedShare(combatant, side), color: BAR.reload },
    ];
    const at = blockCentre(x, y, angle, blockSize(rows.length, BAR.sideWidth));
    drawBlock(ctx, rows, at.x, at.y, BAR.sideWidth);
  }
}

/**
 * Bars over the player's hull always, and over an enemy only once it is a target.
 * Every ship is measured against the same scale, and the player's guns are read at
 * the range of the nearest target, so both sides of a duel are on the same footing.
 */
function drawShipBars(ctx) {
  if (!world) return;

  const targets = [];
  for (const encounter of world.encounters) {
    if (encounter.type !== "enemy" || !encounter.combat) continue;
    if (encounter.combat.status !== "fighting") continue;
    if (!inGunshot(encounter)) continue;
    targets.push({
      combatant: encounter.combat,
      at: toScreen(encounter.x, encounter.y),
      distance: Math.hypot(encounter.x - world.ship.x, encounter.y - world.ship.y),
      heading: encounter.heading ?? 0,
      toughness: encounter.combat.hullToughness ?? 1,
    });
  }

  // A yard the enemy holds carries her garrison's bar among the hostiles (S93): the
  // player has to see how much of the occupation is left, because that is the fight.
  //
  // The bar is drawn from the yard itself with the occupiers' crew condition swapped in,
  // not from the bare occupation record: the renderer also reads her beams and the damage
  // they have dealt, and the occupation only records men. A record without `pieces` used
  // to crash the whole animation loop the moment the yard was on screen.
  const occupiedBar = occupiedFortCombatant();
  if (occupiedBar && inGunshot({ x: 0, y: 0 })) {
    targets.push({
      combatant: occupiedBar,
      at: toScreen(0, 0),
      distance: Math.hypot(world.ship.x, world.ship.y),
      heading: 0,
      toughness: fortCombat.hullToughness ?? 1,
    });
  }

  const nearest = targets.reduce((best, t) => Math.min(best, t.distance), Infinity);
  const gunRange = Number.isFinite(nearest) ? nearest : 0;
  const owned = [];
  if (playerCombat) {
    owned.push({
      combatant: playerCombat,
      at: toScreen(world.ship.x, world.ship.y),
      distance: gunRange,
      heading: world.ship.heading ?? 0,
      toughness: playerCombat.hullToughness ?? 1,
    });
  }
  // The escorts carry the same bars as the captain, but only while they are in the
  // fight (S54): in a tight formation their blocks would pile up under the captain's.
  // Only the enemies actually fighting count: combat is raised for the ones the captain
  // has engaged, and an escort answers nothing else (S54).
  const hostiles = world.encounters.filter(
    (encounter) => encounter.type === "enemy" && encounter.combat?.status === "fighting",
  );
  for (const escort of escorts) {
    if (!escort.combat) continue;
    if (!hasEnemyInGunshot(escort, hostiles, COMBAT.engageRadiusM)) continue;
    owned.push({
      combatant: escort.combat,
      at: toScreen(escort.x, escort.y),
      distance: gunRange,
      heading: escort.heading ?? 0,
      toughness: escort.combat.hullToughness ?? 1,
    });
  }
  // Escorts first, the captain on top of them: her bars are the ones to read.
  const ships = [...owned.slice(1), ...owned.slice(0, 1), ...targets];

  let scale = 1;
  let referenceToughness = 0;
  for (const ship of ships) {
    referenceToughness = Math.max(referenceToughness, ship.toughness);
    for (const side of ["babor", "estribor"]) {
      scale = Math.max(scale, sideCapacity(ship.combatant, side, ship.distance));
    }
  }

  for (const ship of ships) {
    drawBarsFor(
      ctx,
      ship.combatant,
      ship.at.x,
      ship.at.y,
      ship.distance,
      ship.heading,
      scale,
      hullBarShare(ship.toughness, referenceToughness),
    );
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

/**
 * The colours of one hull, flown from her masthead (S72). The canvas is already
 * translated to the hull and rotated to her heading, so the flag is drawn at her
 * stern-mast and streams aft: the wind is always ahead of a sail in this drawing, which
 * keeps it readable at any heading.
 */
function drawFlag(ctx, countryId, { x = -10, y = 0, size = 26 } = {}) {
  const colours = flagColours(countryId);
  const height = size * 0.62;
  // Three horizontal bands, top to bottom.
  const bandHeight = height / 3;
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = colours.bands[i];
    ctx.fillRect(x - size, y - height / 2 + i * bandHeight, size, bandHeight + 0.5);
  }
  // The cross, when the flag has one: a vertical bar plus a horizontal one.
  if (colours.cross) {
    ctx.fillStyle = colours.cross;
    ctx.fillRect(x - size * 0.58, y - height / 2, size * 0.16, height);
    ctx.fillRect(x - size, y - bandHeight * 0.55, size, bandHeight * 1.1);
    if (colours.ragged) {
      // A ragged cross of Burgundy: short diagonal strokes over the field.
      ctx.strokeStyle = colours.cross;
      ctx.lineWidth = 1.6;
      for (const t of [0.15, 0.45, 0.75]) {
        ctx.beginPath();
        ctx.moveTo(x - size * (1 - t), y - height / 2);
        ctx.lineTo(x - size * (0.82 - t), y + height / 2);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = "rgba(10,18,28,0.55)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - size, y - height / 2, size, height);
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

  // An enemy flies her own nation's colours, never the captain's (S72).
  drawFlag(ctx, flagFor({ hullId: encounter.hullId, isFleet: false }), { x: -6, size: 20 });

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

/**
 * The range of each beam, drawn as an arc on the water (S68). One circle per beam, at the
 * reach of the round that beam is loaded with, so the drawing follows a change of
 * ammunition in the middle of the fight instead of promising the bare gun's range.
 *
 * It is an arc, not a full circle: a broadside cannot fire through its own hull, so a
 * full ring would advertise the stern as a firing bearing. The arc spans the same 120°
 * the guns actually cover, centred on the beam.
 */
function drawRangeCircles(ctx) {
  if (!playerCombat || !world) return;
  const hull = { x: world.ship.x, y: world.ship.y };
  const heading = world.ship.heading ?? 0;

  for (const side of ["babor", "estribor"]) {
    const radius = rangeCircleM(playerCombat, side);
    if (!(radius > 0)) continue;
    // Starboard bears at heading + 90°, port at heading - 90°, as everywhere else.
    const centre = heading + (side === "estribor" ? 1 : -1) * (Math.PI / 2);
    // A beam whose guns are all loaded and ready is drawn solid: that is the beam that
    // can fire right now, so the arcs also say which side is live (S71).
    const ready = loadedShare(playerCombat, side) >= 1;
    const opening = openingBonus(playerCombat, side).damage > 1;
    ctx.beginPath();
    ctx.arc(hull.x, hull.y, radius, centre - COMBAT.arcHalf, centre + COMBAT.arcHalf);
    const hue = side === "estribor" ? "143,208,255" : "224,168,21";
    ctx.strokeStyle = ready ? `rgba(${hue},0.85)` : `rgba(${hue},0.26)`;
    ctx.lineWidth = ready ? 9 : 6;
    // The opening volley gets a brighter arc still: the player can see the bonus is live.
    if (opening) ctx.strokeStyle = side === "estribor" ? "rgba(180,235,255,0.95)" : "rgba(255,215,120,0.95)";
    ctx.setLineDash(ready ? [] : [40, 34]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawPlayerShip(ctx) {
  const ship = world.ship;
  const hull = hullById(runtimeShip.hullId);
  const flag = flagFor({ hullId: runtimeShip.hullId, isFleet: true, captainHullId: runtimeShip.hullId });
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

  // The captain flies her own colours, and the fleet follows them (S72).
  drawFlag(ctx, flag, { x: -len * 0.3, size: 26 });
  ctx.restore();
}

/** Draw an allied hull at its actual position and heading, without a player rudder. */
function drawEscortShip(ctx, escort) {
  const ship = fleet.ships.find((entry) => entry.id === escort.id);
  const hull = hullById(ship?.hullId);
  const lengthRatio = hull ? Math.min(1.5, Math.max(0.7, hull.lengthM / 25)) : 1;
  const len = 70 * lengthRatio;
  const beam = 26 * lengthRatio;

  ctx.save();
  ctx.translate(escort.x, escort.y);
  ctx.rotate(escort.heading);
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
  ctx.strokeStyle = "#d9d2c2";
  ctx.lineWidth = 4;
  for (const t of [-0.2, 0.05, 0.22]) {
    ctx.beginPath();
    ctx.moveTo(len * t, -beam * 0.34);
    ctx.lineTo(len * t, beam * 0.34);
    ctx.stroke();
  }
  // Every hull in the fleet flies the captain's colours (S72).
  const captainHull = captainShip(fleet)?.hullId ?? runtimeShip.hullId;
  drawFlag(ctx, flagFor({ hullId: ship?.hullId, isFleet: true, captainHullId: captainHull }), {
    x: -len * 0.3,
    size: 22,
  });
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

  // the escorts, smaller and in their own colour (S42)
  for (const escort of escorts) {
    ctx.save();
    ctx.translate(escort.x, escort.y);
    ctx.rotate(escort.heading ?? 0);
    ctx.beginPath();
    ctx.moveTo(150, 0);
    ctx.lineTo(-95, -80);
    ctx.lineTo(-95, 80);
    ctx.closePath();
    ctx.fillStyle = "#8fd0ff";
    ctx.fill();
    ctx.restore();
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
    // A new fight is a new opening: the captain's beams get their first-volley bonus
    // back (S69). It is the enemy's arrival that reopens it, not the player's whim.
    markEngaged(playerCombat);
  }
  return encounter.combat;
}

function pushFx(type, x, y, x2, y2, ttl) {
  fx.push({ type, x, y, x2, y2, ttl, ttl0: ttl });
}

function playerMaxRangeM() {
  return Math.max(0, ...playerCombat.pieces.map((p) => pieceById(p.pieceId).rangeM));
}

/**
 * The yard as a target for the player's guns (S93). A yard the enemy holds is a fixed
 * hostile at the origin: she is not an encounter, so she never drifts, the safe zone does
 * not shove her and she never becomes a wreck. `null` while she is ours or already
 * retaken, so the guns fall back to the sails they always had.
 */
/**
 * The yard the enemy holds, as a combatant the guns can actually shoot at (S93).
 *
 * The yard's own record is `"surrendered"` — that is what "she is taken" means — and every
 * targeting rule in the game rejects a combatant that is not `"fighting"`. Handing the bare
 * record to the guns is why the player could not aim at her at all: the guns answered "no
 * target" while she sat there firing back. This façade carries the occupiers' condition
 * under a fighting status, so she is a legitimate target without rewriting the saved
 * `status`, which is what closes the port.
 */
function occupiedFortCombatant() {
  if (!fortCombat || !fortHeldByEnemy(fortCombat)) return null;
  return {
    ...fortCombat,
    status: "fighting",
    condition: { ...fortCombat.condition, crew: fortOccupierCondition(fortCombat) },
  };
}

function occupiedFortTarget() {
  const combat = occupiedFortCombatant();
  if (!combat) return null;
  return { id: "fort", type: "fort", name: t("sea.fort.name"), x: 0, y: 0, combat };
}

/**
 * One hit on the yard the enemy holds (S93): the men holding her take it, never her hull.
 * The recovery itself is the model's rule; the sea only applies it and announces it.
 */
function hitOccupiedFort(damage) {
  if (!fortCombat || !fortHeldByEnemy(fortCombat)) return;
  damageOccupiedFort(fortCombat, damage);
  if (!fortHeldByEnemy(fortCombat)) {
    // The occupiers broke: the yard is ours again and the port reopens (S93).
    showBanner(t("sea.banner.fortRetaken"), "gold", 5000);
    saveGame();
  }
}

/** Fire one side's guns at the nearest enemy that side bears on. */
function firePlayerBroadside(side, { auto = false } = {}) {
  if (!playerCombat || gameOver || playerCombat.status !== "fighting") return;

  const hit = targetForSide(world.ship, world.encounters, side, playerMaxRangeM(), [occupiedFortTarget()].filter(Boolean));
  if (!hit) {
    // The automatic fire looks every tick: it stays silent when nothing bears.
    if (!auto) showBanner(t("sea.banner.noTarget", { side: t(`sea.sides.${side}`) }), "info", 1500);
    return;
  }
  const { target, distance: targetDistance } = hit;

  // The yard the enemy holds is not a sail: there is no combatant to create and no
  // drifting position to read. Her damage goes through her own rule (S93).
  const isFort = target.id === "fort";
  const targetCombat = isFort ? fortCombat : ensureEnemyCombat(target);
  if (!targetCombat) return;
  const { volley } = fireBroadside(playerCombat, side, targetDistance, rnd);
  if (volley.length === 0) {
    if (!auto) showBanner(t("sea.banner.reloading", { side: t(`sea.sides.${side}`) }), "info", 1200);
    return;
  }

  for (const shot of volley) {
    pushFx("tracer", world.ship.x, world.ship.y, target.x, target.y, 0.3);
    if (shot.hit) {
      if (isFort) hitOccupiedFort(shot.damage);
      else applyDamage(targetCombat, shot.damage);
      pushFx("hit", target.x, target.y, target.x, target.y, 0.5);
    } else {
      pushFx("splash", target.x + (rnd() - 0.5) * 70, target.y + (rnd() - 0.5) * 70, 0, 0, 0.6);
    }
  }
}

/** With the shipyard check on, the captain's guns answer by themselves, like the escorts' (S47). */
function playerAutoFire() {
  if (!ui.autoFire) return;
  for (const side of ["babor", "estribor"]) firePlayerBroadside(side, { auto: true });
}

/** Copy the positions the world computed back onto the escorts that carry combat. */
function syncEscortsFromWorld() {
  for (const escort of escorts) {
    const moved = (world.escorts ?? []).find((entry) => entry.id === escort.id);
    if (!moved) continue;
    escort.x = moved.x;
    escort.y = moved.y;
    escort.heading = moved.heading;
    escort.currentSpeedKn = moved.currentSpeedKn;
  }
}

/** The whole line: the captain first, then every escort still at sea (S36). */
function allies() {
  const line = [{ id: runtimeShip.id, name: runtimeShip.name, ...world.ship, combat: playerCombat }];
  for (const escort of escorts) {
    line.push({ id: escort.id, name: escort.name, ...escort, combat: escort.combat });
  }
  return line;
}

/** Each escort fires on its own when a hostile bears, with its own reloads. */
function escortsFire() {
  if (gameOver) return;
  const fortTarget = occupiedFortTarget();
  for (const escort of escorts) {
    const sails = world.encounters.filter((e) => e.type === "enemy" && e.combat?.status === "fighting");
    const target = closestTarget(fortTarget ? [...sails, fortTarget] : sails, escort);
    if (!target) continue;
    // A yard the enemy holds takes its damage through the occupiers' rule (S93).
    const isFort = target.id === "fort";
    if (isFort && !fortHeldByEnemy(fortCombat)) continue;
    const { volley, side } = escortFire(escort, target, rnd);
    if (!volley.length) continue;
    for (const shot of volley) {
      pushFx("tracer", escort.x, escort.y, target.x, target.y, 0.3);
      if (shot.hit) {
        if (isFort) hitOccupiedFort(shot.damage);
        else applyDamage(target.combat, shot.damage);
        pushFx("hit", target.x, target.y, target.x, target.y, 0.5);
      } else {
        pushFx("splash", target.x + (rnd() - 0.5) * 70, target.y + (rnd() - 0.5) * 70, 0, 0, 0.6);
      }
    }
    showBanner(t("sea.banner.escortFire", { name: escort.name, side: t(`sea.sides.${side}`) }), "info", 1400);
  }
}

/**
 * Forget the targets that gave up the chase (S58). `updateWorld` releases their combat
 * when they fall past the disengage radius; the UI keeps its own view of the sea, so it
 * drops the stale combatant here instead of reading a fight that is over.
 */
function dropDisengagedTargets() {
  world.encounters = world.encounters.map((encounter) => {
    // Only a hull the world actually released: an enemy that still has combat for any
    // other reason (a saved voyage, a seeded sea) keeps it.
    if (encounter.type !== "enemy" || !encounter.wasEngaged || encounter.engaged) return encounter;
    if (!encounter.combat) return encounter;
    const { combat, ...rest } = encounter;
    return rest;
  });
}

/**
 * The shipyard's own fight (S74). She is a static hull: she never moves, she fires her
 * battery at any hostile that came for her, and the abyss squadrons that reach her fire
 * back. Her damage and her garrison live in the save, like a hull's.
 */
function updateFortCombat(dt) {
  if (!fortCombat) return;

  // The moment she strikes, the enemy walks in (S93). The occupiers have to exist before
  // the player can shoot at them, and their strength is what she has to break to be ours
  // again. This runs even while the port is closed, which is exactly when she is held.
  //
  // The guard is `portClosed`, not `fortHeldByEnemy`: the latter already requires an
  // occupation to exist, so a save written before this rule (a yard taken with no
  // occupiers recorded) would never be given one and could never be retaken.
  // `occupyFort` is idempotent and ignores a yard that is still fighting.
  if (portClosed(fortCombat)) occupyFort(fortCombat);

  if (portClosed(fortCombat)) return;
  tickCombatant(fortCombat, dt);

  for (const encounter of world.encounters) {
    if (encounter.type !== "enemy") continue;
    if (!canAssaultFort(encounter.zoneId ?? currentZone().id)) continue;
    const distance = Math.hypot(encounter.x, encounter.y);
    if (distance > COMBAT.engageRadiusM) continue;
    const combat = encounter.combat;
    if (!combat || combat.status !== "fighting") continue;

    // The yard fires both beams, each at whatever bears; the range gate is her own guns'.
    for (const side of ["babor", "estribor"]) {
      const { volley } = fortFire(fortCombat, side, distance, rnd);
      for (const shot of volley) {
        if (!shot.hit) continue;
        const piece = pieceById(shot.pieceId);
        const ammo = ammoById(shot.ammoId);
        if (!piece || !ammo) continue;
        const falloff = 1 - 0.5 * (distance / piece.rangeM);
        const total = piece.shotKg * ammo.massFactor * COMBAT.damageScale * falloff;
        applyDamage(combat, {
          hull: total * ammo.damageSplit.hull,
          rigging: total * ammo.damageSplit.rigging,
          crew: total * ammo.damageSplit.crew,
        });
        pushFx("hit", encounter.x, encounter.y, encounter.x, encounter.y, 0.5);
      }
    }

  }
}

/**
 * The occupiers' counter-attack (S93). A yard the enemy holds is not a shelter: while she
 * is theirs she shoots at whoever comes to take her back, with the yard's own guns.
 *
 * She respects the safe zone like every other hostile (S66). That is not a detail: the
 * player opens the sea inside the port, and a battery firing at point-blank range on a
 * captain who has not yet weighed anchor sinks her before she can even set sail. The zone
 * exists precisely so nobody shoots into the harbour; a taken yard is not the exception.
 */
function occupiedFortFire(dt) {
  if (!world || !fortCombat || !fortHeldByEnemy(fortCombat)) return;
  if (!playerCombat || playerCombat.status !== "fighting") return;
  if (insideSafeZone(world.ship)) return;
  // The occupiers' guns reload on the sea's own clock, exactly as the yard's do while she
  // is ours. Ticking with 0 left them permanently loaded at the first volley and reloading
  // never; their 120 s reload is meant to be felt.
  tickCombatant(fortCombat, dt);
  const distance = Math.hypot(world.ship.x, world.ship.y);
  for (const side of ["babor", "estribor"]) {
    const { volley } = occupierFire(fortCombat, side, distance, rnd);
    for (const shot of volley) {
      if (!shot.hit) {
        pushFx("splash", world.ship.x + (rnd() - 0.5) * 70, world.ship.y + (rnd() - 0.5) * 70, 0, 0, 0.6);
        continue;
      }
      const piece = pieceById(shot.pieceId);
      const ammo = ammoById(shot.ammoId);
      if (!piece || !ammo) continue;
      const falloff = 1 - 0.5 * (distance / piece.rangeM);
      const total = piece.shotKg * ammo.massFactor * COMBAT.damageScale * falloff;
      applyDamage(playerCombat, {
        hull: total * ammo.damageSplit.hull,
        rigging: total * ammo.damageSplit.rigging,
        crew: total * ammo.damageSplit.crew,
      });
      pushFx("tracer", 0, 0, world.ship.x, world.ship.y, 0.3);
      pushFx("hit", world.ship.x, world.ship.y, world.ship.x, world.ship.y, 0.5);
    }
  }
}

/** Enemies inside the engage radius think, move and shoot. */
function processCombat(dt, now) {
  if (!playerCombat || gameOver) return;
  tickCombatant(playerCombat, dt);
  for (const escort of escorts) tickCombatant(escort.combat, dt);

  playerAutoFire();

  // Escorts shoot first: they answer whatever hostile is nearest to them.
  escortsFire();

  // A yard the enemy holds answers the player who came for her (S93).
  occupiedFortFire(dt);

  // The fleet loses a hull for good when it sinks or strikes (S36).
  pruneLostEscorts();

  // The yard fights as a static hull (S74): she fires at whatever hostile is in range and
  // takes the fire of the squadrons that came for her.
  updateFortCombat(dt);

  for (const encounter of world.encounters) {
    if (encounter.type !== "enemy") continue;
    const distance = Math.hypot(encounter.x - world.ship.x, encounter.y - world.ship.y);
    if (distance > COMBAT.engageRadiusM && !encounter.combat) continue;
    const combat = ensureEnemyCombat(encounter);
    if (!combat || combat.status !== "fighting") continue;

    tickCombatant(combat, dt);
    // An enemy aims at the nearest allied hull: an escort that has run ahead of the
    // captain takes the fire, and pays for it (S36).
    // An abyss squadron that came for the yard shoots the yard, not the captain (S74).
    // That is the whole point of a fortification: it draws the fire.
    const assaulting = canAssaultFort(encounter.zoneId ?? currentZone().id) &&
      !portClosed(fortCombat) &&
      Math.hypot(encounter.x, encounter.y) <= COMBAT.engageRadiusM;
    const aimedAt = assaulting
      ? { id: "fort", name: fortCombat.name, x: 0, y: 0, combat: fortCombat }
      : closestTarget(allies(), encounter) ?? {
          id: runtimeShip.id,
          name: runtimeShip.name,
          ...world.ship,
          combat: playerCombat,
        };
    // The enemy hull feels the same wind the captain feels (S57).
    const result = aiStep(encounter, aimedAt, dt, rnd, { wind: windAt(world.seed, world.timeS) });

    // A fortification is not manoeuvred against (S74): a squadron bombarding the yard
    // fires from where it lies, because the yard cannot be out-turned and her walls are
    // not a beam to be presented. Without this the AI would spend the fight trying to
    // bring a broadside onto a target it is already sitting on, and never fire.
    if (assaulting) {
      const at = Math.hypot(encounter.x, encounter.y);
      for (const side of ["babor", "estribor"]) {
        const { volley: fortVolley } = fireBroadside(combat, side, at, rnd);
        for (const shot of fortVolley) {
          if (!shot.hit) continue;
          damageFort(fortCombat, shot.damage);
          pushFx("hit", 0, 0, 0, 0, 0.5);
        }
      }
      continue;
    }
    encounter.x = result.enemy.x;
    encounter.y = result.enemy.y;
    encounter.heading = result.enemy.heading;
    encounter.currentSpeedKn = result.enemy.currentSpeedKn;

    // The water around the shipyard is closed to hostiles (S66): an enemy that ends its
    // step inside is pushed back out, and it does not fire from in there. Without this a
    // chasing sail could park on the quay and shoot a repairing captain.
    let volley = result.volley;
    if (insideSafeZone(encounter)) {
      const pushed = clampToSafeZone(encounter);
      encounter.x = pushed.x;
      encounter.y = pushed.y;
      volley = [];
    }

    for (const shot of volley) {
      pushFx("tracer", encounter.x, encounter.y, aimedAt.x, aimedAt.y, 0.3);
      if (shot.hit) {
        // The yard takes her damage through her own rule, so her garrison breaks and her
        // hull goes exactly as a ship's does (S74).
        if (aimedAt.combat === fortCombat) damageFort(fortCombat, shot.damage);
        else applyDamage(aimedAt.combat, shot.damage);
        pushFx("hit", aimedAt.x, aimedAt.y, aimedAt.x, aimedAt.y, 0.5);
      } else {
        pushFx("splash", aimedAt.x + (rnd() - 0.5) * 70, aimedAt.y + (rnd() - 0.5) * 70, 0, 0, 0.6);
      }
    }
  }

  resolveDefeatedEnemies();

  // The voyage ends when nothing is left to sail (S87): losing the flagship is a blow,
  // not the end, and the next hull in line takes over. Only when every hull is gone does
  // the sinking screen come up.
  const status = squadronStatus(allies());
  if (status.over && !gameOver) {
    gameOver = true;
    gameOverAt = now;
    ui.throttle = 0;
  } else {
    handOverCommand();
  }
}

/** Promote the first fighting escort without moving her or rebuilding her combatant. */
function handOverCommand() {
  const next = nextCommandShip(allies());
  if (!next) return false;
  const previousName = runtimeShip.name;
  fleet = setCaptain(removeShip(fleet, runtimeShip.id), next.id);
  runtimeShip = captainShip(fleet);
  playerCombat = next.combat;
  escorts = escorts.filter((escort) => escort.id !== next.id);
  world = {
    ...world,
    ship: {
      x: next.x, y: next.y, heading: next.heading, currentSpeedKn: next.currentSpeedKn,
      speedKn: next.speedKn, turnFactor: hullTurnFactor(runtimeShip.hullId),
    },
    escorts: escorts.map(({ combat, ...rest }) => rest),
  };
  ui.trail = [];
  pruneLostEscorts();
  world = { ...world, escorts: escorts.map(({ combat, ...rest }) => rest) };
  saveGame();
  showBanner(t("sea.banner.commandHandover", { lost: previousName, name: runtimeShip.name }), "danger", 4000);
  return true;
}

/**
 * Drop the escorts that sank or struck and take them out of the fleet, with a
 * warning on screen: losing a hull is meant to hurt (S36).
 */
function pruneLostEscorts() {
  const { survivors, lost } = pruneAllies(escorts);
  if (lost.length === 0) return;
  for (const gone of lost) {
    showBanner(t("sea.banner.escortLost", { name: gone.name }), "danger", 4000);
    fleet = removeShip(fleet, gone.id);
  }
  escorts = survivors;
  saveFleetState();
}

/**
 * A sunk or surrendered enemy becomes a wreck whose gold the world model pays out.
 *
 * A hull that struck her colours can be taken instead (S63): she joins the fleet as the
 * player's own and leaves no wreck behind, because the player has her. A hull that went
 * to the bottom is only ever a wreck.
 */
function resolveDefeatedEnemies() {
  const zone = currentZone();
  world.encounters = world.encounters.map((encounter) => {
    if (encounter.type !== "enemy" || !encounter.combat) return encounter;
    const status = encounter.combat.status;
    if (status !== "sunk" && status !== "surrendered") return encounter;

    // Beating a hostile is a victory, and victories grow the yard's battery (S74).
    victories += 1;
    const prize = status === "surrendered" ? captureableShip(encounter) : null;
    if (prize) {
      fleet = withPrize(fleet, prize);
      saveFleetState();
      showBanner(t("sea.banner.captured", { name: prize.name }), "gold", 4000);
      return null;
    }

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
  }).filter(Boolean);
}

/**
 * Spend the crew's reserve as the voyage goes, and pay the wages of every whole day it
 * gives up (S67). The supply is the shipyard's `days` of provisions turned into the
 * clock the sea runs on; the wages are the fleet's own per-day upkeep, which existed and
 * was never charged.
 *
 * Running out is reported once, and it does not sink the ship: it is a warning that the
 * crew is on short rations, not a hidden game over.
 */
function burnVoyageSupply(dt) {
  const result = burnSupply(supplyLeftS, dt);
  supplyLeftS = result.secondsLeft;
  if (result.daysSpent > 0) {
    const owed = result.daysSpent * fleetUpkeep(fleet);
    if (owed > 0) gold = Math.max(0, gold - owed);
  }
  if (result.exhausted && !supplyWarned) {
    supplyWarned = true;
    showBanner(t("sea.banner.noSupply"), "danger", 4000);
  }
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

/**
 * The duel panel (S73): every hull in the fight, ours and theirs, each with her three
 * condition bars. It replaces the old target panel, which showed only the nearest enemy
 * and so hid the player's own side of the fight.
 *
 * The roster is rebuilt only when its numbers change: rebuilding it every frame would
 * restart the bars' transition on every tick and make them flicker.
 */
let duelSignature = null;

/** True when an abyss squadron is close enough to be fighting the yard (S74). */
function fortInFight() {
  if (!world || !fortCombat) return false;
  return world.encounters.some(
    (encounter) =>
      encounter.type === "enemy" &&
      encounter.combat?.status === "fighting" &&
      canAssaultFort(encounter.zoneId ?? currentZone().id) &&
      Math.hypot(encounter.x, encounter.y) <= COMBAT.engageRadiusM,
  );
}

function updateDuelPanel() {
  if (!world || !els.duelRoster) return;

  const own = [];
  if (playerCombat) {
    own.push({
      id: runtimeShip?.id ?? "captain",
      name: runtimeShip?.name ?? t("sea.target.captain"),
      x: world.ship.x,
      y: world.ship.y,
      combat: playerCombat,
    });
  }
  for (const escort of escorts) {
    if (!escort.combat) continue;
    own.push({ id: escort.id, name: escort.name, x: escort.x, y: escort.y, combat: escort.combat });
  }

  // The yard fights as one of ours (S74), so her hull and her garrison read in the same
  // panel as the ships in the fight. A yard the enemy holds is theirs now (S93): she
  // belongs on the other side of the roster, not this one.
  if (fortCombat && !portClosed(fortCombat) && fortInFight()) {
    own.push({ id: "fort", name: t("sea.fort.name"), x: 0, y: 0, combat: fortCombat });
  }

  const hostile = world.encounters
    .filter((encounter) => encounter.type === "enemy" && encounter.combat)
    .map((encounter) => ({
      id: encounter.id,
      name: localisedHull(encounter.hullId, t)?.name ?? t("sea.target.hostileSail"),
      hullId: encounter.hullId,
      x: encounter.x,
      y: encounter.y,
      combat: encounter.combat,
    }));

  // The yard the enemy holds is a hostile of her own (S93): she belongs on their side of
  // the roster, with the occupiers' garrison as her crew, so the player can read the fight
  // she has to win.
  const occupiedRow = occupiedFortCombatant();
  if (occupiedRow) {
    hostile.push({ id: "fort", name: t("sea.fort.name"), x: 0, y: 0, combat: occupiedRow });
  }

  const roster = duelRoster({
    ours: own,
    theirs: hostile,
    engageRadiusM: COMBAT.engageRadiusM,
    ship: world.ship,
  });

  if (!duelVisible(roster)) {
    els.duelPanel.classList.add("is-hidden");
    duelSignature = null;
    return;
  }
  els.duelPanel.classList.remove("is-hidden");

  const signature = roster
    .map((entry) => `${entry.id}:${Math.round(entry.hull)}:${Math.round(entry.rigging)}:${Math.round(entry.crew)}:${entry.side}`)
    .join("|");
  if (signature === duelSignature) return;
  duelSignature = signature;

  els.duelRoster.textContent = "";
  for (const entry of roster) {
    const row = document.createElement("div");
    row.className = `duel-row is-${entry.side}`;
    row.dataset.shipId = String(entry.id);

    const head = document.createElement("div");
    head.className = "duel-head";
    const name = document.createElement("span");
    name.className = "duel-name";
    name.textContent = entry.name;
    const distance = document.createElement("span");
    distance.className = "duel-distance";
    distance.textContent = Number.isFinite(entry.distanceM)
      ? t("sea.duel.distance", { distance: fmtInt.format(Math.round(entry.distanceM)) })
      : "";
    head.append(name, distance);

    const bars = document.createElement("div");
    bars.className = "duel-bars";
    for (const [key, label] of [
      ["hull", "sea.hull"],
      ["rigging", "sea.rigging"],
      ["crew", "sea.crew"],
    ]) {
      const bar = document.createElement("div");
      bar.className = `duel-bar duel-bar-${key}`;
      const fill = document.createElement("div");
      fill.className = `duel-fill duel-fill-${key}`;
      fill.style.width = `${Math.round(conditionShare(entry[key]) * 100)}%`;
      bar.title = `${t(label)}: ${Math.round(entry[key])} %`;
      bar.append(fill);
      bars.append(bar);
    }

    row.append(head, bars);
    els.duelRoster.append(row);
  }
}

/**
 * Signature of the fleet list: the hull ids, their names and their hull condition.
 * The list is rebuilt only when it changes, because rebuilding it every frame would
 * throw away the button the player is about to click (S24).
 */
let portFleetSignature = null;

/** Rebuild the list of damaged fleet ships with one repair button each (S24). */
function renderPortFleet(ships) {
  const container = els.portFleet;
  if (!container) return;
  const signature = ships.map((ship) => `${ship.id}:${ship.name}:${ship.condition?.hull ?? 100}:${repairCost(ship)}`).join("|") + `:${gold}`;
  if (signature === portFleetSignature) return;
  portFleetSignature = signature;
  container.textContent = "";

  for (const ship of ships) {
    const row = document.createElement("div");
    row.className = "port-ship";

    const head = document.createElement("div");
    head.className = "port-ship-head";
    const name = document.createElement("span");
    name.textContent = ship.name ?? ship.hullId ?? ship.id;
    const hull = document.createElement("span");
    hull.className = "port-ship-hull";
    hull.textContent = t("sea.port.fleetHull", {
      hull: fmtInt.format(Math.round(Number(ship.condition?.hull ?? 100))),
    });
    head.append(name, hull);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "port-ship-button";
    button.dataset.shipId = ship.id;
    const cost = repairCost(ship);
    button.textContent = t("sea.port.fleetButton", { gold: fmtInt.format(priceWithPurse(cost, gold)) });
    const offer = partialRepairOffer(cost);
    if (offer) button.textContent += ` · ${offer}`;
    button.disabled = gold <= 0 && cost > 0;
    button.classList.toggle("is-short", button.disabled);
    button.addEventListener("click", () => repairFleetShipAtPort(ship.id));

    row.append(head, button);
    container.append(row);
  }
}

/** The repair offer only exists while the hull is inside the home port (S22, S24). */
function updatePortPanel() {
  if (!els.portPanel) return;
  const docked = inHomePort() && !gameOver && playerCombat;
  els.portPanel.classList.toggle("is-hidden", !docked);
  if (!docked) return;
  const cost = repairCost(liveRepairShip(runtimeShip));
  els.portCost.textContent =
    cost === 0
      ? t("sea.port.repairNoDamage", { name: runtimeShip.name })
      : t("sea.port.repairCost", { gold: fmtInt.format(priceWithPurse(cost, gold)) });
  const offer = partialRepairOffer(cost);
  if (offer) els.portCost.textContent += ` · ${offer}`;
  // The price is a share of the hull's value, so the player can see what it follows (S40).
  if (els.portCost && cost > 0) {
    els.portCost.title = t("sea.port.repairShare", {
      share: fmtInt.format(REPAIR.shareOfPrice * 100),
    });
  }
  els.portCost.classList.toggle("is-short", cost > 0 && gold <= 0);
  renderPortFleet(damagedFleetShips(liveRepairFleet()));
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

  // What each beam is loaded with right now (S65), mixed rounds included.
  if (els.ammo) {
    const ammo = describeAmmo(playerCombat);
    const label = (side) =>
      ammo[side].id
        ? t(ammo[side].mixed ? "sea.ammo.mixed" : "sea.ammo.name", {
            ammo: localisedAmmo(ammo[side].id, t).name,
          })
        : t("sea.ammo.none");
    els.ammo.textContent = `${label("babor")} · ${label("estribor")}`;
  }
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
  for (let step = 0; step < ui.timeScale; step += 1) {
    // The captain's combat state rides along, so her shredded rig slows her (S89).
    world = updateWorld(world, gameOver ? {} : { ...readInput(), rigging: playerCombat }, dt);
    // The voyage eats the crew's reserve (S67). It runs on the world clock, so a
    // fast-forward burns it faster, exactly like everything else the sea does.
    if (!gameOver) burnVoyageSupply(dt);
    // Copy the newly calculated positions before synchronizing survivors for the next step.
    syncEscortsFromWorld();
    // An enemy that gave up the chase is no longer a target (S58), so the panel, the bars
    // and the auto-fire stop reading it before this tick's combat pass runs.
    dropDisengagedTargets();
    processCombat(dt, now);
    world = { ...world, escorts: escorts.map(({ combat, ...rest }) => rest) };
    dropTimeOnEngage();
    tickFx(dt);
  }
  goldEarned = world.gold;
  if (goldEarned > before) {
    gold += goldEarned - before;
    showBanner(t("sea.banner.treasure", { gold: fmtInt.format(goldEarned - before) }), "gold");
  }

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

  // The lost tramo of the bars runs on the world's clock, so it follows the fast-forward (S52).
  frameWorldDt = dt * ui.timeScale;

  const ctx = els.canvas.getContext("2d");
  drawSea(ctx);
  drawMinimap();
  drawWindRose(now);
  updateHud();
  updateDuelPanel();
  updatePortPanel();
  if (updatePortArrival()) return;
  hideBannerIfDue(now);

  requestAnimationFrame(frame);
}

function boot() {
  // The tuning settings are applied before anything reads a constant (S33): the
  // world, the wind and the combat model all read them live from here on. The catalogue
  // comes with them, so a saved fleet can resolve a hull the player created (S83).
  bootSettings();
  bootCatalogue();

  // The shipyard's automatic-fire check (S47): on unless the player turned it off.
  // The automatic-fire switch is a setting now (S88), so it arrives with the other
  // settings. The old key is still honoured for a save written before the move.
  let legacyAutoFire = null;
  try {
    legacyAutoFire = localStorage.getItem("barcos:autofire:v1");
  } catch {
    legacyAutoFire = null;
  }
  ui.autoFire = legacyAutoFire === null ? Boolean(AUTOFIRE.enabled) : normaliseAutoFire(legacyAutoFire);

  const savedGame = loadSavedGame();
  const savedWorld = savedGame?.world ? deserializeWorld(savedGame.world) : null;

  const worldSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  world =
    savedWorld && Math.abs(savedWorld.ship.speedKn - runtimeShip.speedKn) < 1
      ? savedWorld
      : createWorld(worldSeed, { speedKn: runtimeShip.speedKn }, 0);

  // The captain turns at her own hull's rate (S48), whatever the saved sea says: she may
  // not be the hull that last sailed it.
  world = { ...world, ship: { ...world.ship, turnFactor: hullTurnFactor(runtimeShip.hullId) } };

  gold = normaliseGold(savedGame?.gold);
  // The reserve starts as the captain's bought days of provisions (S67), and the sea
  // save is fresher than the fleet sheet, as it is for damage and crew.
  const savedSupply = Number(savedGame?.supplyLeftS);
  supplyLeftS = Number.isFinite(savedSupply) && savedSupply >= 0
    ? savedSupply
    : supplySeconds(runtimeShip?.days ?? 0);
  supplyWarned = supplyLeftS <= 0;

  // The yard (S74). Her damage, garrison and the player's victories come from the save,
  // so a captured or battered yard is still that after a reload.
  victories = Math.max(0, Math.floor(Number(savedGame?.victories) || 0));
  const savedFort = savedGame?.fort;
  // Bought guns travel with the fort state (S100): a reinforced yard stays reinforced.
  fortCombat = createFortCombatant({ victories, boughtGuns: savedFort?.boughtGuns });
  if (savedFort && typeof savedFort === "object") {
    fortCombat.condition = { ...fortCombat.condition, ...savedFort.condition };
    fortCombat.crew = { ...fortCombat.crew, ...savedFort.crew };
    if (savedFort.status) fortCombat.status = savedFort.status;
    if (Number.isFinite(Number(savedFort.boughtGuns))) {
      fortCombat.boughtGuns = Math.max(0, Math.floor(Number(savedFort.boughtGuns)));
    }
    // A yard the enemy held when the player left is still theirs (S93).
    if (savedFort.occupation && typeof savedFort.occupation === "object") {
      fortCombat.occupation = {
        condition: { ...savedFort.occupation.condition },
        crew: { ...savedFort.occupation.crew },
        initialCrew: Math.max(1, Number(savedFort.occupation.initialCrew) || 1),
        crewDamagePool: Number(savedFort.occupation.crewDamagePool) || 0,
      };
    }
    refreshStatus(fortCombat);
  }
  goldEarned = normaliseGold(world.gold);

  // The hulls that put to sea with the captain (S35, S36): everything marked to sail.
  escorts = sailingShips(fleet)
    .filter((ship) => ship.id !== runtimeShip?.id)
    .map((ship, index) => {
    const combatant = createPlayerCombatant(ship);
    const saved = savedGame?.combat?.escorts?.[ship.id];
    if (saved) {
      // The sea save is fresher than the fleet sheet (S23): the damage from the last
      // voyage wins, or an escort would come back whole after being shot to pieces.
      combatant.condition = { ...combatant.condition, ...saved.condition };
      combatant.crew = { ...combatant.crew, ...saved.crew };
    }
    // Neither a saved sea nor the fleet sheet may bring a lost hull back fighting.
    refreshStatus(combatant);
    const place = (world.escorts ?? []).find((entry) => entry.id === ship.id);
    const escort = createEscort(
      { id: ship.id, speedKn: ship.speedKn, turnFactor: hullTurnFactor(ship.hullId) },
      world.ship,
      index,
    );
    return {
      ...escort,
      ...(place ? { x: place.x, y: place.y, heading: place.heading, currentSpeedKn: place.currentSpeedKn } : {}),
      name: ship.name,
      combat: combatant,
    };
  });
  world = { ...world, escorts: escorts.map(({ combat, ...rest }) => rest) };

  // Restore the guns from the autosave, or rig the ship out of the shipyard sheet.
  playerCombat = createPlayerCombatant(runtimeShip);
  const savedCombat = savedGame?.combat?.player;
  if (savedCombat && typeof savedCombat === "object") {
    // The sea save is the fresher of the two, because the fleet sheet is written
    // every three seconds and the sea save right after combat (S23). Her damage and crew
    // count even when the guns state is gone: a refit drops the saved pieces (the new
    // guns are rebuilt from the fleet sheet) but keeps her damage (S50).
    playerCombat.condition = { ...playerCombat.condition, ...savedCombat.condition };
    playerCombat.crew = { ...playerCombat.crew, ...savedCombat.crew };
  }
  if (savedCombat && Array.isArray(savedCombat.pieces)) {
    playerCombat.pieces = playerCombat.pieces.map((piece, index) => {
      const saved = savedCombat.pieces[index];
      if (!saved) return piece;
      // The round the player chose in the fight comes back with the guns (S65), but only
      // when the piece is the same one and she can actually fire it: a refit can put a
      // different gun in that slot.
      const samePiece = !saved.pieceId || saved.pieceId === piece.pieceId;
      const carries = samePiece && pieceById(piece.pieceId).ammo.includes(saved.ammoId);
      return {
        ...piece,
        ...(carries ? { ammoId: saved.ammoId } : {}),
        shotsLeft: saved.shotsLeft ?? piece.shotsLeft,
        reloadTimer: saved.reloadTimer ?? 0,
      };
    });
  }
  // Preserve a fractional repair only when it still agrees with the men aboard.
  const crewFromMen = Math.min(
    100,
    Math.round((100 * totalAboard(playerCombat.crew)) / playerCombat.initialCrew),
  );
  const savedCrewCondition = savedCombat && typeof savedCombat === "object"
    ? savedCombat.condition?.crew
    : runtimeShip.condition?.crew;
  playerCombat.condition.crew = Number.isFinite(savedCrewCondition) &&
    savedCrewCondition >= 0 && savedCrewCondition <= 100 && Math.round(savedCrewCondition) === crewFromMen
    ? savedCrewCondition
    : crewFromMen;
  if (playerCombat.condition.hull <= 0 || playerCombat.condition.crew <= COMBAT.surrenderCrewPct) {
    playerCombat.status = playerCombat.condition.hull <= 0 ? "sunk" : "surrendered";
  }

  applyStaticTranslations();
  const handedOver = handOverCommand();
  if (!handedOver && squadronStatus(allies()).over) {
    gameOver = true;
    gameOverAt = 0;
  }
  renderTimeBadge();
  // Opening inside is not an arrival; leaving and returning arms the next one.
  wasInPort = inHomePort();
  setInterval(saveGame, 3000);
  window.addEventListener("beforeunload", saveGame);
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  updateHud();
  if (!handedOver) showBanner(t("sea.banner.depart", { name: runtimeShip.name }), "info", 2800);
  requestAnimationFrame(frame);
}

if (runtimeShip) {
  boot();
} else {
  // No ship in the water: the sea has nothing to sail. Back to the shipyard.
  window.location.replace("./index.html");
}
