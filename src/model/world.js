/**
 * World model: concentric difficulty zones, ship movement and encounters.
 *
 * Pure, deterministic and UI-free: given the same seed and inputs it always produces
 * the same sea, which is what makes it testable. The UI renders and mutates a world
 * object; it never decides game rules on its own.
 *
 * Heading convention: 0 points east, positive angles turn clockwise on screen
 * (canvas y grows downward). Distances are metres; speeds are knots.
 */

import { ZONES, HULLS, SHIPYARDS, hullById, shipyardAt } from "../data/naval-data.js";
import { enemiesPerZone, normaliseLevel } from "./levels.js";
import { DEFAULT_MODE_ID, modeById, modeOf } from "./modes/index.js";
import { createEscort, escortStation, stepEscort } from "./formation.js";
import { seaSquadrons, shipsSailingAtSea, squadrons } from "./fleet.js";
import { referenceSpeedKn } from "./ship-model.js";
import {
  effortStep,
  hasOarBanks,
  oarSpeedKn,
  oarTurnFactor,
  rowingTarget,
  speedUnderOars,
} from "./oars.js";
import { windAt, windEffect } from "./wind.js";
import { FOG, discoveredWith, fogEnabled, normaliseDiscovered, revealAround, serializeDiscovered } from "./fog.js";

export const KN_TO_MS = 1852 / 3600;

export const WORLD = {
  radiusM: 5200,
  pickupRadiusM: 60,
  /** Rudder authority, rad/s at full helm. */
  maxTurnRate: 0.55,
  /** Gameplay multiplier over real speed, so a 6-knot galleon crosses the coastal band in about half a minute. */
  arcadeScale: 12,
  /** Fraction of max speed gained per second while accelerating. */
  accelerationRate: 0.25,
  /** Encounters appear inside a ring at this distance from the ship. */
  spawnRadiusM: 2600,
  despawnRadiusM: 3400,
  /**
   * Past this distance a ship in combat gives up the chase (S58). It sits well outside
   * the engage radius, so a fight cannot flicker on and off at the edge.
   */
  disengageRadiusM: 4600,
  /**
   * A sail that was in combat and gave up the chase is forgotten much later than a
   * passing one (S58): it is not erased the instant it disengages, which is exactly
   * what read as "the enemy forgot me".
   */
  disengagedDespawnRadiusM: 10200,
  /** Base treasure value before the zone loot factor, in gold. */
  treasureBaseGold: [50, 100],
  /**
   * Water around the home port that no hostile may enter (S66). The port itself is
   * 110 m; the zone is wide enough to cover the approach, so a player can repair and
   * resupply without a fight parked on the quay.
   */
  safeZoneM: 300,
};

/** The safe zone around the home port, readable on its own (S66). */
export const SAFE_ZONE = WORLD;

/** Radius of the safe zone right now, reading the live setting (S66). */
export function safeZoneRadiusM() {
  const radius = Number(WORLD.safeZoneM);
  return Number.isFinite(radius) && radius > 0 ? radius : 0;
}

/**
 * Whether a position lies inside the safe zone around the home port (S66). The edge
 * counts as inside, so a hostile cannot park on the line. A broken position fails
 * closed: an unknown position is never handed protection.
 */
export function insideSafeZone(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const radius = safeZoneRadiusM();
  if (radius <= 0) return false;
  return Math.hypot(x, y) <= radius;
}

/**
 * The nearest point outside the safe zone along the bearing from the yard (S66). An
 * enemy that drifts or is shoved into the zone is put back on its own line out, so it
 * is pushed the way it came instead of being teleported sideways. A position already
 * outside, or a broken one, comes back unchanged.
 */
export function clampToSafeZone(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return position;
  const radius = safeZoneRadiusM();
  if (radius <= 0) return position;
  const distance = Math.hypot(x, y);
  if (distance >= radius) return position;
  // At the yard itself there is no bearing to keep: pick due north so the result is a
  // real point instead of a division by zero.
  if (distance < 1e-6) return { ...position, x: 0, y: radius };
  const scale = radius / distance;
  return { ...position, x: x * scale, y: y * scale };
}

/**
 * A spawn point at `distanceM` from the yard on `angle`, never inside the safe zone
 * (S66). Enemies must appear in open water, so a spawn that would land in the zone is
 * pushed out to its edge.
 */
export function spawnOutsideSafeZone(angle, distanceM) {
  const distance = Number.isFinite(distanceM) ? Math.max(0, distanceM) : 0;
  const point = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  const radius = safeZoneRadiusM();
  if (radius <= 0) return point;
  const current = Math.hypot(point.x, point.y);
  if (current > radius) return point;
  // A metre clear of the line, because the edge itself counts as inside: a hostile
  // parked exactly on it would still be able to fire into the yard.
  const safeDistance = radius + 1;
  if (current < 1e-6) return { x: Math.cos(angle) * safeDistance, y: Math.sin(angle) * safeDistance };
  const scale = safeDistance / current;
  return { x: point.x * scale, y: point.y * scale };
}

export const ZONE_BANDS = [
  { id: "costera", maxRadiusM: 1200, encounters: 10, enemyShare: 0.15 },
  { id: "abierto", maxRadiusM: 3200, encounters: 16, enemyShare: 0.45 },
  // The outer band is the edge of the world. It is resolved at call time instead of
  // copied here, because the settings screen can change WORLD.radiusM (S33).
  { id: "abismo", encounters: 22, enemyShare: 0.6, edge: true },
];

/** Radius of one band, reading the live world radius for the outermost one. */
function bandRadius(band) {
  return band.edge ? WORLD.radiusM : band.maxRadiusM;
}

/** Hulls an enemy sail can use in each zone; deeper water means harder ships. */
export const ENEMY_POOLS = {
  costera: ["patache", "carabela-latina", "jacht", "zabra", "galeon-pequeno", "fluyt"],
  abierto: ["zabra", "galeon-pequeno", "fluyt", "nao-armada", "galeon-guerra", "gran-mercante"],
  abismo: ["nao-armada", "galeon-guerra", "gran-mercante", "galeaza", "gran-galeon", "gran-buque-real"],
};

/** Deterministic RNG: same state in, same value and next state out. */
export function mulberry32(state) {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: t };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeAngle = (angle) => {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const moveToward = (current, target, maxDelta) => {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
};

/** Zone for a distance from the origin, merging the band tuning with the data table. */
export function zoneAtRadius(radiusM) {
  const band =
    ZONE_BANDS.find((b) => radiusM < bandRadius(b)) ?? ZONE_BANDS[ZONE_BANDS.length - 1];
  const zone = ZONES.find((z) => z.id === band.id);
  return { ...zone, ...band, maxRadiusM: bandRadius(band) };
}

/**
 * The zone a shipyard trades in, read from her position (S112). It lives here and not in
 * the data table because the band a position falls in is the world's rule, not a fact
 * about the yard: one function answers "which water is this?" for every caller.
 *
 * A yard with a broken position has no zone, and a yard with no zone has no market. This
 * never guesses a default: an unknown yard must not silently trade at coastal prices.
 */
export function shipyardZone(yard) {
  if (!yard || !Number.isFinite(yard.x) || !Number.isFinite(yard.y)) return null;
  return zoneAtRadius(Math.hypot(yard.x, yard.y));
}

/** The shipyard holding `position`, or null in open water (S112). */
export function currentShipyard(position) {
  return shipyardAt(position);
}

/**
 * Every squadron afloat, the active one first (S155-C).
 *
 * The sea stopped being one captain: the player asked to see them all and pick one with
 * the mouse (verbatim): "las podremos ver en el mar, con el raton podremos seleccionar una
 * y moverla". The active squadron is the one already stored in `ship`/`escorts`, so the
 * helm, the keys, the HUD and the combat code keep reading the same two fields they always
 * read, and switching squadrons is a swap instead of a second source of truth.
 *
 * A broken or missing list yields just the active squadron, which is the sea a save
 * written before this rule has.
 */
export function afloatSquadrons(world) {
  const base = world && typeof world === "object" ? world : {};
  const others = Array.isArray(base.squadrons) ? base.squadrons.filter(isSquadron) : [];
  const activeId = typeof base.activeId === "string" ? base.activeId : null;
  const active = isShip(base.ship)
    ? {
        id: activeId ?? "captain",
        ship: base.ship,
        escorts: Array.isArray(base.escorts) ? base.escorts.filter(isShip) : [],
        order: normaliseOrder(base.order),
      }
    : null;
  const rest = others
    .filter((squadron) => !active || squadron.id !== active.id)
    .map((squadron) => ({
      ...squadron,
      escorts: Array.isArray(squadron.escorts) ? squadron.escorts.filter(isShip) : [],
      order: normaliseOrder(squadron.order),
    }));
  return active ? [active, ...rest] : rest;
}

/** A squadron record: a captain with her own position, her escorts and her orders. */
function isSquadron(value) {
  return Boolean(value) && typeof value === "object" &&
    typeof value.id === "string" && isShip(value.ship);
}

/** A hull on the sea: a position and a heading the renderer can trust. */
function isShip(value) {
  return Boolean(value) && typeof value === "object" &&
    Number.isFinite(value.x) && Number.isFinite(value.y);
}

/**
 * A squadron's standing orders (S155-D). `throttle` is how much sail she carries and `turn`
 * is the helm she holds; a squadron the player is not steering keeps the last order she was
 * given, which is the whole point of a sea with more than one command on it.
 */
function normaliseOrder(order) {
  const throttle = Number(order?.throttle);
  const turn = Number(order?.turn);
  return {
    throttle: Number.isFinite(throttle) ? Math.min(1, Math.max(0, throttle)) : 0,
    turn: Number.isFinite(turn) ? Math.min(1, Math.max(-1, turn)) : 0,
  };
}

/**
 * Hand the helm to another squadron (S155-D/E). Nothing is moved and nothing is rebuilt:
 * the chosen squadron takes the fields the sea reads as active, and the one that had them
 * goes back into the list with her own position and her own standing orders.
 *
 * An id that is not afloat changes nothing, because a click on empty water is not an order.
 */
export function withActiveSquadron(world, squadronId) {
  const base = world && typeof world === "object" ? world : {};
  const all = afloatSquadrons(base);
  const chosen = all.find((squadron) => squadron.id === squadronId);
  const active = all[0];
  if (!chosen || !active || chosen.id === active.id) return base;
  return {
    ...base,
    activeId: chosen.id,
    ship: chosen.ship,
    escorts: chosen.escorts,
    order: chosen.order,
    squadrons: all.filter((squadron) => squadron.id !== chosen.id),
  };
}

/**
 * The captain nearest to `point`, within `radiusM` (S155-E). The mouse picks captains, not
 * escorts: a click on a hull under someone else's command is a click on the water she
 * happens to be floating in. Outside the radius nobody is selected, so clicking open sea
 * leaves the current command alone.
 */
export function nearestSquadron(world, point, radiusM = WORLD.pickupRadiusM) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const radius = Number(radiusM);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) return null;
  let best = null;
  let bestDistance = radius;
  for (const squadron of afloatSquadrons(world)) {
    const distance = Math.hypot(squadron.ship.x - x, squadron.ship.y - y);
    if (distance <= bestDistance) {
      best = squadron;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The shipyard whose anchor a click on the sea names, or null (S163-G).
 *
 * The sea draws every yard of the table, but nothing read a click on one: the only way into
 * a shipyard was to sail into the home port and let the arrival rule fire. The anchor is
 * drawn 110 m wide, which at the camera's 0.4 px/m is 44 px on screen, so the radius here is
 * generous for the same reason the captain pick is: hitting a small mark on a moving sea is
 * a game of reflexes, not a choice.
 *
 * A broken point or radius names nothing, so a click on open water leaves the voyage alone.
 */
export function nearestShipyard(point, radiusM = WORLD.pickupRadiusM) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const radius = Number(radiusM);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius <= 0) return null;
  let best = null;
  let bestDistance = radius;
  for (const yard of SHIPYARDS) {
    const distance = Math.hypot(yard.x - x, yard.y - y);
    if (distance <= bestDistance) {
      best = yard;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Distance from `point` to the closest hull of any squadron afloat (S155-C). The enemies
 * use it to decide what is near them: with several commands on the water, a hostile is
 * not forgotten because the squadron she is chasing is not the one holding the helm.
 */
export function distanceToFleet(world, point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Infinity;
  let best = Infinity;
  for (const squadron of afloatSquadrons(world)) {
    for (const hull of [squadron.ship, ...squadron.escorts]) {
      best = Math.min(best, Math.hypot(hull.x - x, hull.y - y));
    }
  }
  return best;
}

/** The shipyard the captain's hull is moored at right now, or null at sea (S112). */
export function shipyardOfCaptain(world) {
  return currentShipyard(world?.ship ?? null);
}

/** The yard a voyage starts from, so the builder screen knows where it opens (S112). */
export function homeShipyard() {
  return SHIPYARDS.find((yard) => yard.home) ?? SHIPYARDS[0] ?? null;
}

/**
 * Advance the ship one tick. `input.turn` is helm (-1 port .. +1 starboard),
 * `input.throttle` is sail (0 .. 1), `input.wind` is the wind it feels. Speed
 * eases; it never teleports. The wind trims the speed and pushes the hull
 * sideways (S17).
 */
/**
 * The one hull physics every ship obeys (S57): the player's, the enemy's and the
 * escort's. `stepShip` and the enemy AI both call it, so a rule added here reaches
 * every hull on the sea instead of only the captain's.
 *
 * The hull is described by `speedKn` (its own maximum) and `turnFactor` (its share of
 * the rudder rate, S48). `input.wind` is optional: a ship that feels no wind simply
 * sails straight.
 */
export function stepHull(ship, input = {}, dt = 0) {
  const turn = clamp(input.turn ?? 0, -1, 1);
  const throttle = clamp(input.throttle ?? 0, 0, 1);
  const wind = input.wind ?? null;

  // A following wind lets the ship make more way; a head wind holds it back.
  const windFactor = wind ? windEffect(wind, ship.heading ?? 0).speedFactor : 1;
  // Shredded sails slow the hull (S89). The curve was declared in combat.js since S5 and
  // nothing applied it, so a dismasted ship sailed as fast as a whole one. It is applied
  // here, in the one physics every hull obeys (S57), so the rule reaches the player, the
  // escorts and the enemies alike.
  const rigFactor = riggingSpeedFactor(input.rigging);
  const sailKn = ship.speedKn * windFactor * rigFactor;
  // The oars are a reserve propulsion, not an extra engine (S159-A): the hull makes way at
  // the greater of sail and oars, never their sum. `input.oars` is what the sea knows about
  // the crew at the oars; a hull that does not declare them carries no such record and sails
  // exactly as it always did (S159-I).
  const oarKn = Number(input.oars?.speedKn) > 0 ? Number(input.oars.speedKn) : 0;
  const targetSpeed = throttle * speedUnderOars(sailKn, oarKn);
  const currentSpeedKn = moveToward(
    ship.currentSpeedKn ?? 0,
    targetSpeed,
    ship.speedKn * WORLD.accelerationRate * dt,
  );

  // The hull's own share of the rudder rate: a heavy hull turns wider (S48). A ship with
  // no factor on record turns at the base rate, as it always did. A crew at the oars sharpens
  // the helm (S159-F), which is the tactical manoeuvre the oars are for.
  const turnFactor = Number.isFinite(ship.turnFactor) && ship.turnFactor > 0 ? ship.turnFactor : 1;
  const oarTurn = oarTurnFactor(input.oars ?? null);
  const heading = normalizeAngle(
    (ship.heading ?? 0) + turn * WORLD.maxTurnRate * turnFactor * oarTurn * dt,
  );
  const distanceM = currentSpeedKn * KN_TO_MS * WORLD.arcadeScale * dt;

  let x = ship.x + Math.cos(heading) * distanceM;
  let y = ship.y + Math.sin(heading) * distanceM;

  // The wind pushes the hull sideways, perpendicular to where the bow points.
  if (wind) {
    const { driftFactor } = windEffect(wind, heading);
    const driftM = distanceM * driftFactor;
    const beam = heading + Math.PI / 2;
    const side = Math.cos(wind.direction - beam) >= 0 ? 1 : -1;
    x += Math.cos(beam) * driftM * side;
    y += Math.sin(beam) * driftM * side;
  }

  const radius = Math.hypot(x, y);
  if (radius > WORLD.radiusM) {
    const scale = WORLD.radiusM / radius;
    x *= scale;
    y *= scale;
  }

  return { ...ship, x, y, heading, currentSpeedKn };
}

/**
 * The share of its speed a hull may still make with the rigging it has left (S89).
 *
 * `combatant` is the same shape `combat.js` hands around; anything missing, broken or
 * absent means a whole rig, because a ship with no combat state has taken no damage. The
 * curve is the one `speedFactor` in combat.js declares, kept here so the physics stays
 * pure and does not import the combat model back.
 */
export function riggingSpeedFactor(combatant) {
  const rigging = Number(combatant?.condition?.rigging);
  if (!Number.isFinite(rigging)) return 1;
  return 0.3 + 0.7 * (clamp(rigging, 0, 100) / 100);
}

/** The captain's hull: the shared physics of `stepHull`, nothing of its own (S57). */
export function stepShip(ship, input = {}, dt = 0) {
  return stepHull(ship, input, dt);
}

function spawnOne(rnd, ship, type, zone, id) {
  const angle = rnd() * Math.PI * 2;
  const distance = WORLD.spawnRadiusM * (0.4 + 0.6 * rnd());
  let x = ship.x + Math.cos(angle) * distance;
  let y = ship.y + Math.sin(angle) * distance;
  const radius = Math.hypot(x, y);
  if (radius > WORLD.radiusM) {
    const scale = (WORLD.radiusM * 0.97) / radius;
    x *= scale;
    y *= scale;
  }

  if (type === "treasure") {
    const [min, max] = WORLD.treasureBaseGold;
    const gold = Math.round((min + rnd() * (max - min)) * zone.lootFactor);
    return { id, type, x, y, gold, zoneId: zone.id };
  }

  // A spawn is never placed inside the safe zone around the shipyard (S66).
  if (type === "enemy") {
    const safe = spawnOutsideSafeZone(angle, Math.hypot(x - ship.x, y - ship.y));
    const point = { x: ship.x + safe.x, y: ship.y + safe.y };
    if (insideSafeZone(point)) {
      const pushed = clampToSafeZone(point);
      x = pushed.x;
      y = pushed.y;
    }
  }

  const pool = ENEMY_POOLS[zone.id] ?? ENEMY_POOLS.costera;
  const hullId = pool[Math.floor(rnd() * pool.length)];
  const hull = HULLS.find((h) => h.id === hullId);
  return {
    id,
    type,
    x,
    y,
    hullId,
    zoneId: zone.id,
    drift: {
      heading: rnd() * Math.PI * 2,
      speedKn: hull ? referenceSpeedKn(hull) * (0.3 + 0.2 * rnd()) : 2,
    },
  };
}

/**
 * Create the sea for a ship starting a voyage. `ship` needs at least `speedKn`;
 * its position is the origin (the home port).
 *
 * With a fleet that holds more than one captain afloat, every one of them puts to sea at
 * once (S155-C): the fleet's own captain keeps the helm, and each other squadron takes her
 * own station a little apart from her, so two commands do not start inside each other.
 *
 * `modeId` is the game the player picked (S171). It defaults to the shipped one, which is
 * what every caller written before modes existed keeps, and it is stamped on the world so
 * the sea and the saves know which rule they are playing.
 */
export function createWorld(seed, ship, gold = 0, fleet = null, modeId = DEFAULT_MODE_ID) {
  const world = {
    seed: seed >>> 0,
    rngState: seed >>> 0,
    nextId: 1,
    gold,
    /** Seconds of voyage elapsed; the wind is a function of this (S16). */
    timeS: 0,
    ship: {
      // just outside the home-port island, bow pointed to open water
      x: 210,
      y: 70,
      heading: 0,
      currentSpeedKn: 0,
      speedKn: ship.speedKn ?? 5,
      // Her identity and her load travel with her (S159). Without them the sea knew a
      // position and a speed and nothing else: `hullId` was gone, so no rule that reads the
      // hull could ever apply to the captain, and `id` was gone, so a per-hull record (the
      // effort at the oars) had nothing to be keyed by.
      id: ship.id ?? null,
      ...hullSpec(ship),
    },
    /** The rest of the fleet, in formation behind the captain (S36). */
    escorts: [],
    encounters: [],
    /**
     * The mode this sea plays (S171). Every world carries her own, so a save written before
     * modes existed opens as "batalla por nivel", which is what it was played as.
     */
    mode: modeById(modeId).id,
    /** The level the sea is on, the sails it owns, and the victories it has won (S140/S150). */
    level: 1,
    levelEnemies: [],
    levelVictories: 0,
    /** The squadron holding the helm, and the standing orders of every squadron (S155-D). */
    activeId: null,
    order: { throttle: 0, turn: 0 },
    squadrons: [],
  };
  const own = fleet?.captainId ?? ship.id ?? null;
  // The fleet's captain holds the helm (S155-C): she is the hull the player sails, and a
  // save written before captains existed has exactly one, so the old voyage is unchanged.
  world.activeId = own;
  // The active squadron keeps forming exactly as she always did (S35/S130): the hulls of her
  // own command marked to sail, the captain first. Another captain's hulls are not hers to
  // form up, which is the whole point of a sea with several commands.
  const leading = squadrons(fleet).find((squadron) => squadron.captain.id === own) ?? null;
  // A hull of her own command that is actually afloat and marked to sail (S35/S130): the
  // old rule, restricted to the command that holds the helm. Another captain's hulls are
  // not hers to form up, which is the whole point of a sea with several commands.
  const ownCommand = new Set((leading?.ships ?? []).map((entry) => entry.id));
  world.escorts = shipsSailingAtSea(fleet)
    .filter((entry) => entry.id !== own && ownCommand.has(entry.id))
    .map((entry, index) => createEscort({ ...entry, ...hullSpec(entry) }, world.ship, index));
  // Every other captain puts to sea too, each with her own formation and her own station
  // apart from the first, so the sea shows every command at once (S155-C).
  const others = seaSquadrons(fleet).filter((squadron) => squadron.captain.id !== own);
  world.squadrons = others.map((squadron, index) => {
    // Her own identity, not the captain-of-the-helm's (S159): spreading `world.ship` here
    // gave every command the first captain's hull, crew and load, so a second captain would
    // have rowed with another woman's crew.
    const at = { ...world.ship, ...squadronStation(world.ship, index), ...hullSpec(squadron.captain) };
    return {
      id: squadron.captain.id,
      ship: at,
      escorts: squadron.ships
        .filter((entry) => entry.id !== squadron.captain.id)
        .map((entry, station) => createEscort({ ...entry, ...hullSpec(entry) }, at, station)),
      order: { throttle: 0, turn: 0 },
    };
  });
  // A fresh sea opens with the mode's own start (S171): before modes, this was always the
  // level 1 quota. The mode decides now, and "batalla por nivel" decides exactly that.
  return updateWorld(modeOf(world).seed(world), {}, 0);
}

/**
 * What a fleet entry contributes to the sea beyond her position (S159).
 *
 * The hull she is, how loaded she sails and the men actually aboard: the three things her
 * own oars are read from. A fleet entry that carries none of them yields an empty record, so
 * the hull behaves exactly as she did before the rule existed (S159-I).
 */
export function hullSpec(entry) {
  if (!entry || typeof entry !== "object") return {};
  // The living crew is the one that pulls: `crewAlive` shrinks with casualties (S22/S23)
  // and the bought complement only says what she was rigged with.
  const aboard = crewObject(entry.crewAlive) ?? crewObject(entry.crew);
  return {
    ...(typeof entry.hullId === "string" ? { hullId: entry.hullId } : {}),
    ...(Number.isFinite(entry.loadFraction) ? { loadFraction: entry.loadFraction } : {}),
    ...(aboard ? { crew: aboard } : {}),
  };
}

/** A crew record as a plain copy, or null when the value is not one. */
function crewObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return { ...value };
}

/**
 * Where the `index`-th extra squadron starts, in metres from the leading one (S155-C).
 *
 * The stations are spread around the home port on a wide ring: two commands that opened on
 * top of each other would be one command with a rendering bug, and the player could not
 * click either of them.
 */
function squadronStation(captain, index) {
  const ring = 420 + 160 * Math.floor(index / 6);
  const angle = (index % 6) * (Math.PI / 3) + Math.PI / 6;
  return {
    x: Math.max(-WORLD.radiusM, Math.min(WORLD.radiusM, (captain.x ?? 0) + Math.cos(angle) * ring)),
    y: Math.max(-WORLD.radiusM, Math.min(WORLD.radiusM, (captain.y ?? 0) + Math.sin(angle) * ring)),
    heading: Number.isFinite(captain.heading) ? captain.heading : 0,
    currentSpeedKn: 0,
  };
}

/**
 * Advance the whole sea one tick: move the ship and the enemy sails, collect
 * treasures under the pickup radius, and keep encounter density matched to the
 * zone the ship is sailing in.
 */
export function updateWorld(world, input = {}, dt = 0) {
  const timeS = (world.timeS ?? 0) + dt;
  // The wind the ship feels right now; the caller may override it (tests, replay).
  const wind = input.wind ?? windAt(world.seed, timeS);
  // The effort left in every crew at the oars (S159-D), and the record that carries it into
  // the physics (S159-A). A hull that declares no banks gets an empty record and sails
  // exactly as she did before the rule existed (S159-I).
  const oars = oarRecord(world, input, wind, dt);
  // `rigging` carries the captain's combat state, so her shredded sails slow her too
  // (S89); a caller that knows nothing about combat sails with a whole rig.
  const ship = stepShip(
    world.ship,
    { ...input, wind, oars: oars.forHull(world.ship), rigging: input.rigging ?? world.playerCombat },
    dt,
  );

  // The rest of the fleet keeps its station relative to the captain, each hull with
  // its own speed, so a slow escort really does fall behind (S36).
  const escorts = (world.escorts ?? []).map((escort, index) =>
    stepEscort(
      escort,
      escortStation(ship, index),
      { wind, captainSpeedKn: ship.currentSpeedKn, oars: oars.forHull(escort) },
      dt,
    ),
  );
  // The squadrons that are not holding the helm still sail (S155-D): each one obeys the
  // standing order she was last given, with her own helm and her own formation. Without
  // this a second captain would be a drawing on the water instead of a command.
  const squadrons = (Array.isArray(world.squadrons) ? world.squadrons : [])
    .filter(isSquadron)
    .map((squadron) => stepSquadron(squadron, wind, dt, oars));
  let rngState = world.rngState;
  let nextId = world.nextId;
  const rnd = () => {
    const r = mulberry32(rngState);
    rngState = r.state;
    return r.value;
  };

  let gold = world.gold;
  let collected = 0;
  // The level the sea is on and the sails it owns (S140). A save or a test that knows
  // nothing about levels sails the level it has, which is level 1. A save written before
  // levels existed has no quota record: the sails already afloat become that record, so
  // opening an old save does not seed a second quota on top of it.
  const level = normaliseLevel(world.level);
  let levelEnemies = Array.isArray(world.levelEnemies) ? [...world.levelEnemies] : [];
  // The victories this level has won so far (S150). A save or a test that knows nothing
  // about them starts the level with none, which is what a fresh level is.
  const levelVictories = normaliseVictories(world.levelVictories);
  if (levelEnemies.length === 0) {
    levelEnemies = world.encounters
      .filter((encounter) => encounter.type === "enemy")
      .map((encounter) => encounter.id)
      .filter((id) => Number.isFinite(id));
  }

  // move enemy sails, bounce them off the world's edge. An engaged enemy is under
  // its own combat AI, so the drift step hands control over and stays out of the way.
  let encounters = world.encounters.map((encounter) => {
    if (encounter.type !== "enemy" || encounter.engaged) return encounter;
    const distance = encounter.drift.speedKn * KN_TO_MS * WORLD.arcadeScale * 0.5 * dt;
    let x = encounter.x + Math.cos(encounter.drift.heading) * distance;
    let y = encounter.y + Math.sin(encounter.drift.heading) * distance;
    let heading = encounter.drift.heading;
    const radius = Math.hypot(x, y);
    if (radius > WORLD.radiusM * 0.98) {
      heading = normalizeAngle(heading + Math.PI);
      const scale = (WORLD.radiusM * 0.98) / radius;
      x *= scale;
      y *= scale;
    }
    // The water around the shipyard is closed to hostiles (S66): a sail that drifts
    // into it is put back on its own line out and turns away.
    if (insideSafeZone({ x, y })) {
      const pushed = clampToSafeZone({ x, y });
      x = pushed.x;
      y = pushed.y;
      heading = normalizeAngle(heading + Math.PI);
    }
    return { ...encounter, x, y, drift: { ...encounter.drift, heading } };
  });

  // Collect treasures and wrecks under any hull of the squadron (S128). The captain used
  // to be the only one who could pick anything up, so a prize she sailed past went to
  // nobody: the sea has no reason to care which of our hulls reaches it.
  const pickers = [ship, ...escorts];
  encounters = encounters.filter((encounter) => {
    if (encounter.type !== "treasure" && encounter.type !== "wreck") return true;
    const reached = pickers.some(
      (hull) => Math.hypot(encounter.x - hull.x, encounter.y - hull.y) <= WORLD.pickupRadiusM,
    );
    if (!reached) return true;
    gold += encounter.gold;
    collected += 1;
    return false;
  });

  // An enemy in combat is not forgotten for being far: it is the one hunting you, and
  // erasing it mid-fight reads as the sea losing its memory (S58). Past the disengage
  // radius it gives up the chase instead, releases its combat and goes back to drifting,
  // so it stays on the sea as a sail that lost you.
  encounters = encounters.map((encounter) => {
    if (encounter.type !== "enemy" || !encounter.engaged) return encounter;
    const distance = Math.hypot(encounter.x - ship.x, encounter.y - ship.y);
    if (distance <= WORLD.disengageRadiusM) return encounter;
    const { combat, ...rest } = encounter;
    return {
      ...rest,
      engaged: false,
      wasEngaged: true,
      drift: { heading: rest.heading ?? rest.drift?.heading ?? 0, speedKn: rest.drift?.speedKn ?? 1 },
    };
  });

  // Forget the sails left far behind. An enemy still in combat is never dropped here:
  // only the disengage rule above may release it. One that gave up the chase is
  // forgotten much later, so it is not erased the moment it disengages (S58).
  encounters = encounters.filter((encounter) => {
    const distance = Math.hypot(encounter.x - ship.x, encounter.y - ship.y);
    if (encounter.engaged) return true;
    const forget = encounter.wasEngaged
      ? WORLD.disengagedDespawnRadiusM
      : WORLD.despawnRadiusM;
    return distance <= forget;
  });

  // A defeated enemy never comes back (S139). The spawner below skips every id this sea
  // has already finished.
  const finished = defeatedEnemyIds(world);

  // A level caps how many hostiles **each zone** holds, and the water the captain is in is
  // topped back up to that cap (S150). The player asked for exactly that (verbatim): "en
  // cada nivel habra un maximo de enemigos por zona, y se crearan los enemigos de la misma
  // zona que hayan sido undidos o capturados". So the sail you beat is replaced by another
  // of her own water, and no water ever grows past the cap, however long you sail it.
  //
  // S171: the cap is the mode's, not the level's. "Batalla por nivel" answers with the
  // level curve, which is what this line always did; a mode with a different rule answers
  // with hers, and `updateWorld` never learns which one is playing.
  const mode = modeOf(world);
  const zone = zoneAtRadius(Math.hypot(ship.x, ship.y));
  const cap = mode.enemiesPerZone(world);
  const here = encounters.filter((e) => e.type === "enemy" && e.zoneId === zone.id).length;
  // An id is never handed out twice, so the sea cannot hold two sails that answer to the same
  // name: a save whose `nextId` sits behind a live sail would otherwise spawn her twin.
  for (const entry of encounters) if (Number.isFinite(entry.id)) finished.add(entry.id);
  for (let i = here; i < cap; i += 1) {
    while (finished.has(nextId)) nextId += 1;
    const id = nextId;
    encounters.push({ ...spawnOne(rnd, ship, "enemy", zone, id), ...mode.stamp(world) });
    levelEnemies.push(id);
    finished.add(id);
    nextId += 1;
  }

  // Treasures keep the top-up they always had: they are not the level's business.
  const wantTreasures = Math.max(0, zone.encounters - cap);
  const haveTreasures = encounters.filter((e) => e.type === "treasure").length;

  for (let i = haveTreasures; i < wantTreasures; i += 1) {
    encounters.push(spawnOne(rnd, ship, "treasure", zone, nextId));
    nextId += 1;
  }

  const next = {
    ...world,
    ship,
    escorts,
    squadrons,
    order: normaliseOrder(world.order),
    gold,
    encounters,
    rngState,
    nextId,
    collected,
    timeS,
    level,
    levelEnemies,
    levelVictories,
    // The effort left in every crew at the oars, after this step (S159-D), and what the
    // captain's own oars are contributing right now, for the HUD (S159-E).
    oarEffort: oars.effort,
    oarReading: oars.captain,
    // The sea her ships have lit as they sail (S167-C). Every hull of every squadron
    // discovers, not only the one under the helm: they are all the player's ships. The
    // record only ever grows, so a place once seen is never dark again (S167-B).
    discovered: revealFleet(world.discovered, [ship, ...escorts, ...squadrons.flatMap((squadron) => [squadron.ship, ...(squadron.escorts ?? [])])]),
  };

  // S171: whether the sea advances is the mode's question, not the level's. "Batalla por
  // nivel" answers exactly what the two lines above used to do — advance when the victories
  // the level asks for are won — and `advance` returns the next world, or null to stay.
  const advanced = mode.advance(next);
  return advanced ?? next;
}

/**
 * The oar record of every hull afloat (S159-A/D/E/F), advanced one step.
 *
 * The oars are a reserve propulsion, not an extra engine: the hull makes way at the greater
 * of sail and oars, never their sum. That decision, the speed it yields and the effort it
 * costs are all the oars model's business; this only gathers what the sea knows about each
 * hull and hands it over, because `stepHull` and `stepEscort` are pure and cannot look a hull
 * up.
 *
 * The effort lives in `world.oarEffort`, keyed by hull id, exactly as the provisions do
 * (S132): a galleass that sprinted has less left in her than a fresh one, and a hull that
 * rested has recovered. A hull that declares no banks carries no record at all, so she sails
 * exactly as she did before the rule existed (S159-I).
 */
function oarRecord(world, input, wind, dt) {
  const effortIn = normaliseEffort(world.oarEffort);
  // Only the hulls afloat keep a record (S159-D). A prize that joined and later sank, or a
  // hull sold in a yard, left her row in a map nobody ever pruned: measured, forty prizes
  // through one voyage left forty-one entries for one hull afloat, and the sea save grew
  // with them forever. The record follows the hull, as the provisions do (S132).
  const next = {};
  const hulls = [
    { hull: world.ship, combat: input.rigging ?? world.playerCombat, throttle: input.throttle ?? 0 },
    ...(Array.isArray(world.escorts) ? world.escorts : [])
      .filter(isShip)
      .map((escort) => ({ hull: escort, combat: escort.combat, throttle: 1 })),
    // A save may hold a broken squadron list, and the sea already ignores those entries
    // everywhere else (S155-C). Reading one here threw before the physics ever ran, so the
    // list is filtered by the same rule the rest of the model uses.
    ...(Array.isArray(world.squadrons) ? world.squadrons : [])
      .filter(isSquadron)
      .flatMap((squadron) => [
        { hull: squadron.ship, combat: squadron.combat, throttle: squadron.order?.throttle ?? 0 },
        ...(Array.isArray(squadron.escorts) ? squadron.escorts : [])
          .filter(isShip)
          .map((escort) => ({ hull: escort, combat: escort.combat, throttle: 1 })),
      ]),
  ];

  const records = new Map();
  for (const { hull, combat, throttle } of hulls) {
    const id = hull?.id;
    if (!id) continue;
    const spec = hullById(hull.hullId);
    if (!hasOarBanks(spec)) continue;
    const effort = Number.isFinite(effortIn[id]) ? effortIn[id] : 1;
    const loadFraction = Number.isFinite(hull.loadFraction) ? hull.loadFraction : 0;
    const oarKn = oarSpeedKn(spec, combat?.crew ?? hull.crew, { effort, loadFraction });
    // The sail speed this hull would make with no oars at all, computed the way `stepHull`
    // does so the `max()` is decided on the same numbers the physics will use. The throttle
    // is NOT folded in: it scales both propulsions equally, and folding it here made a hull
    // at rest look like a hull under oars, spending her crew's effort while going nowhere.
    const windFactor = wind ? windEffect(wind, hull.heading ?? 0).speedFactor : 1;
    const rigFactor = riggingSpeedFactor(combat);
    const sailKn = (Number(hull.speedKn) || 0) * windFactor * rigFactor;
    // Nobody pulls an oar on a hull whose captain has the way off her.
    const underway = (Number(throttle) || 0) > 0;
    const rowing = underway && rowingTarget({ sailKn, oarKn });
    next[id] = effortStep(effort, { rowing, dt });
    records.set(id, { speedKn: oarKn, effort, rowing });
  }

  return {
    effort: next,
    forHull: (hull) => records.get(hull?.id) ?? null,
    // What the captain's oars are doing this tick, for the HUD to read (S159-E). The player
    // asked that the screen say how much the oars are adding when they add anything, and a
    // hull with no banks simply has no reading at all.
    captain: records.get(world.ship?.id) ?? null,
  };
}

/**
 * The discovery record with this step's fleet lighting the sea (S167-C).
 *
 * The fog is a screen rule, but the discovery is a fact of the voyage and belongs with the
 * rest of the sea save: reloading must not put the dark back over water the player already
 * crossed (S167-F). With the fog off the record is left alone, so a player who never turns
 * it on never pays for the cells.
 */
function revealFleet(known, hulls) {
  if (!fogEnabled()) return normaliseDiscovered(known);
  const radius = Number(FOG.revealRadiusM);
  return discoveredWith(known, hulls.filter(isShip), Number.isFinite(radius) && radius > 0 ? radius : FOG.revealRadiusM);
}

/**
 * Advance one squadron that is not holding the helm (S155-D).
 *
 * She obeys her standing orders: the sail she carries and the helm she holds. Her escorts
 * keep their station behind her with their own hulls, exactly as the active squadron's do,
 * so a second command looks and moves like the first one.
 */
function stepSquadron(squadron, wind, dt, oars = null) {
  const order = normaliseOrder(squadron.order);
  const ship = stepShip(
    squadron.ship,
    { throttle: order.throttle, turn: order.turn, wind, oars: oars?.forHull(squadron.ship) ?? null },
    dt,
  );
  const escorts = (Array.isArray(squadron.escorts) ? squadron.escorts : [])
    .filter(isShip)
    .map((escort, index) =>
      stepEscort(
        escort,
        escortStation(ship, index),
        { wind, captainSpeedKn: ship.currentSpeedKn, oars: oars?.forHull(escort) ?? null },
        dt,
      ),
    );
  return { ...squadron, ship, escorts, order };
}

/**
 * The effort left in each hull's crew at the oars, keyed by hull id (S159-D).
 *
 * The sea keeps it per hull, exactly as it keeps the provisions (S132): a galleass that
 * sprinted has less left in her than a fresh one, and a hull that was resting has recovered.
 * A missing, broken or out-of-range value reads as a fresh crew, so a save written before
 * this rule opens with rested rowers.
 */
export function normaliseEffort(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const result = {};
  for (const [id, effort] of Object.entries(source)) {
    if (typeof id !== "string" || id.length === 0) continue;
    const number = Number(effort);
    if (!Number.isFinite(number)) continue;
    result[id] = Math.min(1, Math.max(0, number));
  }
  return result;
}

/**
 * Whether a sail survives the seeding of a new level (S162).
 *
 * A hull the sea has not finished with belongs to the player's voyage, not to the level that
 * is being replaced: one that has struck her colours is a prize still to be taken, and one
 * still fighting is a fight still on. Everything else — a sail that is only drifting, with no
 * combat of its own — is the previous level's quota and goes with it.
 */
function keepsAcrossLevels(encounter) {
  if (!encounter || encounter.type !== "enemy") return false;
  const status = encounter.combat?.status;
  if (status === "surrendered") return true;
  return status === "fighting";
}

/**
 * Seed the quota of `level` in the water the captain is in (S140-B/S150).
 *
 * The level caps each zone, so a level is seeded where it starts: the sails of the previous
 * level are dropped and `enemiesPerZone(level)` fresh hostiles are placed in the band the
 * captain is in. The rest of the water fills itself as she sails into it, which is what
 * keeps the whole sea from paying for a cap it is not using.
 *
 * Every seeded sail is remembered by id in `levelEnemies`. The victory count starts clean:
 * a new level is new work, not the leftover of the one just finished.
 */
export function seedLevel(world, level) {
  const base = world && typeof world === "object" ? world : {};
  const nextLevel = normaliseLevel(level);
  const quota = enemiesPerZone(nextLevel);
  const zone = zoneAtRadius(Math.hypot(base.ship?.x ?? 0, base.ship?.y ?? 0));
  let rngState = Number.isFinite(base.rngState) ? base.rngState : 1;
  let nextId = Number.isFinite(base.nextId) ? base.nextId : 1;
  const rnd = () => {
    const r = mulberry32(rngState);
    rngState = r.state;
    return r.value;
  };

  const finished = defeatedEnemyIds(base);
  // The sails of the previous level are not part of this one, with two exceptions that are
  // the player's and not the level's (S162): a hull that has struck her colours is a prize
  // waiting to be boarded, and a hull still in the fight is one the player has already spent
  // shot and blood on. Erasing either of them took away something the player had earned: the
  // capture vanished and no record of the victory was left behind.
  const encounters = (base.encounters ?? []).filter(
    (entry) => entry.type !== "enemy" || keepsAcrossLevels(entry),
  );
  const levelEnemies = [];
  const ship = base.ship ?? { x: 0, y: 0 };
  for (let i = 0; i < quota; i += 1) {
    // Never reuse an id this sea already defeated (S139).
    while (finished.has(nextId)) nextId += 1;
    const id = nextId;
    encounters.push({ ...spawnOne(rnd, ship, "enemy", zone, id), level: nextLevel });
    levelEnemies.push(id);
    finished.add(id);
    nextId += 1;
  }

  return { ...base, level: nextLevel, levelEnemies, levelVictories: 0, encounters, rngState, nextId };
}

/**
 * How many of the current level's enemies are still afloat (S140-B). An id the sea has
 * already defeated counts as done, whether or not the hull is still in `encounters`.
 * A sea with no level record has nothing left to clear, so it reads 0 and never throws.
 *
 * S150: this is a reading of the sea, not the trigger of a level. The level advances on
 * victories; a captain who never fires a shot must never climb one.
 */
export function levelRemaining(world) {
  const ids = world?.levelEnemies;
  if (!Array.isArray(ids)) return 0;
  const finished = defeatedEnemyIds(world);
  const afloat = new Set((world?.encounters ?? []).filter((e) => e.type === "enemy").map((e) => e.id));
  let remaining = 0;
  for (const id of ids) {
    if (!Number.isFinite(id)) continue;
    if (finished.has(id)) continue;
    if (!afloat.has(id)) continue;
    remaining += 1;
  }
  return remaining;
}

/**
 * A victory count as a whole number of at least zero (S150). A save that never heard of
 * victories, or a broken one, reads as none: a corrupted field must not open a level.
 */
export function normaliseVictories(value) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count));
}

/**
 * Count a beaten enemy against the level (S150). The player chose to advance "Por cantidad
 * de victorias" (verbatim), so the fight that ends is the unit of progress, not the sail
 * that happens to be out of sight.
 *
 * `encounter` is the sail that went down: her zone is not needed to count her, but it is
 * what the sea reads to know which water is short a sail, so an unknown one still counts.
 */
export function recordVictory(world, encounter) {
  const base = world && typeof world === "object" ? world : {};
  if (!encounter || encounter.type !== "enemy") return { ...base, levelVictories: normaliseVictories(base.levelVictories) };
  return { ...base, levelVictories: normaliseVictories(base.levelVictories) + 1 };
}

/** Nearest encounter of a type, for HUD warnings and minimap blips. */
export function nearestEncounter(world, type) {
  let best = null;
  let bestDistance = Infinity;
  for (const encounter of world.encounters) {
    if (encounter.type !== type) continue;
    const distance = Math.hypot(encounter.x - world.ship.x, encounter.y - world.ship.y);
    if (distance < bestDistance) {
      best = encounter;
      bestDistance = distance;
    }
  }
  return best ? { encounter: best, distance: bestDistance } : null;
}

/** Serialise for autosave. Returns a string; deserializeWorld validates it back. */
/**
 * The ids of the enemies this sea has already finished (S139).
 *
 * A defeated enemy is dropped from `encounters`, and without a record the zone's top-up
 * put the same id back with its `surrendered` status intact: the same prize was captured on
 * every frame. This is the record, kept on the world so it survives a save.
 */
export function defeatedEnemyIds(world) {
  const list = world?.defeated;
  if (!Array.isArray(list)) return new Set();
  return new Set(list.filter((id) => Number.isFinite(id)));
}

/** Remember a defeated enemy by id, so the sea can never bring her back (S139). */
export function markDefeated(world, enemyId) {
  const id = Number(enemyId);
  const base = world && typeof world === "object" ? world : {};
  const ids = defeatedEnemyIds(base);
  if (!Number.isFinite(id)) return { ...base, defeated: [...ids] };
  ids.add(id);
  return { ...base, defeated: [...ids] };
}

export function serializeWorld(world) {
  return JSON.stringify({
    v: 1,
    // The mode this sea plays (S172). It is written even when it is the shipped one, so a
    // save never depends on a default that a later version could change. The field is
    // additive: `v` stays 1 because `deserializeWorld` rejects anything else, and raising
    // it would turn every saved voyage into "no save".
    mode: modeOf(world).id,
    seed: world.seed,
    rngState: world.rngState,
    nextId: world.nextId,
    gold: world.gold,
    timeS: world.timeS ?? 0,
    ship: world.ship,
    escorts: world.escorts ?? [],
    // The squadrons that are not holding the helm, with their own positions and their own
    // standing orders (S155-D). The active one is `ship`/`escorts` above, as it always was.
    activeId: typeof world.activeId === "string" ? world.activeId : null,
    order: normaliseOrder(world.order),
    squadrons: (Array.isArray(world.squadrons) ? world.squadrons : [])
      .filter(isSquadron)
      .map((squadron) => ({
        id: squadron.id,
        ship: squadron.ship,
        escorts: (Array.isArray(squadron.escorts) ? squadron.escorts : []).filter(isShip),
        order: normaliseOrder(squadron.order),
      })),
    encounters: world.encounters,
    // The fights this sea has finished (S139): without them a defeated enemy comes back.
    defeated: [...defeatedEnemyIds(world)],
    // The level and the sails it owns (S140), and the victories it has won (S150).
    level: normaliseLevel(world.level),
    levelEnemies: Array.isArray(world.levelEnemies)
      ? world.levelEnemies.filter((id) => Number.isFinite(id))
      : [],
    levelVictories: normaliseVictories(world.levelVictories),
    // The effort left in every crew at the oars (S159-D): a hull that sprinted stays tired.
    oarEffort: normaliseEffort(world.oarEffort),
    // The sea the player has lit (S167-F). What she has seen, she keeps.
    discovered: serializeDiscovered(world.discovered),
  });
}

export function deserializeWorld(json) {
  try {
    const data = JSON.parse(json);
    if (!data || data.v !== 1) return null;
    if (!Number.isFinite(data.rngState) || !Number.isFinite(data.gold)) return null;
    if (!data.ship || !Number.isFinite(data.ship.x) || !Number.isFinite(data.ship.y)) return null;
    if (!Array.isArray(data.encounters)) return null;
    return {
      // S172: a save written before modes existed has none, and it plays the shipped mode,
      // which is what it was played as. An unknown or broken id is the same case.
      mode: modeById(data.mode).id,
      seed: data.seed >>> 0,
      rngState: data.rngState | 0,
      nextId: Number.isFinite(data.nextId) ? data.nextId : data.encounters.length + 1,
      gold: data.gold,
      // A save from before the wind existed starts its clock at zero.
      timeS: Number.isFinite(data.timeS) ? data.timeS : 0,
      ship: {
        x: data.ship.x,
        y: data.ship.y,
        heading: Number.isFinite(data.ship.heading) ? data.ship.heading : 0,
        currentSpeedKn: Number.isFinite(data.ship.currentSpeedKn) ? data.ship.currentSpeedKn : 0,
        speedKn: Number.isFinite(data.ship.speedKn) ? data.ship.speedKn : 5,
        // Her identity and her load come back with her (S159). The effort at the oars is
        // keyed by hull id and read from the hull she is: dropping either on load left the
        // record orphaned and the captain rowing nothing after every reload (S159-I).
        id: typeof data.ship.id === "string" ? data.ship.id : null,
        ...hullSpec(data.ship),
      },
      // A save written before the formation existed has no escorts: it sails with
      // the captain alone, which is exactly what it did (S39).
      escorts: Array.isArray(data.escorts)
        ? data.escorts.filter(
            (escort) =>
              escort &&
              typeof escort.id === "string" &&
              Number.isFinite(escort.x) &&
              Number.isFinite(escort.y),
          )
        : [],
      encounters: data.encounters,
      // A save written before the sea held several commands has none: the squadron in
      // `ship`/`escorts` is the whole sea, which is exactly what that save was (S155).
      activeId: typeof data.activeId === "string" ? data.activeId : null,
      order: normaliseOrder(data.order),
      squadrons: Array.isArray(data.squadrons)
        ? data.squadrons.filter(isSquadron).map((squadron) => ({
            id: squadron.id,
            ship: squadron.ship,
            escorts: Array.isArray(squadron.escorts) ? squadron.escorts.filter(isShip) : [],
            order: normaliseOrder(squadron.order),
          }))
        : [],
      defeated: Array.isArray(data.defeated) ? data.defeated.filter((id) => Number.isFinite(id)) : [],
      // A save written before levels existed opens at level 1 with no quota record, and
      // the sea adopts the sails she already has; a broken level opens at level 1 too.
      level: normaliseLevel(data.level),
      levelEnemies: Array.isArray(data.levelEnemies)
        ? data.levelEnemies.filter((id) => Number.isFinite(id))
        : [],
      // A save written before S150 knows no victories, which is a level that has won none.
      levelVictories: normaliseVictories(data.levelVictories),
      // A save written before the oars existed opens with rested crews (S159-I).
      oarEffort: normaliseEffort(data.oarEffort),
      // A save written before the fog opens with nothing discovered (S167-F). The fog is
      // opt-in, so it costs an old save nothing while it is off, and the player who turns it
      // on wants to see it.
      discovered: normaliseDiscovered(data.discovered),
    };
  } catch {
    return null;
  }
}
