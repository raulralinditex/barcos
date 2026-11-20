/**
 * Sea screen: real-time sailing over the zone world.
 *
 * All rules live in ../model/world.js; this file only renders the world, reads the
 * keyboard and autosaves. Spanish labels (S10), English identifiers (S10).
 */

import { SHIPYARDS, ammoById, hullById, pieceById } from "../data/naval-data.js";
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
  setFleetAmmo,
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
  mergeSeaFleet,
  removeShip,
  withLiveCondition,
  shipsSailingAtSea,
  shipsAvailableAtYard,
  serializeFleet,
  setCaptain,
  squadrons as fleetSquadrons,
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
import { awardHold, bindGameTime, defeatedHold, enemyHoldFor, normaliseMarkets, recoverMarkets } from "../model/commerce.js";
import { isWreck, wreckHull } from "../model/sinking.js";
import { isOutOfAmmo } from "../model/rearm.js";
import { bootSettings } from "../model/settings-storage.js";
import { bootCatalogue } from "../model/catalogue-storage.js";
import { AUTOFIRE } from "../model/settings.js";
import { DANGER, dangerValue } from "../model/danger.js";
import { GAME_TIME, supplySeconds } from "../model/game-time.js";
import { voyageClock } from "../model/voyage-clock.js";
import { buildReserves, burnReserves, squadronSupply, wagesFor } from "../model/supply.js";
import {
  closestTarget,
  escortFire,
  nextCommandShip,
  pruneAllies,
  squadronStatus,
} from "../model/squadron.js";
import { createEscort, prizeJoiningSquadron } from "../model/formation.js";
import { hasEnemyInGunshot, hullBarShare, timeScaleOnEngage } from "../model/sea-hud.js";
import { flagColours, flagFor, yardFlag } from "../model/flag.js";
import { normaliseCountry } from "../model/country.js";
import { conditionShare, dangerLabel, duelRoster, duelVisible } from "../model/duel-panel.js";
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
import { hullTurnFactor, shipTurnFactor } from "../model/turning.js";
import { createTrail, stepTrail, trailWidthPx } from "../model/damage-trail.js";
import { normaliseAutoFire, targetForSide } from "../model/autofire.js";
import { priceWithPurse } from "../model/repair.js";
import { captureableShip, withPrize } from "../model/sale.js";
import {
  WORLD,
  afloatSquadrons,
  clampToSafeZone,
  insideSafeZone,
  nearestSquadron,
  safeZoneRadiusM,
  withActiveSquadron,
  ZONE_BANDS,
  createWorld,
  deserializeWorld,
  hullSpec,
  markDefeated,
  nearestEncounter,
  recordVictory,
  serializeWorld,
  updateWorld,
  zoneAtRadius,
  currentShipyard,
} from "../model/world.js";
import { toughnessForLevel } from "../model/levels.js";
import { canBoard, deckFire } from "../model/boarding.js";
import {
  ORDER,
  clearOrder,
  destinationOrder,
  orderDistance,
  orderDone,
  orderProgress,
  pickUpOrder,
  steerTowards,
} from "../model/orders.js";

const SHIP_KEY = "barcos:current-ship:v1";
const FLEET_KEY = "barcos:fleet:v1";
const GAME_KEY = "barcos:game:v1";
const COUNTRY_KEY = "barcos:country:v1";

/**
 * The country the player selected in the shipyard: it is the colours of every hull of
 * the fleet and of every yard. Read once when the sea opens, because the country can only
 * change in the shipyard; unreadable storage means the default country.
 */
const playerCountry = (() => {
  try {
    return normaliseCountry(localStorage.getItem(COUNTRY_KEY));
  } catch {
    return normaliseCountry(null);
  }
})();

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
  voyageDays: $("#voyage-days"),
  voyageUpkeep: $("#voyage-upkeep"),
  voyageGoldDays: $("#voyage-gold-days"),
  voyageWorst: $("#voyage-worst"),
  voyageDry: $("#voyage-dry"),
  zone: $("#hud-zone"),
  throttle: $("#hud-throttle"),
  speed: $("#hud-speed"),
  heading: $("#hud-heading"),
  hull: $("#hud-hull"),
  rigging: $("#hud-rigging"),
  crew: $("#hud-crew"),
  rounds: $("#hud-rounds"),
  ammo: $("#hud-ammo"),
  oarsRow: $("#hud-oars-row"),
  oars: $("#hud-oars"),
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
const fmtUpkeep = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

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
let markets = {};
// What the sea has not yet applied to the stored record (S151): the clock the ports recover
// on, and the purse as the sea last agreed it with that record.
let marketElapsedS = 0;
let goldSynced = 0;
let playerCombat = null;
/**
 * The crew's reserve of every hull at sea, in seconds of game time, keyed by hull id
 * (S67, S132). Each hull carries her own `days` of provisions expressed in the clock the
 * sea runs on, and burns only her own: a hull moored at a shipyard is not in the map at
 * all, so she cannot spend a drop. The model in ../model/supply.js owns the rules; this
 * is only the live copy.
 */
let supplyByHull = {};
/** Whether the player has been told her guns are dry (S121). */
let dryWarned = false;
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
/**
 * The squadrons that are not holding the helm, as the sea screen keeps them (S155-D).
 *
 * Each one is `{ id, name, ship, escorts, order }`: her own captain hull, her own formation
 * and the standing orders she was last given. `world.squadrons` is the same list as the
 * model sees it; this is the live copy that carries each captain's combatant, exactly as
 * `escorts` carries the active squadron's.
 */
let squadrons = [];
/**
 * The combatant of every captain afloat, keyed by hull id (S155-C). The active captain's
 * lives in `playerCombat`, as it always has; the others live here, so a second command is a
 * fighting command and not a drawing on the water.
 */
let captainCombat = new Map();
/**
 * What the active squadron was ordered to do besides the helm (S155-F/G): a destination she
 * is sailing to, or the pick-up mode that chases the golden buoys. `null` means the helm is
 * the player's and the order is over. Toggling the helm cancels it, which is the rule the
 * player was promised: taking the wheel ends the order.
 */
let activeOrder = null;
// The initial position is seeded at boot, so only movement into port counts.
let wasInPort = false;
/** The level the sea is showing, so a clear is announced once (S140-G). */
let announcedLevel = 1;
/** A cleared level whose banner is waiting for the current one to finish (S140-G). */
let pendingLevel = null;

/** The provision days the shipyard sheet gives one hull (S132). */
function shipDays(shipId) {
  return (fleet?.ships ?? []).find((ship) => ship.id === shipId)?.days ?? 0;
}

/**
 * What the voyage owns of the fleet sheet (S151).
 *
 * `lostHullIds` are the hulls this voyage took out of the fleet, and `seaHoldsChanged`
 * are the hulls whose hold the sea itself loaded (a prize taken aboard, S115) or emptied
 * (a hull kept as a wreck, S116). Both are the exceptions the merge is allowed to write;
 * everything else about a hull belongs to the yard. Neither set is ever inferred from a
 * diff, so the sea cannot claim a hold it did not touch.
 *
 * A lost hull stays listed for the whole voyage: she must not come back from the stored
 * sheet on the next autosave. A claimed hold is consumed by the write that publishes it —
 * once the sheet agrees with the sea, the claim has done its job, and keeping it would let
 * the sea overwrite a purchase made afterwards, which is the very bug this closes.
 */
const lostHullIds = new Set();
const seaHoldsChanged = new Set();

/* ---------------------------------------------------------------- persistence */

/** Write the fleet back after it changed (a lost escort, a repair). */
function saveFleetState() {
  writeFleetSave();
}

/**
 * The only place the sea writes the fleet sheet (S151).
 *
 * The page's `fleet` is a copy taken when the sea opened, and writing it whole erased
 * whatever the yard bought afterwards: the player watched her hold empty itself and the
 * port's stock return to rest without selling a barrel. So the sheet is read fresh and
 * merged: the voyage contributes only what it observed or did, and every other field of
 * every hull stays as the yard last wrote it.
 */
function writeFleetSave() {
  try {
    const stored = deserializeFleet(localStorage.getItem(FLEET_KEY), legacyShip);
    const live = withLiveCondition(fleet, [
      { id: runtimeShip?.id, combat: playerCombat },
      ...escorts.map((escort) => ({ id: escort.id, combat: escort.combat })),
    ]);
    fleet = mergeSeaFleet(stored, live, {
      removed: [...lostHullIds],
      holdsChanged: [...seaHoldsChanged],
    });
    localStorage.setItem(FLEET_KEY, serializeFleet(fleet));
    // The sheet now agrees with the sea about those holds, so the claim is spent.
    seaHoldsChanged.clear();
  } catch {
    /* storage disabled: the change still lives in memory */
  }
}

/**
 * Settle the two figures the yard also writes into the sea save (S151).
 *
 * The purse and the ports' stock live in the same record the yard edits. The sea only ever
 * moves them by what it did — gold earned or spent on the voyage, and the clock that lets a
 * port recover — so it applies those movements to the record as it stands now instead of
 * writing the figures it remembered from when it opened. Otherwise a purchase made in the
 * yard while the sea was alive was refunded and the port's stock rolled back.
 */
function settleSharedGameFigures() {
  const stored = loadSavedGame();
  if (stored) {
    gold = Math.max(0, normaliseGold(stored.gold) + (gold - goldSynced));
    markets = normaliseMarkets(stored.markets);
  }
  markets = recoverMarkets(markets, marketElapsedS);
  marketElapsedS = 0;
  goldSynced = gold;
}

function saveGame() {
  if (!world) return;
  try {
    settleSharedGameFigures();
    world = { ...world, gold: goldEarned };
    const payload = {
      gold,
      markets,
      // The captain's own reserve, kept in the old key so the sea save stays readable
      // (S132): a save written before the per-hull rule only has this one.
      supplyLeftS: Number(supplyByHull[runtimeShip?.id]) || 0,
      // The squadron's reserves, one per hull (S132). `supplyLeftS` stays as the
      // captain's own reserve so a save written before the rule still opens with her
      // days, exactly as it did when the single reserve was the whole squadron's.
      supplyByHull: { ...supplyByHull },
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
                {
                  condition: escort.combat.condition,
                  crew: escort.combat.crew,
                  // Her racks ride with her (S122). Without this an escort came out of a
                  // fight dry, the yard sold her the rounds back, and the next voyage
                  // re-rigged her out of the fleet sheet as if nothing had happened: the
                  // rearm was paid for and forgotten.
                  pieces: (escort.combat.pieces ?? []).map((p) => ({
                    pieceId: p.pieceId,
                    side: p.side,
                    ammoId: p.ammoId,
                    shotsLeft: p.shotsLeft,
                    reloadTimer: p.reloadTimer,
                  })),
                },
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
            // Every other command's damage and rounds (S155-C): a captain the player is not
            // steering still took hits and spent powder, and she has to come back that way.
            squadrons: {
              escorts: Object.fromEntries(
                squadrons.flatMap((squadron) =>
                  (squadron.escorts ?? [])
                    .filter((escort) => escort.combat)
                    .map((escort) => [
                      escort.id,
                      {
                        condition: escort.combat.condition,
                        crew: escort.combat.crew,
                        pieces: (escort.combat.pieces ?? []).map((p) => ({
                          pieceId: p.pieceId,
                          side: p.side,
                          ammoId: p.ammoId,
                          shotsLeft: p.shotsLeft,
                          reloadTimer: p.reloadTimer,
                        })),
                      },
                    ]),
                ),
              ),
              ...Object.fromEntries(
                [...captainCombat.entries()].map(([id, combat]) => [
                  id,
                  {
                    condition: combat.condition,
                    crew: combat.crew,
                    pieces: (combat.pieces ?? []).map((p) => ({
                      pieceId: p.pieceId,
                      ammoId: p.ammoId,
                      shotsLeft: p.shotsLeft,
                      reloadTimer: p.reloadTimer,
                    })),
                  },
                ]),
              ),
            },
          }
        : undefined,
    };
    localStorage.setItem(GAME_KEY, JSON.stringify(payload));
    // The damage also lives on the hull itself, so it survives the way back to the
    // shipyard and a change of captain (S23). Every hull, not only the captain (S90): an
    // escort's damage used to stay in the sea save alone, so the shipyard quoted her
    // repair from a stale sheet. The hold of a hull the sea loaded rides with her too
    // (S114), but only that one: see `writeFleetSave` for why the sheet is merged (S151).
    writeFleetSave();
  } catch {
    /* storage disabled: the voyage continues in memory */
  }
}

/* ---------------------------------------------------------------- input */

const THROTTLE_STEP = 0.25;

/**
 * Whether the captain is moored at a shipyard (S22, S112). The yards are data now, so
 * this asks the table instead of measuring against a radius written here: a new yard is
 * a row, and the repair and the arrival open at her without touching this file.
 */
function inHomePort() {
  return world ? Boolean(currentShipyard({ x: world.ship.x, y: world.ship.y })) : false;
}

/** The yard the captain is moored at right now, or null at sea (S112). */
function mooredShipyard() {
  return world ? currentShipyard({ x: world.ship.x, y: world.ship.y }) : null;
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
  const yardId = mooredShipyard()?.id;
  return { ...fleet, ships: shipsAvailableAtYard(fleet, yardId, yardId).map(liveRepairShip) };
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
  const ship = liveRepairFleet().ships.find((entry) => entry.id === shipId);
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
  // Arriving at the yard opens the buy room (S109): the player comes back to buy or
  // refit, not to stare at a fleet list she just sailed. The hash is the room's name,
  // the same one config.html redirects with.
  window.location.href = "./index.html#comprar";
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
 * Load the guns with the round a key stands for (S65, S127). The guns that cannot fire it
 * keep the round they already had, and the banner says how many of each, so the player can
 * see that a 32-pounder did not follow the order.
 *
 * The order is the whole squadron's (S127): when the captain changes ammunition every
 * escort that can fire that round changes with her, because the fleet is one command.
 */
function chooseAmmunition(key) {
  const ammoId = ammoKeyAmmoId(key);
  if (!ammoId || !playerCombat) return;
  const result = setFleetAmmo(playerCombat, escorts, ammoId);
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
  } else if (key === "c") {
    // One key cycles the helm through the squadrons afloat (S155-D/E): the sea shows every
    // captain, and the mouse picks one, but the keyboard has to be able to as well.
    event.preventDefault();
    if (!event.repeat) cycleSquadron();
  } else if (key === "g") {
    // The pick-up order (S155-G): the active captain works the golden buoys by herself.
    event.preventDefault();
    if (!event.repeat) toggleCollectOrder();
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
  // Taking the wheel ends whatever order was live (S155-F): the player is sailing now, and a
  // destination that kept steering under her hands would be a second captain on the same hull.
  const steering = left || right;
  if (steering && activeOrder) {
    activeOrder = clearOrder();
    showBanner(t("sea.banner.orderCancelled"), "info", 1800);
  }
  // An order sets the helm and the sail; the helm keys still win when they are held.
  if (activeOrder && !steering) {
    const steered = steerTowards(world.ship, activeOrder);
    const sailFactor = playerCombat ? speedFactor(playerCombat) : 1;
    const helmFactor = playerCombat ? maneuverFactor(playerCombat) : 1;
    return { turn: steered.turn * helmFactor, throttle: steered.throttle * sailFactor };
  }
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

  // Every shipyard, from the table (S112): a new yard appears here without touching
  // this function, which is the whole point of the list being data.
  for (const yard of SHIPYARDS) {
    ctx.beginPath();
    ctx.arc(yard.x, yard.y, yard.mooringM, 0, Math.PI * 2);
    ctx.fillStyle = "#8a7a55";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(yard.x, yard.y, yard.mooringM * 0.64, 0, Math.PI * 2);
    ctx.fillStyle = "#a9955f";
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "600 90px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚓", yard.x, yard.y + 32);
    drawYardFlag(ctx, yard);
  }

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
  drawDestinationMark(ctx);
  drawPlayerShip(ctx);
  drawOtherCaptains(ctx);
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
  for (const squadron of squadrons) {
    for (const escort of squadron.escorts ?? []) drawEscortShip(ctx, escort, { active: false });
  }
  ctx.restore();
}

/**
 * The mark of the order in force (S155-F): where the active squadron is sailing to, and how
 * far it still is. A crossing on the water, so the player can see the order she gave instead
 * of inferring it from the wake.
 */
function drawDestinationMark(ctx) {
  if (!activeOrder || !Number.isFinite(activeOrder.x) || !Number.isFinite(activeOrder.y)) return;
  const now = performance.now();
  const pulse = 0.6 + 0.4 * Math.sin(now / 320);
  ctx.save();
  ctx.translate(activeOrder.x, activeOrder.y);
  ctx.strokeStyle = activeOrder.kind === ORDER.pickUp
    ? `rgba(224,168,21,${0.5 + 0.5 * pulse})`
    : `rgba(143,208,255,${0.5 + 0.5 * pulse})`;
  ctx.lineWidth = 8;
  // A crossing: two strokes, drawn in world units so it keeps its size relative to the sea.
  const arm = 70;
  ctx.beginPath();
  ctx.moveTo(-arm, -arm);
  ctx.lineTo(arm, arm);
  ctx.moveTo(arm, -arm);
  ctx.lineTo(-arm, arm);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 110, 0, Math.PI * 2);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
}

/**
 * Every captain that is not holding the helm (S155-C), drawn with her own hull and colours
 * and marked so the player can tell which command she is looking at.
 *
 * The active captain has her own renderer (`drawPlayerShip`) because she carries the helm
 * indicator. These do not: they are hulls under a standing order, and the ring around them
 * is the only thing that says "this one is a captain too, and you can take her".
 */
function drawOtherCaptains(ctx) {
  const now = performance.now();
  for (const squadron of squadrons) {
    const ship = squadron.ship;
    if (!ship || !Number.isFinite(ship.x) || !Number.isFinite(ship.y)) continue;
    const record = (fleet?.ships ?? []).find((entry) => entry.id === squadron.id) ?? null;
    drawHullShape(ctx, ship, record?.hullId ?? runtimeShip.hullId, { ring: true, now });
  }
}

/**
 * The hull of any captain, drawn the same way whoever she is (S155-C). `ring` marks the ones
 * the player can take the helm of, which is every captain she is not already steering.
 */
function drawHullShape(ctx, ship, hullId, { ring = false, now = 0 } = {}) {
  const hull = hullById(hullId);
  const lengthRatio = hull ? Math.min(1.5, Math.max(0.7, hull.lengthM / 25)) : 1;
  const len = 70 * lengthRatio;
  const beam = 26 * lengthRatio;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.heading ?? 0);

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
  drawFlag(ctx, flagFor({ hullId, isFleet: true, captainHullId: captainHull, country: playerCountry }), {
    x: -len * 0.3,
    size: 22,
  });
  ctx.restore();

  if (!ring) return;
  // A captain the player is not steering: a pulsing ring in the fleet's colour, so a sea with
  // three commands is readable at a glance instead of three identical hulls.
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  ctx.save();
  ctx.beginPath();
  ctx.arc(ship.x, ship.y, len * 0.85, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(143,208,255,${0.25 + 0.45 * pulse})`;
  ctx.lineWidth = 6;
  ctx.stroke();
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
  /** The danger number over the condition block (S142): a calm sand, not a warning red. */
  danger: "#bfe3c9",
  dangerBack: "rgba(8,14,22,0.72)",
};

/** Whether the danger number is painted at all (S142-D): the player's switch, read live. */
function dangerVisible() {
  return Number(DANGER.show) > 0;
}

/**
 * The danger badge of one hull (S142-C): the number, in screen space, centred over the
 * condition block of the hull. It is a label like the bars are, painted with the same
 * scale for every ship, so two hulls can be compared at a glance.
 */
function drawDangerBadge(ctx, centreX, centreY, rowCount, danger) {
  // The badge is a label: an unreadable number paints nothing instead of a NaN (S142).
  const value = dangerLabel(danger);
  if (value === null) return;
  const text = fmtInt.format(value);
  ctx.save();
  ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + 10;
  const height = 14;
  const blockHeight = rowCount * (BAR.height + BAR.gap) + BAR.padding * 2 - BAR.gap;
  // Just above the block, so it never covers the bars it belongs to.
  const y = centreY - blockHeight / 2 - height / 2 - 2;
  ctx.fillStyle = BAR.dangerBack;
  ctx.fillRect(centreX - width / 2, y - height / 2, width, height);
  ctx.strokeStyle = BAR.frame;
  ctx.lineWidth = 1;
  ctx.strokeRect(centreX - width / 2 + 0.5, y - height / 2 + 0.5, width - 1, height - 1);
  ctx.fillStyle = BAR.danger;
  ctx.fillText(text, centreX, y);
  ctx.restore();
}

/** World metres to screen pixels, without the camera translation. */
function toScreen(x, y) {
  return {
    x: window.innerWidth / 2 + (x - world.ship.x) * PX_PER_M,
    y: window.innerHeight / 2 + (y - world.ship.y) * PX_PER_M,
  };
}

/**
 * Screen pixels back to world metres (S155-E). The camera always looks at the squadron under
 * the helm, so this is the inverse of `toScreen` and the only way a click can name a point of
 * the sea.
 */
function toWorld(px, py) {
  return {
    x: world.ship.x + (px - window.innerWidth / 2) / PX_PER_M,
    y: world.ship.y + (py - window.innerHeight / 2) / PX_PER_M,
  };
}

/**
 * The mouse picks a captain (S155-E): a click on one of them takes the helm, and a click on
 * open water is not an order, so it leaves the command alone.
 *
 * The radius is generous on purpose. A captain is drawn about 28 px long, and asking the
 * player to hit that on a moving sea is a game of reflexes, not a choice of command.
 */
const CAPTAIN_CLICK_RADIUS_M = 90;

function squadronAtPointer(event) {
  if (!world || !els.canvas) return null;
  const rect = els.canvas.getBoundingClientRect();
  const at = toWorld(event.clientX - rect.left, event.clientY - rect.top);
  return nearestSquadron(world, at, CAPTAIN_CLICK_RADIUS_M);
}

els.canvas?.addEventListener("click", (event) => {
  const picked = squadronAtPointer(event);
  if (picked) chooseSquadron(picked.id);
});

/**
 * A double click gives the active squadron a destination (S155-F).
 *
 * The point is where the player clicked, not the hull nearest to it: an order is a place on
 * the sea. A double click on another captain takes her helm instead, which is why the pick
 * wins over the order when both could fire.
 */
els.canvas?.addEventListener("dblclick", (event) => {
  if (!world || gameOver) return;
  const picked = squadronAtPointer(event);
  if (picked) {
    chooseSquadron(picked.id);
    return;
  }
  const rect = els.canvas.getBoundingClientRect();
  const at = toWorld(event.clientX - rect.left, event.clientY - rect.top);
  const order = destinationOrder(at, world.ship);
  if (!order) return;
  activeOrder = order;
  showBanner(t("sea.banner.destination", { distance: fmtInt.format(Math.round(order.distanceM)) }), "info", 2200);
});

/**
 * The pick-up order (S155-G): the active captain works the golden buoys by herself. A second
 * press abandons the order, and with no buoy left the sea says so instead of doing nothing.
 */
function toggleCollectOrder() {
  if (!world || gameOver) return;
  if (activeOrder?.kind === ORDER.pickUp) {
    activeOrder = clearOrder();
    showBanner(t("sea.banner.collectOff", { name: runtimeShip.name }), "info", 2000);
    return;
  }
  const order = pickUpOrder(world.ship, world.encounters);
  if (!order) {
    showBanner(t("sea.banner.collectNone"), "info", 2000);
    return;
  }
  activeOrder = order;
  showBanner(t("sea.banner.collectOn", { name: runtimeShip.name }), "info", 2400);
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
 *
 * `danger` is the informational danger number of the hull (S142-C): it is painted as a
 * badge on the condition block, next to the bars, so every ship at sea carries it.
 * It is painted, never read back: no rule of the fight sees it (S142-B).
 */
function drawBarsFor(ctx, combatant, x, y, distanceM, heading, scale, widthShare = 1, danger = 0) {
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
  if (dangerVisible()) drawDangerBadge(ctx, stern.x, stern.y, conditionRows.length, danger);

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
      // The danger number is painted over the bars of every hull in view (S142-C),
      // ours and theirs, in the same scale, so two ships read side by side.
      dangerValue(ship.combatant),
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

/**
 * The flag of a shipyard: a mast on the quay with the player's colours streaming from it.
 * A yard the enemy holds flies none, because it is not hers to fly (S93).
 */
function drawYardFlag(ctx, yard) {
  if (yard.home && fortCombat && fortHeldByEnemy(fortCombat)) return;
  const x = yard.x + yard.mooringM * 0.42;
  const y = yard.y - yard.mooringM * 0.42;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.arc(0, 0, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#3a4048";
  ctx.fill();
  drawFlag(ctx, yardFlag(playerCountry), { x: 0, size: 48 });
  ctx.restore();
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
 *
 * The whole line draws hers (S107): every hull that sails with the captain shows the
 * reach of her own guns, so the player can see which escort actually covers the enemy
 * instead of guessing from a hull that looks like the others.
 */
function drawRangeCircles(ctx) {
  if (!playerCombat || !world) return;
  drawRangeArcs(ctx, playerCombat, world.ship.x, world.ship.y, world.ship.heading ?? 0, { captain: true });
  for (const escort of escorts) {
    if (!escort.combat) continue;
    drawRangeArcs(ctx, escort.combat, escort.x, escort.y, escort.heading ?? 0, { captain: false });
  }
}

/**
 * One combatant's two beams (S68, S107). The captain's arcs are the bright ones: hers are
 * the guns the player is aiming, and an escort's arc must not read as loud as that.
 */
function drawRangeArcs(ctx, combatant, x, y, heading, { captain }) {
  for (const side of ["babor", "estribor"]) {
    const radius = rangeCircleM(combatant, side);
    if (!(radius > 0)) continue;
    // Starboard bears at heading + 90°, port at heading - 90°, as everywhere else.
    const centre = heading + (side === "estribor" ? 1 : -1) * (Math.PI / 2);
    // A beam whose guns are all loaded and ready is drawn solid: that is the beam that
    // can fire right now, so the arcs also say which side is live (S71).
    const ready = loadedShare(combatant, side) >= 1;
    const opening = captain && openingBonus(combatant, side).damage > 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, centre - COMBAT.arcHalf, centre + COMBAT.arcHalf);
    const hue = side === "estribor" ? "143,208,255" : "224,168,21";
    // An escort's reach is thinner and fainter: it is information, not the player's aim.
    const alpha = captain ? (ready ? 0.85 : 0.26) : (ready ? 0.5 : 0.16);
    ctx.strokeStyle = `rgba(${hue},${alpha})`;
    ctx.lineWidth = captain ? (ready ? 9 : 6) : (ready ? 5 : 3.5);
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
  const flag = flagFor({ hullId: runtimeShip.hullId, isFleet: true, captainHullId: runtimeShip.hullId, country: playerCountry });
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
function drawEscortShip(ctx, escort, { active = true } = {}) {
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
  // A hull under another captain's command is drawn dimmer (S155-C): she is on the sea and
  // she is ours, but she is not the one taking orders from this keyboard.
  ctx.fillStyle = active ? "#3c5a7a" : "#2c4257";
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
  drawFlag(ctx, flagFor({ hullId: ship?.hullId, isFleet: true, captainHullId: captainHull, country: playerCountry }), {
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

  // Every shipyard on the chart (S118): the market is a place, so the player has to be
  // able to see where the next one lies before deciding to cross for a price.
  //
  // A yard the enemy holds is the one mark on this chart that has to say more than
  // "here" (S123): she is the objective of a siege, and her garrison is what the fight is
  // against. Drawn at real size it would be a single dot, so her mark and her bar are
  // drawn in screen units, after undoing the world scale, or they would shrink with the
  // chart and be unreadable.
  const markPx = 1 / scale;
  for (const yard of SHIPYARDS) {
    const held = yard.home && fortCombat && fortHeldByEnemy(fortCombat);
    ctx.beginPath();
    ctx.arc(yard.x, yard.y, 120, 0, Math.PI * 2);
    ctx.fillStyle = held ? "#d0503c" : "#a9955f";
    ctx.fill();

    if (!held) continue;
    // The garrison, as a bar over the yard: how much fight the occupiers have left.
    // Sized in screen pixels (46 × 6 on a 170 px chart) and lifted nine pixels over the
    // dot, because the world scale would turn a readable bar into a sliver.
    const w = 46 * markPx;
    const h = 6 * markPx;
    const gap = 3 * markPx;
    const left = yard.x - w / 2;
    const top = yard.y - 9 * markPx - h;
    const share = Math.max(0, Math.min(100, fortOccupierCondition(fortCombat))) / 100;
    ctx.fillStyle = "rgba(12,20,30,0.85)";
    ctx.fillRect(left - gap, top - gap, w + gap * 2, h + gap * 2);
    ctx.fillStyle = "#d0503c";
    ctx.fillRect(left, top, w * share, h);
  }

  for (const encounter of world.encounters) {
    ctx.beginPath();
    ctx.arc(encounter.x, encounter.y, 90, 0, Math.PI * 2);
    ctx.fillStyle =
      encounter.type === "enemy" ? "#d0503c" : "#e0a815";
    ctx.fill();
  }

  // the escorts, smaller and in their own colour (S42)
  for (const escort of escorts) {
    drawMinimapHull(ctx, escort, "#8fd0ff");
  }
  // Every other command on the chart (S155-C): her escorts and her captain, so the player can
  // see where the squadron she is not steering is without leaving the one she has.
  for (const squadron of squadrons) {
    for (const escort of squadron.escorts ?? []) drawMinimapHull(ctx, escort, "#6fa8c8");
    if (squadron.ship) drawMinimapHull(ctx, squadron.ship, "#b6e2ff");
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

/** One hull on the chart, as a small arrow in the colour of her command (S155-C). */
function drawMinimapHull(ctx, hull, colour) {
  if (!hull || !Number.isFinite(hull.x) || !Number.isFinite(hull.y)) return;
  ctx.save();
  ctx.translate(hull.x, hull.y);
  ctx.rotate(hull.heading ?? 0);
  ctx.beginPath();
  ctx.moveTo(150, 0);
  ctx.lineTo(-95, -80);
  ctx.lineTo(-95, 80);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
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
    // The level of the sail decides how tough she is (S140-D): the hull she was seeded
    // with, or the sea's level when she was seeded before levels existed.
    const level = Number.isFinite(encounter.level) ? encounter.level : world.level;
    encounter.combat = createEnemyCombatant(
      encounter,
      currentZone(),
      world.seed,
      toughnessForLevel(level),
    );
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

/**
 * The rounds a saved battery comes back with (S65, S122): the piece the player chose survives
 * a reload, but only when the gun in that slot can actually fire it, because a refit can put a
 * different one there.
 */
function restorePieces(pieces, saved) {
  if (!Array.isArray(saved)) return pieces;
  return pieces.map((piece, index) => {
    const stored = saved[index];
    if (!stored) return piece;
    const samePiece = !stored.pieceId || stored.pieceId === piece.pieceId;
    const carries = samePiece && pieceById(piece.pieceId).ammo.includes(stored.ammoId);
    return {
      ...piece,
      ...(carries ? { ammoId: stored.ammoId } : {}),
      shotsLeft: stored.shotsLeft ?? piece.shotsLeft,
      reloadTimer: stored.reloadTimer ?? 0,
    };
  });
}

/**
 * Every captain afloat, each with her own combatant (S155-C).
 *
 * The active captain is `playerCombat`; the others are in `captainCombat`. A squadron whose
 * combatant was never built is skipped instead of crashing the sea: the enemies aim at
 * hulls that can take the damage.
 */
function captainsAfloat() {
  const line = [];
  if (playerCombat) {
    line.push({ id: runtimeShip.id, name: runtimeShip.name, ...world.ship, combat: playerCombat, active: true });
  }
  for (const squadron of squadrons) {
    const combat = captainCombat.get(squadron.id);
    if (!combat) continue;
    line.push({ id: squadron.id, name: squadron.name, ...squadron.ship, combat, active: false });
  }
  return line;
}

/**
 * Every hull of every squadron afloat (S155-C): what the enemies aim at and what fires back.
 *
 * Before this the sea held one line. With several commands on the water a hostile has to be
 * able to shoot at any of them, and each command answers for herself: the player asked to
 * see them all at sea, and a squadron that could be shot at but never fired would be a
 * worse lie than not showing her.
 */
function alliedHulls() {
  const line = allies();
  for (const squadron of squadrons) {
    const combat = captainCombat.get(squadron.id);
    if (combat) {
      line.push({ id: squadron.id, name: squadron.name, ...squadron.ship, combat });
    }
    for (const escort of squadron.escorts ?? []) {
      if (escort.combat) line.push({ id: escort.id, name: escort.name, ...escort, combat: escort.combat });
    }
  }
  return line;
}

/** The combatant of one captain afloat, by hull id, active or not (S155-C). */
function captainCombatOf(id) {
  if (id === runtimeShip?.id) return playerCombat;
  return captainCombat.get(id) ?? null;
}

/**
 * Hand the helm to another captain afloat (S155-D/E), and say who took it.
 *
 * The model does the swap, so nothing is moved and nothing is rebuilt. The screen keeps one
 * invariant: `world.ship`/`world.escorts`/`playerCombat` are the squadron under the helm, and
 * `squadrons`/`captainCombat` are every other one. Switching is moving a record across that
 * line, which is why no hull can be held twice.
 */
function chooseSquadron(id) {
  if (!world) return false;
  const chosen = afloatSquadrons(world).find((squadron) => squadron.id === id);
  const previousId = world.activeId ?? runtimeShip?.id;
  if (!chosen || chosen.id === previousId) return false;

  // The squadron that loses the helm keeps everything she is doing: her position, her
  // formation, her sail and her combatant, so she goes on sailing and fighting without him.
  const previousShip = (fleet?.ships ?? []).find((ship) => ship.id === previousId) ?? null;
  const parked = {
    id: previousId,
    name: previousShip?.name ?? runtimeShip?.name ?? previousId,
    ship: { ...world.ship },
    escorts: escorts.map((escort) => ({ ...escort })),
    order: { throttle: ui.throttle, turn: 0 },
  };
  captainCombat.set(previousId, playerCombat);

  // The incoming squadron leaves the parked list and takes the helm with her own combatant.
  const incoming = squadrons.find((squadron) => squadron.id === chosen.id) ?? null;
  squadrons = [...squadrons.filter((squadron) => squadron.id !== chosen.id), parked];
  runtimeShip = (fleet?.ships ?? []).find((ship) => ship.id === chosen.id) ?? runtimeShip;
  playerCombat = captainCombat.get(chosen.id) ?? null;
  captainCombat.delete(chosen.id);
  escorts = (incoming?.escorts ?? []).map((escort) => ({ ...escort }));

  // The model swaps the two records; the sea then carries the parked list it just built.
  world = withActiveSquadron(world, chosen.id);
  world = { ...world, squadrons: squadrons.map(stripSquadron) };

  // The helm keeps the sail the squadron had when she was last steered.
  ui.throttle = Math.max(0, Math.min(1, Number(incoming?.order?.throttle) || 0));
  ui.trail = [];
  // The order belongs to the squadron that was steered: the new one starts with the wheel.
  activeOrder = null;
  showBanner(t("sea.banner.squadronActive", { name: runtimeShip.name }), "info", 2200);
  return true;
}

/** A squadron as the world model carries it: positions and orders, no live combatant. */
function stripSquadron(squadron) {
  return {
    id: squadron.id,
    ship: squadron.ship,
    escorts: (squadron.escorts ?? []).map(({ combat, ...rest }) => rest),
    order: squadron.order,
  };
}

/** Cycle the helm through the squadrons afloat (S155-E), for the keyboard. */
function cycleSquadron() {
  if (!world) return;
  const afloat = afloatSquadrons(world);
  if (afloat.length < 2) return;
  const index = afloat.findIndex((squadron) => squadron.id === (world.activeId ?? runtimeShip?.id));
  const next = afloat[(index + 1) % afloat.length];
  chooseSquadron(next.id);
}

/** Each escort fires on its own when a hostile bears, with its own reloads. */
function escortsFire() {
  if (gameOver) return;
  const fortTarget = occupiedFortTarget();
  const sails = world.encounters.filter((e) => e.type === "enemy" && e.combat?.status === "fighting");
  const targets = fortTarget ? [...sails, fortTarget] : sails;
  // The squadron under the helm, hull by hull, and then every other command (S155-C): a
  // captain the player is not steering still fights for herself, or the sea would be showing
  // a squadron that takes fire and never answers it.
  const lines = [
    { escorts, quiet: false },
    ...squadrons.map((squadron) => ({ escorts: squadron.escorts ?? [], quiet: true })),
  ];
  for (const line of lines) {
    for (const escort of line.escorts) {
      const target = closestTarget(targets, escort);
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
      // Only the squadron under the helm reports her own fire: a banner per hull of every
      // command on the water would bury the screen.
      if (!line.quiet) {
        showBanner(t("sea.banner.escortFire", { name: escort.name, side: t(`sea.sides.${side}`) }), "info", 1400);
      }
    }
  }

  // The captains fire too (S155-C): each with her own guns and her own rounds, at whatever
  // bears, exactly as the hull under the helm does when the yard's auto-fire is on.
  for (const captain of captainsAfloat().filter((entry) => !entry.active)) {
    for (const side of ["babor", "estribor"]) {
      const target = targetForSide(captain, targets, side, playerMaxRangeM(), []);
      if (!target) continue;
      const isFort = target.id === "fort";
      if (isFort && !fortHeldByEnemy(fortCombat)) continue;
      const distance = Math.hypot(captain.x - target.x, captain.y - target.y);
      const bearing = sideForBearing(captain.heading ?? 0, Math.atan2(target.y - captain.y, target.x - captain.x));
      if (!bearing) continue;
      const { volley } = fireBroadside(captain.combat, side, distance, rnd);
      for (const shot of volley) {
        pushFx("tracer", captain.x, captain.y, target.x, target.y, 0.3);
        if (!shot.hit) {
          pushFx("splash", target.x + (rnd() - 0.5) * 70, target.y + (rnd() - 0.5) * 70, 0, 0, 0.6);
          continue;
        }
        if (isFort) hitOccupiedFort(shot.damage);
        else applyDamage(target.combat, shot.damage);
        pushFx("hit", target.x, target.y, target.x, target.y, 0.5);
      }
    }
  }
}

/**
 * The soldiers' fire from the deck (S160-C): light arms at close range, crew damage only.
 *
 * A musket does not hole a hull, so this never touches the casemate: it is the reason to
 * close the range, and the way a hull with soldiers aboard wins a fight it would otherwise
 * only trade shot for shot. The rule lives in the boarding model; this only carries it.
 */
function deckFireVolley() {
  if (gameOver) return;
  const targets = world.encounters.filter(
    (encounter) => encounter.type === "enemy" && encounter.combat?.status === "fighting",
  );
  if (targets.length === 0) return;
  const lines = [
    { hulls: allies(), quiet: false },
    ...squadrons.map((squadron) => ({ hulls: squadron.escorts ?? [], quiet: true })),
  ];
  for (const line of lines) {
    for (const hull of line.hulls) {
      const target = closestTarget(targets, hull);
      if (!target) continue;
      const distance = Math.hypot(hull.x - target.x, hull.y - target.y);
      const fire = deckFire(hull.combat ?? hull, distance);
      if (fire.crew <= 0) continue;
      // The deck fire is crew damage and nothing else, applied through the same rule every
      // other wound goes through, so the casualties are counted the one way.
      applyDamage(target.combat, fire);
      pushFx("hit", target.x, target.y, target.x, target.y, 0.35);
      if (!line.quiet) {
        showBanner(
          t("sea.banner.deckFire", { name: hull.name ?? runtimeShip.name }),
          "info",
          1200,
        );
      }
    }
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
 * The shipyard's own fight (S74, S126). She is a static hull and a coastal defence as well
 * as a siege objective: she fires at fighting hostiles in range, regardless of birth zone,
 * while abyss squadrons fire back. Enemies carry the zone where they were born, and those
 * born near the port are coastal; gating her fire by assault zone left her silent against
 * them forever. Her damage and her garrison live in the save, like a hull's.
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
  // Every other command on the water fights too (S155-C): her captain and her escorts reload
  // on the same clock as ours, because the enemies can shoot at them.
  for (const combat of captainCombat.values()) tickCombatant(combat, dt);
  for (const squadron of squadrons) {
    for (const escort of squadron.escorts ?? []) if (escort.combat) tickCombatant(escort.combat, dt);
  }

  playerAutoFire();

  // The soldiers fire from the deck (S160-C): light arms, short reach, crew damage only.
  // Every hull of the squadron does it, exactly as every hull answers with her guns.
  deckFireVolley();

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
    // Every hull of every squadron is a target and a shooter (S155-C): a hostile picks the
    // nearest one, whichever command she serves.
    const line = alliedHulls();
    const nearest = closestTarget(line, encounter);
    const distance = nearest
      ? Math.hypot(encounter.x - nearest.x, encounter.y - nearest.y)
      : Math.hypot(encounter.x - world.ship.x, encounter.y - world.ship.y);
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
      : nearest ?? {
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
  warnIfDry();

  // The voyage ends when nothing is left to sail (S87): losing the flagship is a blow,
  // not the end, and the next hull in line takes over. Only when every hull of every
  // squadron is gone does the sinking screen come up (S155-C): a captain still afloat on the
  // same sea is still a game.
  const status = squadronStatus(alliedHulls());
  if (status.over && !gameOver) {
    gameOver = true;
    gameOverAt = now;
    ui.throttle = 0;
  } else {
    handOverCommand();
  }
}

/**
 * Put a hull that just joined the fleet into the live squadron (S139), with her own guns
 * and crew and her own supply reserve: a prize that fights alongside the captain has to
 * carry what she captured, not a fresh hull's allowance.
 */
function joinSquadron(prize, encounter) {
  const joined = prizeJoiningSquadron(escorts, world.ship, prize, escorts.length);
  if (!joined) return;
  const combatant = createPlayerCombatant(prize);
  // Her guns come from the fight she lost, not from a new hull's default battery.
  if (Array.isArray(encounter?.combat?.pieces)) {
    const pieces = encounter.combat.pieces.map((piece) => ({
      ...piece,
      shotsLeft: Math.max(0, Number(piece.shotsLeft) || 0),
      reloadTimer: 0,
    }));
    if (pieces.length > 0) combatant.pieces = pieces;
  }
  refreshStatus(combatant);
  escorts = [...escorts, { ...joined, combat: combatant }];
  supplyByHull = { ...supplyByHull, [prize.id]: supplySeconds(prize.days ?? 0) };
  world = { ...world, escorts: escorts.map(({ combat, ...rest }) => rest) };
  saveGame();
}

/** Promote the first fighting escort without moving her or rebuilding her combatant. */
function handOverCommand() {
  const next = nextCommandShip(allies());
  if (!next) return false;
  const previousName = runtimeShip.name;
  // The captain that was lost follows the same rule as an escort (S117): she is gone, or
  // she waits in a yard as a wreck. Either way the next hull in line takes over.
  const previousCaptainId = runtimeShip?.id;
  fleet = setCaptain(loseHull(fleet, runtimeShip.id, playerCombat?.status), next.id);
  runtimeShip = captainShip(fleet);
  playerCombat = next.combat;
  escorts = escorts.filter((escort) => escort.id !== next.id);
  // The new captain already carries her own reserve in the map (S132): it follows her from
  // the escort's row to the captain's by itself, because the map is keyed by hull id and
  // not by role. Only the lost captain's row goes.
  delete supplyByHull[previousCaptainId];
  world = {
    ...world,
    ship: {
      x: next.x, y: next.y, heading: next.heading, currentSpeedKn: next.currentSpeedKn,
      speedKn: next.speedKn, turnFactor: shipTurnFactor(runtimeShip.hullId, runtimeShip.loadFraction),
      // The new captain brings her own hull, her own load and her own crew (S159): carrying
      // the lost one's over would have her rowing with another woman's men.
      id: runtimeShip.id,
      ...hullSpec(runtimeShip),
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
    fleet = loseHull(fleet, gone.id, gone.combat?.status);
    // A hull that left the squadron carries no reserve any more (S132): keeping hers in
    // the map would let the panel report a hull that is no longer there as the worst.
    delete supplyByHull[gone.id];
  }
  escorts = survivors;
  saveFleetState();
}

/**
 * Take a lost hull out of the fleet, or leave her as a wreck (S117).
 *
 * The switch is read right here, when she goes down, so changing it mid-voyage counts.
 * A wreck keeps her entry — floating her again restores that same ship — but she loses
 * everything that was afloat in her: her cargo is at the bottom (S116), her crew went
 * with her, and she does not sail.
 */
function loseHull(currentFleet, shipId, status) {
  const entry = (currentFleet?.ships ?? []).find((ship) => ship.id === shipId);
  // A hull that struck her colours was not lost to the sea: she can still be taken, and
  // the wreck switch is about sinking, so it does not apply to her.
  const wreck = entry && status === "sunk" ? wreckHull(entry) : null;
  // A hull that leaves the fleet for good is the voyage's own doing, so the merge is
  // allowed to drop her from the stored sheet (S151). A wreck stays: she is still a
  // fleet entry, floated again in a yard.
  if (wreck) {
    // Her hold went down with her (S116), and that is the voyage's doing, not the yard's:
    // without claiming the hold here the merge would keep the cargo the stored sheet still
    // remembers, and floating her again would bring back goods that are at the bottom.
    seaHoldsChanged.add(shipId);
    return {
      ...currentFleet,
      ships: currentFleet.ships.map((ship) => (ship.id === shipId ? wreck : ship)),
      // A wreck cannot captain: the fleet hands over to a hull that still floats.
      captainId:
        currentFleet.captainId === shipId
          ? (currentFleet.ships.find((ship) => ship.id !== shipId && !isWreck(ship))?.id ?? null)
          : currentFleet.captainId,
    };
  }
  lostHullIds.add(shipId);
  return removeShip(currentFleet, shipId);
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
  // The ids this pass finishes, applied AFTER the map (S139): `world` is reassigned here,
  // and writing `world.encounters` from inside the map would land on the object the
  // reassignment replaced, losing the record and bringing the enemy back.
  const finished = [];
  const beatenEnemies = [];
  const resolved = world.encounters.map((encounter) => {
    if (encounter.type !== "enemy" || !encounter.combat) return encounter;
    const status = encounter.combat.status;
    if (status !== "sunk" && status !== "surrendered") return encounter;

    // Beating a hostile is a victory, and victories grow the yard's battery (S74).
    victories += 1;
    // The same victory is what clears a level now (S150).
    beatenEnemies.push(encounter);

    // Her hold is the real prize (S115): a hull that strikes hands over all of it, a hull
    // that goes down leaves only the share that can still be fished out of the water.
    collectCargoFrom(encounter, status);

    // Taking her is a boarding, and a boarding needs soldiers (S160-B). The player asked for
    // it in those words: "Sí: la captura pasa a exigir soldados". A hull with no soldiers
    // aboard loots the prize and sails on, exactly as she did before the rule existed.
    const boarding = status === "surrendered" ? canBoard(playerCombat, encounter.combat) : null;
    const prize = status === "surrendered" && boarding?.allowed ? captureableShip(encounter) : null;
    if (status === "surrendered" && !prize) {
      // Say why the prize was not taken, or the player loses a ship and never learns why.
      const reason = boarding?.reason === "no-soldiers" ? "noSoldiers" : boarding?.reason === "outnumbered" ? "outnumbered" : null;
      if (reason) {
        showBanner(
          t(`sea.banner.noBoard.${reason}`, {
            mine: boarding.mine,
            theirs: boarding.theirs,
            needed: boarding.needed,
          }),
          "danger",
          4200,
        );
      }
    }
    if (prize) {
      fleet = withPrize(fleet, { ...prize, yardId: null });
      // The fight is over for good (S139): remember her id, or the zone's top-up puts the
      // same surrendered hull back and she is captured again on the next frame.
      finished.push(encounter.id);
      // She joins the squadron on the spot (S139): the live escort list is built when the
      // sea loads, so without this she was saved to the fleet and never drawn until the
      // player sailed back to a yard and the sea reloaded.
      joinSquadron(prize, encounter);
      saveFleetState();
      showBanner(t("sea.banner.captured", { name: prize.name }), "gold", 4000);
      return null;
    }

    // A sunk hull is finished too (S139): her wreck is a different encounter id.
    finished.push(encounter.id);
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
  world = { ...world, encounters: resolved };
  for (const id of finished) world = markDefeated(world, id);
  // The level counts victories, not an empty sea (S150). A hull that struck is one too.
  for (const beaten of beatenEnemies) world = recordVictory(world, beaten);
}

/**
 * Take what a defeated enemy was carrying (S115).
 *
 * The hold goes into the captain's hold, which is the same hold that weighs her down and
 * is sold in a yard (S114): the loot is cargo, not gold, so the player has to carry it
 * home and find a market for it. Whatever does not fit stays in the water and the crew is
 * told, because silently dropping it would read as the game eating the prize.
 */
/**
 * Say it out loud when the captain's guns run dry (S121). Before this the ship simply
 * went silent, which the player read as a broken game rather than as an empty rack: the
 * warning names the cause and where to fix it.
 */
function warnIfDry() {
  if (dryWarned || !playerCombat) return;
  if (!isOutOfAmmo(playerCombat)) return;
  dryWarned = true;
  showBanner(t("sea.banner.dry", { name: runtimeShip.name }), "danger", 5000);
}

function collectCargoFrom(encounter, status) {
  const carried = enemyHoldFor(encounter);
  const spoils = defeatedHold(carried, status);
  if (!spoils || spoils.cargoKg <= 0) return;

  const awarded = awardHold(runtimeShip, spoils);
  runtimeShip = awarded.ship;
  // The hull the player sails is a fleet entry too, so her hold is written where the
  // market will read it (S118). The voyage loaded this hold itself, so it is one of the
  // two things the merge is allowed to write over the yard's sheet (S151): a prize taken
  // aboard is a real change of the voyage, and a hold bought in port is not.
  seaHoldsChanged.add(runtimeShip.id);
  fleet = {
    ...fleet,
    ships: fleet.ships.map((ship) =>
      ship.id === runtimeShip.id ? { ...ship, manifest: runtimeShip.manifest, cargoKg: runtimeShip.cargoKg } : ship,
    ),
  };
  saveFleetState();
  showBanner(
    t(status === "sunk" ? "sea.banner.cargoSalvaged" : "sea.banner.cargoTaken", {
      kg: fmtInt.format(spoils.cargoKg - awarded.leftKg),
    }),
    "gold",
    3500,
  );
  if (awarded.leftKg > 0) {
    showBanner(t("sea.banner.cargoLeft", { kg: fmtInt.format(awarded.leftKg) }), "info", 3500);
  }
}

/**
 * Spend every hull's own reserve as the voyage goes, and pay the wages of every whole day
 * the captain's clock gives up (S67, S132).
 *
 * The supply is the shipyard's `days` of provisions turned into the clock the sea runs on,
 * per hull: each one burns only her own. The wages are the fleet's own per-day upkeep,
 * charged once for the whole fleet and off the captain's clock, because the player decided
 * the whole fleet pays (S-F).
 *
 * Running out is reported once per hull, naming her, and it does not sink the ship: it is
 * a warning that she is on short rations and has to go back to a shipyard.
 */
function burnVoyageSupply(dt) {
  const result = burnReserves(supplyByHull, dt);
  supplyByHull = result.reserves;
  const owed = wagesFor(result.daysSpent, runtimeShip?.id, fleetUpkeep(fleet));
  if (owed > 0) gold = Math.max(0, gold - owed);
  if (result.dried.length > 0) {
    showBanner(t("sea.banner.noSupply", { name: hullName(result.dried[0]) }), "danger", 4000);
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
  window.location.href = "./index.html#comprar";
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
    .map((entry) => `${entry.id}:${Math.round(entry.hull)}:${Math.round(entry.rigging)}:${Math.round(entry.crew)}:${entry.danger}:${entry.side}`)
    .join("|") + `:${dangerVisible() ? 1 : 0}`;
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
    head.append(name);
    // The danger number sits next to the name (S142-C), own hulls and enemies alike,
    // so the player compares two ships without leaving the panel. It is a label: the
    // fight does not read it (S142-B).
    if (dangerVisible()) {
      // A number the model could not produce reads as a dash, never as `NaN` (S142): a
      // stale module served from cache must not turn the panel into an error message.
      const label = dangerLabel(entry.danger);
      const danger = document.createElement("span");
      danger.className = "duel-danger";
      danger.dataset.danger = label === null ? "" : String(label);
      danger.title = label === null ? t("sea.danger.unknown") : t("sea.danger.title", { danger: fmtInt.format(label) });
      danger.textContent = label === null ? "—" : fmtInt.format(label);
      head.append(danger);
    }
    const distance = document.createElement("span");
    distance.className = "duel-distance";
    distance.textContent = Number.isFinite(entry.distanceM)
      ? t("sea.duel.distance", { distance: fmtInt.format(Math.round(entry.distanceM)) })
      : "";
    head.append(distance);

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

/** The name of a hull at sea, by her id: the captain's or an escort's (S132). */
function hullName(id) {
  if (id === null || id === undefined) return null;
  if (id === runtimeShip?.id) return runtimeShip?.name ?? null;
  return escorts.find((escort) => escort.id === id)?.name ?? String(id);
}

function updateHud() {
  const zone = zoneAtRadius(Math.hypot(world.ship.x, world.ship.y));
  // The title names the captain under the helm, and says so when the sea holds more than one
  // command (S155-D): with several squadrons afloat the player has to know whose helm she has.
  const afloatCount = afloatSquadrons(world).length;
  els.name.textContent = afloatCount > 1
    ? t("sea.squadron.title", {
        name: `${runtimeShip.name} — ${runtimeShip.hullName}`,
        count: afloatCount,
      })
    : `${runtimeShip.name} — ${runtimeShip.hullName}`;
  els.gold.textContent = fmtInt.format(gold);
  const squadron = squadronSupply(supplyByHull);
  const voyage = voyageClock({ supplyLeftS: squadron.worstSeconds, upkeep: fleetUpkeep(fleet), gold });
  els.voyageDays.textContent = fmtInt.format(voyage.daysLeft);
  els.voyageUpkeep.textContent = fmtUpkeep.format(voyage.goldPerDay);
  els.voyageGoldDays.textContent = Number.isFinite(voyage.goldIn) ? fmtInt.format(voyage.goldIn) : "∞";
  // S132: the supply the panel prints is the worst hull's, the same reserve the sea is
  // charging, plus how many hulls are already dry.
  if (els.voyageWorst) {
    els.voyageWorst.textContent = hullName(squadron.worstId) ?? t("sea.voyage.noHulls");
  }
  if (els.voyageDry) {
    els.voyageDry.textContent = fmtInt.format(squadron.dryCount);
  }
  els.zone.textContent = localisedZone(zone, t).name;
  els.zone.style.color = zone.id === "abismo" ? "#c9a9ff" : zone.id === "abierto" ? "#9fc7e8" : "#bfe3c9";
  // While an order is steering (S155-F/G) the sail on screen is the one the order carries, not
  // the last the player set by hand: a hull making 6 kn under orders with the HUD reading 0 %
  // of sail is the screen lying about the sea.
  const sailShown = activeOrder ? 1 : ui.throttle;
  els.throttle.textContent = `${fmtInt.format(sailShown * 100)} %`;
  // The oars are automatic (S159-E), so the screen says what they are doing instead of
  // offering a key: how fast they are pulling when they pull, and the effort left in the
  // crew either way. A hull with no banks has no reading and the row stays hidden (S159-H).
  if (els.oarsRow && els.oars) {
    const oars = world.oarReading;
    if (!oars) {
      els.oarsRow.classList.add("is-hidden");
    } else {
      els.oarsRow.classList.remove("is-hidden");
      const effort = `${fmtInt.format(Math.round((Number(oars.effort) || 0) * 100))}`;
      els.oars.textContent = oars.rowing
        ? t("sea.oars.rowing", { knots: fmtOne.format(Number(oars.speedKn) || 0), effort })
        : t("sea.oars.resting", { effort });
    }
  }
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
  // `dt` is clamped at both ends: `requestAnimationFrame` hands a timestamp that can be
  // BEHIND `lastTime` (the module loads, the first frame fires with an earlier clock, a tab
  // comes back from the background), and a negative step ran the whole sea backwards. It
  // reached the enemy AI, which placed the hull at NaN, and the despawn filter then dropped
  // her: a sail vanished from the sea on the first frame.
  const dt = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;

  const before = goldEarned;
  for (let step = 0; step < ui.timeScale; step += 1) {
    // The captain's combat state rides along, so her shredded rig slows her (S89).
    const previousTime = world.timeS;
    world = updateWorld(world, gameOver ? {} : { ...readInput(), rigging: playerCombat }, dt);
    // A level was cleared (S140-G): say which level the sea is on now, once. The banner is
    // queued instead of written here, so it never stomps a more specific message of the
    // same moment (a capture, a wreck): it waits for that banner to finish.
    if (Number.isFinite(world.level) && world.level > announcedLevel) {
      announcedLevel = world.level;
      pendingLevel = world.level;
    }
    // The order the active squadron is under (S155-F/G): a destination ends on arrival, and a
    // pick-up moves to the next golden buoy or ends when its round is collected (S158).
    if (activeOrder && !gameOver) {
      if (activeOrder.kind === ORDER.pickUp) {
        // A pick-up is re-aimed on every tick, not only when the hull reaches a buoy: the
        // buoy is collected the moment the world pays it, and waiting for the arrival check
        // left the captain stopped on the buoy she had just collected.
        const next = orderProgress(world.ship, activeOrder, world.encounters);
        if (!next) {
          activeOrder = clearOrder();
          ui.throttle = 0;
          showBanner(t("sea.banner.collectDone", { name: runtimeShip.name }), "gold", 3000);
        } else {
          activeOrder = next;
        }
      } else if (orderDone(world.ship, activeOrder)) {
        activeOrder = clearOrder();
        ui.throttle = 0;
        showBanner(t("sea.banner.destinationDone", { name: runtimeShip.name }), "gold", 3000);
      }
    }
    // The ports recover on the world clock; the elapsed time is applied to the record the
    // yard last wrote when the sea saves (S151).
    marketElapsedS += Math.max(0, world.timeS - previousTime);
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
  // The level banner waits its turn, so the capture or the wreck of the same moment is
  // read first (S140-G).
  if (pendingLevel !== null && now >= ui.bannerUntil) {
    showBanner(t("sea.banner.level", { level: pendingLevel }), "gold", 4500);
    pendingLevel = null;
  }
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
  bindGameTime(GAME_TIME);
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
  markets = normaliseMarkets(savedGame?.markets);
  const savedWorld = savedGame?.world ? deserializeWorld(savedGame.world) : null;

  const worldSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  world = savedWorld ?? createWorld(worldSeed, runtimeShip, 0, fleet);
  // Old game records can have a position but no serialized world.
  if (!savedWorld && Number.isFinite(savedGame?.ship?.x) && Number.isFinite(savedGame?.ship?.y)) {
    world = { ...world, ship: { ...world.ship, ...savedGame.ship } };
  }

  // A new captain keeps the sea's location, but sails at her own speed and turn rate.
  // Her identity comes with that too (S159): a save written before the oars existed carries
  // no `id` and no `hullId`, so the captain who loaded it would never row a stroke. The
  // fleet sheet knows who she is, and it is the authority for her hull and her crew.
  world = {
    ...world,
    ship: {
      ...world.ship,
      speedKn: runtimeShip.speedKn,
      turnFactor: shipTurnFactor(runtimeShip.hullId, runtimeShip.loadFraction),
      id: runtimeShip.id,
      ...hullSpec(runtimeShip),
    },
  };

  gold = normaliseGold(savedGame?.gold);
  goldSynced = gold;
  // The reserves are seeded once the squadron is built, below (S132): each hull needs her
  // own id before her own `days` can be read.

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
  escorts = shipsSailingAtSea(fleet)
    .filter((ship) => ship.id !== runtimeShip?.id)
    .map((ship, index) => {
    const combatant = createPlayerCombatant(ship);
    const saved = savedGame?.combat?.escorts?.[ship.id];
    if (saved) {
      // The sea save is fresher than the fleet sheet (S23): the damage from the last
      // voyage wins, or an escort would come back whole after being shot to pieces.
      combatant.condition = { ...combatant.condition, ...saved.condition };
      combatant.crew = { ...combatant.crew, ...saved.crew };
      // Her rounds too (S122): the guns are rebuilt from the fleet sheet, which knows the
      // allowance she was built with and nothing about what the last fight spent.
      if (Array.isArray(saved.pieces)) {
        combatant.pieces = combatant.pieces.map((piece, index) => {
          const stored = saved.pieces[index];
          if (!stored) return piece;
          // A refit can put a different gun in that slot, and the round the player chose
          // only comes back when the gun can actually fire it (S65).
          const samePiece = !stored.pieceId || stored.pieceId === piece.pieceId;
          const carries = samePiece && pieceById(piece.pieceId).ammo.includes(stored.ammoId);
          return {
            ...piece,
            ...(carries ? { ammoId: stored.ammoId } : {}),
            shotsLeft: stored.shotsLeft ?? piece.shotsLeft,
            reloadTimer: stored.reloadTimer ?? 0,
          };
        });
      }
    }
    // Neither a saved sea nor the fleet sheet may bring a lost hull back fighting.
    refreshStatus(combatant);
    const place = (world.escorts ?? []).find((entry) => entry.id === ship.id);
    const escort = createEscort(
      {
        id: ship.id,
        speedKn: ship.speedKn,
        turnFactor: shipTurnFactor(ship.hullId, ship.loadFraction),
        // Her own oars are read from the hull, the load and the crew actually aboard (S159).
        ...hullSpec(ship),
      },
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

  // The other commands on the water (S155-C): each captain builds her own combatant and her
  // own escorts from the fleet sheet, and their damage comes back from the sea save, exactly
  // as the active squadron's does. A save written before this rule has none of them.
  captainCombat = new Map();
  const savedOthers = savedGame?.combat?.squadrons;
  squadrons = (Array.isArray(world.squadrons) ? world.squadrons : [])
    .filter((squadron) => squadron && typeof squadron.id === "string" && squadron.ship)
    .map((squadron) => {
      const record = (fleet?.ships ?? []).find((ship) => ship.id === squadron.id) ?? null;
      const saved = savedOthers?.[squadron.id];
      if (record) {
        const combatant = createPlayerCombatant(record);
        if (saved && typeof saved === "object") {
          combatant.condition = { ...combatant.condition, ...saved.condition };
          combatant.crew = { ...combatant.crew, ...saved.crew };
          combatant.pieces = restorePieces(combatant.pieces, saved.pieces);
        }
        refreshStatus(combatant);
        captainCombat.set(squadron.id, combatant);
      }
      return {
        ...squadron,
        name: record?.name ?? squadron.id,
        escorts: (squadron.escorts ?? [])
          .filter((escort) => escort && typeof escort.id === "string")
          .map((escort) => {
            const hull = (fleet?.ships ?? []).find((ship) => ship.id === escort.id) ?? null;
            const combatant = hull ? createPlayerCombatant(hull) : null;
            const stored = savedOthers?.escorts?.[escort.id];
            if (combatant && stored && typeof stored === "object") {
              combatant.condition = { ...combatant.condition, ...stored.condition };
              combatant.crew = { ...combatant.crew, ...stored.crew };
              combatant.pieces = restorePieces(combatant.pieces, stored.pieces);
              refreshStatus(combatant);
            }
            return { ...escort, name: hull?.name ?? escort.name ?? escort.id, combat: combatant };
          }),
        order: { throttle: Number(squadron.order?.throttle) || 0, turn: Number(squadron.order?.turn) || 0 },
      };
    });

  // The squadron's reserves (S132), one per hull that actually sailed: the captain first
  // and then every escort, each seeded from her own `days` of provisions. The sea save is
  // fresher than the fleet sheet, as it is for damage and crew: a per-hull map wins, and an
  // old save's single `supplyLeftS` lands on the captain and leaves the escorts to their
  // own days.
  supplyByHull = buildReserves(
    [{ id: runtimeShip?.id, days: runtimeShip?.days }, ...escorts.map((escort) => ({ id: escort.id, days: shipDays(escort.id) }))],
    { byHull: savedGame?.supplyByHull, legacy: savedGame?.supplyLeftS },
  );

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
  if (!handedOver && squadronStatus(alliedHulls()).over) {
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
  announcedLevel = Number.isFinite(world.level) ? world.level : 1;
  pendingLevel = null;
  if (!handedOver) showBanner(t("sea.banner.depart", { name: runtimeShip.name }), "info", 2800);
  requestAnimationFrame(frame);
}

if (runtimeShip) {
  boot();
} else {
  // No ship in the water: the sea has nothing to sail. Back to the shipyard, to the
  // room that buys one (S109).
  window.location.replace("./index.html#comprar");
}
