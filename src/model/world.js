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

import { ZONES, HULLS } from "../data/naval-data.js";
import { referenceSpeedKn } from "./ship-model.js";
import { windAt, windEffect } from "./wind.js";

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
  /** Base treasure value before the zone loot factor, in gold. */
  treasureBaseGold: [50, 100],
};

export const ZONE_BANDS = [
  { id: "costera", maxRadiusM: 1200, encounters: 10, enemyShare: 0.15 },
  { id: "abierto", maxRadiusM: 3200, encounters: 16, enemyShare: 0.45 },
  { id: "abismo", maxRadiusM: WORLD.radiusM, encounters: 22, enemyShare: 0.6 },
];

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
    ZONE_BANDS.find((b) => radiusM < b.maxRadiusM) ?? ZONE_BANDS[ZONE_BANDS.length - 1];
  const zone = ZONES.find((z) => z.id === band.id);
  return { ...zone, ...band };
}

/**
 * Advance the ship one tick. `input.turn` is helm (-1 port .. +1 starboard),
 * `input.throttle` is sail (0 .. 1), `input.wind` is the wind it feels. Speed
 * eases; it never teleports. The wind trims the speed and pushes the hull
 * sideways (S17).
 */
export function stepShip(ship, input = {}, dt = 0) {
  const turn = clamp(input.turn ?? 0, -1, 1);
  const throttle = clamp(input.throttle ?? 0, 0, 1);
  const wind = input.wind ?? null;

  // A following wind lets the ship make more way; a head wind holds it back.
  const speedFactor = wind ? windEffect(wind, ship.heading ?? 0).speedFactor : 1;
  const targetSpeed = ship.speedKn * throttle * speedFactor;
  const currentSpeedKn = moveToward(
    ship.currentSpeedKn ?? 0,
    targetSpeed,
    ship.speedKn * WORLD.accelerationRate * dt,
  );

  const heading = normalizeAngle((ship.heading ?? 0) + turn * WORLD.maxTurnRate * dt);
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
 */
export function createWorld(seed, ship, gold = 0) {
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
    },
    encounters: [],
  };
  return updateWorld(world, {}, 0);
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
  const ship = stepShip(world.ship, { ...input, wind }, dt);
  let rngState = world.rngState;
  let nextId = world.nextId;
  const rnd = () => {
    const r = mulberry32(rngState);
    rngState = r.state;
    return r.value;
  };

  let gold = world.gold;
  let collected = 0;

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
    return { ...encounter, x, y, drift: { ...encounter.drift, heading } };
  });

  // collect treasures and wrecks under the ship
  encounters = encounters.filter((encounter) => {
    if (
      (encounter.type === "treasure" || encounter.type === "wreck") &&
      Math.hypot(encounter.x - ship.x, encounter.y - ship.y) <= WORLD.pickupRadiusM
    ) {
      gold += encounter.gold;
      collected += 1;
      return false;
    }
    return true;
  });

  // forget encounters left far behind
  encounters = encounters.filter(
    (encounter) =>
      Math.hypot(encounter.x - ship.x, encounter.y - ship.y) <= WORLD.despawnRadiusM,
  );

  // keep density matched to the current zone
  const zone = zoneAtRadius(Math.hypot(ship.x, ship.y));
  const wantEnemies = Math.round(zone.encounters * zone.enemyShare);
  const wantTreasures = zone.encounters - wantEnemies;
  const haveEnemies = encounters.filter((e) => e.type === "enemy").length;
  const haveTreasures = encounters.filter((e) => e.type === "treasure").length;

  for (let i = haveEnemies; i < wantEnemies; i += 1) {
    encounters.push(spawnOne(rnd, ship, "enemy", zone, nextId));
    nextId += 1;
  }
  for (let i = haveTreasures; i < wantTreasures; i += 1) {
    encounters.push(spawnOne(rnd, ship, "treasure", zone, nextId));
    nextId += 1;
  }

  return { ...world, ship, gold, encounters, rngState, nextId, collected, timeS };
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
export function serializeWorld(world) {
  return JSON.stringify({
    v: 1,
    seed: world.seed,
    rngState: world.rngState,
    nextId: world.nextId,
    gold: world.gold,
    timeS: world.timeS ?? 0,
    ship: world.ship,
    encounters: world.encounters,
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
      },
      encounters: data.encounters,
    };
  } catch {
    return null;
  }
}
