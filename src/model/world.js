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

import { ZONES, HULLS, SHIPYARDS, shipyardAt } from "../data/naval-data.js";
import { enemiesForLevel, normaliseLevel } from "./levels.js";
import { createEscort, escortStation, stepEscort } from "./formation.js";
import { shipsSailingAtSea } from "./fleet.js";
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
  const targetSpeed = ship.speedKn * throttle * windFactor * rigFactor;
  const currentSpeedKn = moveToward(
    ship.currentSpeedKn ?? 0,
    targetSpeed,
    ship.speedKn * WORLD.accelerationRate * dt,
  );

  // The hull's own share of the rudder rate: a heavy hull turns wider (S48). A ship with
  // no factor on record turns at the base rate, as it always did.
  const turnFactor = Number.isFinite(ship.turnFactor) && ship.turnFactor > 0 ? ship.turnFactor : 1;
  const heading = normalizeAngle((ship.heading ?? 0) + turn * WORLD.maxTurnRate * turnFactor * dt);
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
 */
export function createWorld(seed, ship, gold = 0, fleet = null) {
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
    /** The rest of the fleet, in formation behind the captain (S36). */
    escorts: [],
    encounters: [],
    /** The level the sea is on, and the ids of the sails that level owns (S140). */
    level: 1,
    levelEnemies: [],
  };
  world.escorts = shipsSailingAtSea(fleet)
    .filter((entry) => entry.id !== (fleet?.captainId ?? ship.id))
    .map((entry, index) => createEscort(entry, world.ship, index));
  // The first level is seeded here, because the level is the only source of enemies
  // (S140): a fresh sea holds exactly the level 1 quota.
  return updateWorld(seedLevel(world, 1), {}, 0);
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
  // `rigging` carries the captain's combat state, so her shredded sails slow her too
  // (S89); a caller that knows nothing about combat sails with a whole rig.
  const ship = stepShip(world.ship, { ...input, wind, rigging: input.rigging ?? world.playerCombat }, dt);

  // The rest of the fleet keeps its station relative to the captain, each hull with
  // its own speed, so a slow escort really does fall behind (S36).
  const escorts = (world.escorts ?? []).map((escort, index) =>
    stepEscort(
      escort,
      escortStation(ship, index),
      { wind, captainSpeedKn: ship.currentSpeedKn },
      dt,
    ),
  );
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

  // A defeated enemy never comes back (S139). The zone's density is a target for the
  // LEVEL's quota, not a licence to respawn a fight that is over: the spawner below skips
  // every id this sea has already finished.
  const finished = defeatedEnemyIds(world);

  // The level owns the enemy quota (S140): the zone's density is no longer a spawner, so
  // nothing here tops the hostiles back up. Treasures keep their top-up.
  const zone = zoneAtRadius(Math.hypot(ship.x, ship.y));
  const wantTreasures = Math.max(0, zone.encounters - enemiesForLevel(level));
  const haveTreasures = encounters.filter((e) => e.type === "treasure").length;

  for (let i = haveTreasures; i < wantTreasures; i += 1) {
    encounters.push(spawnOne(rnd, ship, "treasure", zone, nextId));
    nextId += 1;
  }

  const next = { ...world, ship, escorts, gold, encounters, rngState, nextId, collected, timeS, level, levelEnemies };

  // Clearing a level advances it, once (S140-C): the next quota is seeded and the level
  // record is moved, so a second tick cannot advance it again. A sea with no level record
  // (a save written before levels, a test that seeds its own sails) has nothing to clear
  // and simply adopts what it has: it must not jump a level on its first tick.
  if (levelEnemies.length > 0 && levelRemaining(next) === 0) return seedLevel(next, level + 1);
  return next;
}

/**
 * Seed exactly the quota of `level` (S140-B): the level is the only source of enemies.
 *
 * Every seeded sail is remembered by id in `levelEnemies`, which is what
 * `levelRemaining` counts, so a sail that drifts out of range is still part of the level
 * she belongs to. Anything already afloat that is not part of the new level's quota is
 * dropped: a new level starts on a clean slate instead of inheriting the old sails.
 */
export function seedLevel(world, level) {
  const base = world && typeof world === "object" ? world : {};
  const nextLevel = normaliseLevel(level);
  const quota = enemiesForLevel(nextLevel);
  const zone = zoneAtRadius(Math.hypot(base.ship?.x ?? 0, base.ship?.y ?? 0));
  let rngState = Number.isFinite(base.rngState) ? base.rngState : 1;
  let nextId = Number.isFinite(base.nextId) ? base.nextId : 1;
  const rnd = () => {
    const r = mulberry32(rngState);
    rngState = r.state;
    return r.value;
  };

  const finished = defeatedEnemyIds(base);
  // The sails of the previous level are not part of this one.
  const encounters = (base.encounters ?? []).filter((entry) => entry.type !== "enemy");
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

  return { ...base, level: nextLevel, levelEnemies, encounters, rngState, nextId };
}

/**
 * How many of the current level's enemies are still afloat (S140-B). An id the sea has
 * already defeated counts as done, whether or not the hull is still in `encounters`.
 * A sea with no level record has nothing left to clear, so it reads 0 and never throws.
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
    seed: world.seed,
    rngState: world.rngState,
    nextId: world.nextId,
    gold: world.gold,
    timeS: world.timeS ?? 0,
    ship: world.ship,
    escorts: world.escorts ?? [],
    encounters: world.encounters,
    // The fights this sea has finished (S139): without them a defeated enemy comes back.
    defeated: [...defeatedEnemyIds(world)],
    // The level and the sails it owns (S140).
    level: normaliseLevel(world.level),
    levelEnemies: Array.isArray(world.levelEnemies)
      ? world.levelEnemies.filter((id) => Number.isFinite(id))
      : [],
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
      defeated: Array.isArray(data.defeated) ? data.defeated.filter((id) => Number.isFinite(id)) : [],
      // A save written before levels existed opens at level 1 with no quota record, and
      // the sea adopts the sails she already has; a broken level opens at level 1 too.
      level: normaliseLevel(data.level),
      levelEnemies: Array.isArray(data.levelEnemies)
        ? data.levelEnemies.filter((id) => Number.isFinite(id))
        : [],
    };
  } catch {
    return null;
  }
}
