/**
 * Combat model: broadside gunnery in real time, per side, with ammunition effects.
 *
 * Design anchors from the workbook (06_Notas_y_formulas, R6):
 *  - "Q_o(d) = SUM(piezas que apuntan al enemigo, ...)" -> only pieces whose side
 *    faces the target and whose own range covers the distance can fire (S4).
 *  - "E_impacto = 0.5*m*v^2" and "no hay valores históricos 0-100 medidos" -> the
 *    damage scale below is a declared game convention; the damage SPLIT between
 *    hull, rigging and crew comes from the ammunition table (S5).
 *  - "los artilleros ... recargas más lentas" -> gunner shortage slows reloads.
 *
 * Time is compressed (COMBAT.timeScale) because a 240 s historical reload is not
 * fun to wait for; distance is NOT compressed (the world model already scales it).
 *
 * Combatant objects are mutable session state (unlike the pure derivations in
 * ship-model.js); fire, damage and tick functions mutate them in place.
 */

import { ammoById, hullById, pieceById } from "../data/naval-data.js";
import { referenceSpeedKn } from "./ship-model.js";
import { mulberry32 } from "./world.js";

export const COMBAT = {
  /** Enemies activate and can be engaged within this distance. */
  engageRadiusM: 620,
  /** Broadside arc: 60° each way from the beam perpendicular. */
  arcHalf: Math.PI / 3,
  baseAccuracy: 0.85,
  /**
   * Game convention: damage points per kg of shot at the muzzle. Calibrated so a
   * reference hull (COMBAT.referenceArqueo) goes down to about four clean
   * broadsides of a mid-sized gun deck, which is a fight you can actually finish
   * with the rounds a shipyard loadout carries.
   */
  damageScale: 10,
  /**
   * Hull tonnage that soaks exactly one unit of damage. A ship is as tough as its
   * arqueo relative to this reference, so a gran buque real outlasts a patache
   * (S6: deeper water fields heavier hulls).
   */
  referenceArqueo: 166,
  /** Crew damage points needed to kill one crew member. */
  casualtyPoints: 5,
  /** Crew condition at or below this % forces a surrender. */
  surrenderCrewPct: 40,
  /** Hull condition below this % makes an enemy try to flee. */
  fleeHullPct: 25,
  /**
   * Arcade time compression for reload clocks. A 90 s historical reload becomes
   * roughly 4.5 s, so a broadside duel has a rhythm instead of a stare-off.
   */
  timeScale: 20,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeAngle = (a) => {
  let angle = a % (Math.PI * 2);
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
};
/** Signed smallest rotation from `from` to `to`. */
export const angleDiff = (to, from) => normalizeAngle(to - from);

export const CREW_ROLES_COMBAT = ["marino", "artillero", "soldado", "remero"];

/* ---------------------------------------------------------------- geometry */

export function bearingTo(from, target) {
  return Math.atan2(target.y - from.y, target.x - from.x);
}

export function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Which broadside bears on a target at `bearing` from a ship facing `heading`.
 * Starboard is +90° relative, port is -90°; dead ahead or astern bears nothing.
 */
export function sideForBearing(heading, bearing) {
  const rel = angleDiff(bearing, heading);
  const half = COMBAT.arcHalf;
  if (rel >= Math.PI / 2 - half && rel <= Math.PI / 2 + half) return "estribor";
  if (rel <= -Math.PI / 2 + half && rel >= -Math.PI / 2 - half) return "babor";
  return null;
}

/**
 * How much punishment one unit of hull damage does to this ship: its arqueo
 * relative to the reference tonnage. A heavier hull absorbs the same shot better.
 */
export function hullToughness(hull) {
  const arqueo = hull?.arqueoMid;
  if (!Number.isFinite(arqueo) || arqueo <= 0) return 1;
  return Math.max(0.2, arqueo / COMBAT.referenceArqueo);
}

/* ---------------------------------------------------------------- combatants */

function totalPeople(crew) {
  return CREW_ROLES_COMBAT.reduce((sum, role) => sum + (crew[role] ?? 0), 0);
}

/** Expand the shipyard batteries into one instance per gun. */
export function createPlayerCombatant(runtimeShip) {
  const hull = hullById(runtimeShip.hullId);
  const pieces = [];
  for (const battery of runtimeShip.batteries ?? []) {
    for (let i = 0; i < battery.qty; i += 1) {
      pieces.push({
        pieceId: battery.pieceId,
        side: battery.side,
        ammoId: battery.ammoId,
        reloadTimer: 0,
        shotsLeft: battery.shotsPerPiece,
      });
    }
  }
  const crew = { ...(runtimeShip.crew ?? {}) };
  return {
    kind: "player",
    name: runtimeShip.name,
    pieces,
    crew,
    initialCrew: Math.max(1, totalPeople(crew)),
    crewMin: hull?.crewMin ?? 1,
    maxSpeedKn: runtimeShip.speedKn,
    hullToughness: hullToughness(hull),
    condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
    crewDamagePool: 0,
    status: "fighting",
  };
}

/**
 * Ordnance a corsair can mount, by the water it hunts in (S6). Coastal sail is
 * armed with light guns: a merchantman with a few falconetes, not a ship of the
 * line. The abyss is where the heavy batteries live.
 */
const ENEMY_ORDNANCE = {
  costera: ["falconete", "falcon", "minion"],
  abierto: ["minion", "sacre", "media-culebrina-9", "pedrero"],
  abismo: ["media-culebrina-9", "culebrina-18", "medio-canon-32", "canon-40"],
};

/**
 * Guns per broadside as a fraction of what the hull could carry. Coastal hulls
 * sail half-armed so a starter ship can beat them (S6); deep water fields full
 * batteries.
 */
const ENEMY_GUN_SHARE = {
  costera: 0.3,
  abierto: 0.55,
  abismo: 0.85,
};

function ordnanceForZone(zoneId) {
  return ENEMY_ORDNANCE[zoneId] ?? ENEMY_ORDNANCE.costera;
}

function gunShareForZone(zoneId) {
  return ENEMY_GUN_SHARE[zoneId] ?? ENEMY_GUN_SHARE.costera;
}

/**
 * Build an enemy's combat entity deterministically from the encounter id and the
 * world seed: same sea, same adversary. Both the number and the weight of its
 * guns grow with the zone, so coastal water is survivable and the abyss is not.
 */
export function createEnemyCombatant(encounter, zone, worldSeed) {
  let rngState = (encounter.id * 2654435761) ^ (worldSeed >>> 0);
  const rnd = () => {
    const r = mulberry32(rngState);
    rngState = r.state;
    return r.value;
  };

  const hull = hullById(encounter.hullId);
  if (!hull) return null;

  const zoneId = zone?.id ?? encounter.zoneId ?? "costera";
  const perSide = clamp(
    Math.round(hull.maxPiecesPerSide * gunShareForZone(zoneId)),
    2,
    hull.maxPiecesPerSide,
  );
  const pool = ordnanceForZone(zoneId);

  const pieces = [];
  for (const side of ["babor", "estribor"]) {
    for (let i = 0; i < perSide; i += 1) {
      const pieceId = pool[Math.floor(rnd() * pool.length)];
      const piece = pieceById(pieceId);
      const ammoId =
        piece.ammo.length > 1 && rnd() < 0.2
          ? piece.ammo[1 + Math.floor(rnd() * (piece.ammo.length - 1))]
          : piece.ammo[0];
      pieces.push({ pieceId, side, ammoId, reloadTimer: rnd() * 4, shotsLeft: 30 });
    }
  }

  const marino = Math.round(hull.crewMin * (1.3 + 0.4 * rnd()));
  const artillero = Math.max(1, Math.ceil((perSide * 2) / 2));
  const soldado = Math.round(marino * 0.5);
  const crew = { marino, artillero, soldado };

  return {
    kind: "enemy",
    name: hull.name,
    pieces,
    crew,
    initialCrew: Math.max(1, totalPeople(crew)),
    crewMin: hull.crewMin,
    maxSpeedKn: referenceSpeedKn(hull),
    hullToughness: hullToughness(hull),
    condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
    crewDamagePool: 0,
    status: "fighting",
  };
}

/* ---------------------------------------------------------------- gunnery */

/** Reload multiplier from gunner shortage; Infinity means the guns are silent. */
export function reloadFactor(combatant) {
  if (combatant.pieces.length === 0) return 1;
  const needed = Math.ceil(combatant.pieces.length / 2);
  const gunners = combatant.crew.artillero ?? 0;
  if (gunners <= 0) return Infinity;
  return clamp(needed / gunners, 1, 3);
}

/** Accuracy multiplier from crew condition: a broken crew shoots worse. */
export function accuracyModifier(combatant) {
  return 0.7 + 0.3 * (combatant.condition.crew / 100);
}

/** Speed multiplier from rigging condition: shredded sails slow the ship. */
export function speedFactor(combatant) {
  return 0.3 + 0.7 * (combatant.condition.rigging / 100);
}

/** Rudder multiplier: below the minimum sailors the ship answers the helm poorly. */
export function maneuverFactor(combatant) {
  return (combatant.crew.marino ?? 0) >= combatant.crewMin ? 1 : 0.5;
}

/** Hit probability by distance, from the workbook's effective-range idea (R6). */
export function hitProbability(piece, distanceM, accuracyMod = 1) {
  if (distanceM > piece.rangeM) return 0;
  const x = distanceM / piece.rangeM;
  return COMBAT.baseAccuracy * (1 - Math.pow(x, 1.6)) * accuracyMod;
}

/** Damage of one hit, split by the ammunition's declared profile (S5). */
export function damageRoll(piece, ammo, falloff) {
  const total = piece.shotKg * ammo.massFactor * COMBAT.damageScale * falloff;
  return {
    hull: total * ammo.damageSplit.hull,
    rigging: total * ammo.damageSplit.rigging,
    crew: total * ammo.damageSplit.crew,
  };
}

/**
 * Guns that can fire right now for one side at a target `distanceM` away (S4).
 * The side's own guns answer for it, and so do the swivels, which are not bolted
 * to a broadside (S20); each gun keeps its own reload clock and its own range.
 */
export function firingPieces(combatant, side, distanceM) {
  if (combatant.status !== "fighting") return [];
  if (!Number.isFinite(reloadFactor(combatant))) return [];
  return combatant.pieces.filter((p) => {
    const piece = pieceById(p.pieceId);
    return (
      (p.side === side || p.side === "swivel") &&
      p.reloadTimer <= 0 &&
      p.shotsLeft > 0 &&
      piece.rangeM >= distanceM
    );
  });
}

/**
 * Fire every ready gun of one side at the target. Each gun rolls its own hit,
 * spends one round and starts its own (compressed) reload clock.
 */
export function fireBroadside(combatant, side, distanceM, rnd) {
  const pieces = firingPieces(combatant, side, distanceM);
  const volley = [];
  if (pieces.length === 0) return { combatant, volley };

  const factor = reloadFactor(combatant);
  const accuracy = accuracyModifier(combatant);
  for (const p of pieces) {
    const piece = pieceById(p.pieceId);
    p.reloadTimer = (piece.reloadS * factor) / COMBAT.timeScale;
    p.shotsLeft -= 1;

    const hit = rnd() < hitProbability(piece, distanceM, accuracy);
    const falloff = 1 - 0.5 * (distanceM / piece.rangeM);
    volley.push({
      pieceId: p.pieceId,
      side,
      ammoId: p.ammoId,
      hit,
      damage: hit ? damageRoll(piece, ammoById(p.ammoId), falloff) : null,
      distanceM,
    });
  }
  return { combatant, volley };
}

/* ---------------------------------------------------------------- damage */

function applyCasualties(combatant, count) {
  const alive0 = totalPeople(combatant.crew);
  if (alive0 <= 0) return;

  let remaining = count;
  for (const role of CREW_ROLES_COMBAT) {
    if (remaining <= 0) break;
    const inRole = combatant.crew[role] ?? 0;
    if (inRole <= 0) continue;
    const share = Math.min(inRole, Math.max(1, Math.round((count * inRole) / alive0)));
    combatant.crew[role] = inRole - share;
    remaining -= share;
  }
  // rounding leftovers come off the largest role still standing
  while (remaining > 0) {
    const largest = CREW_ROLES_COMBAT.reduce((a, b) =>
      (combatant.crew[a] ?? 0) >= (combatant.crew[b] ?? 0) ? a : b,
    );
    if ((combatant.crew[largest] ?? 0) <= 0) break;
    combatant.crew[largest] -= 1;
    remaining -= 1;
  }
  combatant.condition.crew = Math.max(
    0,
    Math.round((100 * totalPeople(combatant.crew)) / combatant.initialCrew),
  );
}

function updateStatus(combatant) {
  if (combatant.condition.hull <= 0) {
    combatant.status = "sunk";
  } else if (combatant.condition.crew <= COMBAT.surrenderCrewPct) {
    combatant.status = "surrendered";
  }
}

/** Apply one damage packet (hull/rigging/crew points) to a combatant. */
export function applyDamage(combatant, damage) {
  if (combatant.status !== "fighting") return { combatant, casualties: 0 };
  const toughness = combatant.hullToughness ?? 1;
  combatant.condition.hull = clamp(combatant.condition.hull - damage.hull / toughness, 0, 100);
  combatant.condition.rigging = clamp(
    combatant.condition.rigging - damage.rigging,
    0,
    100,
  );

  combatant.crewDamagePool += damage.crew;
  let casualties = 0;
  while (combatant.crewDamagePool >= COMBAT.casualtyPoints) {
    combatant.crewDamagePool -= COMBAT.casualtyPoints;
    casualties += 1;
  }
  if (casualties > 0) applyCasualties(combatant, casualties);

  updateStatus(combatant);
  return { combatant, casualties };
}

/** Advance reload clocks by dt seconds. */
export function tickCombatant(combatant, dt) {
  for (const p of combatant.pieces) {
    if (p.reloadTimer > 0) p.reloadTimer = Math.max(0, p.reloadTimer - dt);
  }
  return combatant;
}

/** Gold in a defeated enemy's wreck, scaled by hull value and zone loot. */
export function wreckPrize(encounter, zone) {
  const hull = hullById(encounter.hullId);
  const loot = zone?.lootFactor ?? 1;
  return Math.round(((hull?.priceGold ?? 500) * 0.06 + 50) * loot);
}

/* ---------------------------------------------------------------- enemy AI */

/** The range band the AI tries to hold: just over half its longest gun. */
export function preferredRange(enemy) {
  const ranges = enemy.combat?.pieces.map((p) => pieceById(p.pieceId).rangeM) ?? [];
  return (ranges.length ? Math.max(...ranges) : 200) * 0.55;
}

/**
 * One AI tick: approach, hold the broadside band, flee when beaten. Returns the
 * updated enemy position/heading plus any volley fired at the player.
 */
export function aiStep(enemy, playerPos, dt, rnd) {
  const combat = enemy.combat;
  if (!combat || combat.status !== "fighting") {
    return { enemy: { ...enemy, currentSpeedKn: 0 }, volley: [] };
  }

  const distance = distanceBetween(enemy, playerPos);
  const bearing = bearingTo(enemy, playerPos);
  const maxSpeed = combat.maxSpeedKn * speedFactor(combat);

  let turn = 0;
  let throttle = 0;

  if (combat.condition.hull < COMBAT.fleeHullPct) {
    // beaten: run directly away from the player
    const away = bearingTo(playerPos, enemy);
    turn = clamp(angleDiff(away, enemy.heading) * 2, -1, 1);
    throttle = 1;
  } else {
    const preferred = preferredRange(enemy);
    if (distance > preferred * 1.15) {
      // close in
      turn = clamp(angleDiff(bearing, enemy.heading) * 2, -1, 1);
      throttle = 1;
    } else {
      // in the band: swing the best-armed side onto the player
      const readyEstribor = firingPieces(combat, "estribor", distance).length;
      const readyBabor = firingPieces(combat, "babor", distance).length;
      const sign = readyEstribor >= readyBabor ? 1 : -1;
      const targetHeading = bearing - sign * (Math.PI / 2);
      turn = clamp(angleDiff(targetHeading, enemy.heading) * 2.5, -1, 1);
      throttle = 0.5;
    }
  }

  // integrate movement (same convention as the world model, enemies keep their own)
  const currentSpeedKn =
    Math.abs((enemy.currentSpeedKn ?? 0) - maxSpeed * throttle) < maxSpeed * 0.25 * dt
      ? maxSpeed * throttle
      : (enemy.currentSpeedKn ?? 0) +
        Math.sign(maxSpeed * throttle - (enemy.currentSpeedKn ?? 0)) * maxSpeed * 0.25 * dt;

  const heading = normalizeAngle(enemy.heading + turn * 0.55 * dt);
  const KN = 1852 / 3600;
  const x = enemy.x + Math.cos(heading) * currentSpeedKn * KN * 12 * dt;
  const y = enemy.y + Math.sin(heading) * currentSpeedKn * KN * 12 * dt;

  // fire after moving, on the side that now bears
  const newDistance = Math.hypot(playerPos.x - x, playerPos.y - y);
  const side = sideForBearing(heading, bearingTo({ x, y }, playerPos));
  let volley = [];
  if (side && combat.condition.hull >= COMBAT.fleeHullPct) {
    volley = fireBroadside(combat, side, newDistance, rnd).volley;
  }

  return { enemy: { ...enemy, x, y, heading, currentSpeedKn }, volley };
}
