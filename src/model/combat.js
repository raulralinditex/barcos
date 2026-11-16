/**
 * Combat model: broadside gunnery in real time, per side, with ammunition effects.
 *
 * Design anchors from the workbook (06_Notas_y_formulas, R6):
 *  - "Q_o(d) = SUM(piezas que apuntan al enemigo, ...)" -> only pieces whose side
 *    faces the target and whose own range covers the distance can fire (S4).
 *  - "E_impacto = 0.5*m*v^2" and "no hay valores históricos 0-100 medidos" -> the
 *    damage scale below is a declared game convention; the damage SPLIT between
 *    hull, rigging and crew comes from the ammunition table (S5).
 *  - S53: living gunners determine available guns and reload acceleration.
 *
 * Time is compressed (COMBAT.timeScale) because a 240 s historical reload is not
 * fun to wait for; distance is NOT compressed (the world model already scales it).
 *
 * Combatant objects are mutable session state (unlike the pure derivations in
 * ship-model.js); fire, damage and tick functions mutate them in place.
 */

import { AMMO, ammoById, hullById, pieceById } from "../data/naval-data.js";
import { referenceSpeedKn } from "./ship-model.js";
import { mulberry32, stepHull } from "./world.js";
import { hullTurnFactor } from "./turning.js";
import { crewedPieces, reloadBonus } from "./gunnery.js";

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
  /** Draw the range circle of each beam (S68). 1 is on, 0 is off; it is a setting. */
  showRange: 1,
  /**
   * What the first broadside of a beam is worth, once the fight has started (S69). The
   * opening volley is the reward for being ready when the enemy is not: it hits harder
   * and finds its mark more often. Both are multipliers, never below 1.
   */
  openingDamageBonus: 1.25,
  openingAccuracyBonus: 1.15,
  /**
   * How much longer the guns take to reload after a change of round (S70). Switching is
   * a real act aboard: the racks have to be emptied and refilled, so flipping between
   * chain shot and iron whenever the range changes is no longer free.
   */
  ammoReloadPenalty: 0.25,
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

/**
 * How hard the enemies of each zone hit, as a multiplier on the damage their guns
 * deal (S60). Every zone ships at 1, so the curve the game was tuned with is the one
 * that plays until the player moves a slider. The settings screen owns these values.
 */
export const ZONE_DAMAGE = { costera: 1, abierto: 1, abismo: 1 };

/**
 * What a defeated hull leaves behind (S61). The prize is a share of her catalogue price
 * plus a flat sum, and then the zone's loot factor. The share is the tuning value; the
 * flat sum is small enough that a coastal boat still pays for the powder it took to
 * sink her, and is not worth a slider of its own.
 */
export const LOOT = { hullShare: 0.06, flatGold: 50 };

/** The multiplier of a zone, falling back to coastal water for anything unknown. */
export function zoneDamageFactor(zoneId) {
  const factor = ZONE_DAMAGE[zoneId];
  return Number.isFinite(factor) && factor >= 0 ? factor : ZONE_DAMAGE.costera;
}

/**
 * What one combatant's guns hit for (S60): its zone's live multiplier. Read at the
 * moment of firing instead of stored when the fight starts, so a value changed on the
 * settings screen reaches the next volley without waiting for a new voyage. A
 * combatant with no zone — the captain, an escort — is never scaled.
 */
export function damageFactorOf(combatant) {
  if (!combatant || !combatant.zoneId) return 1;
  return zoneDamageFactor(combatant.zoneId);
}

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
  const crew = { ...(runtimeShip.crewAlive ?? runtimeShip.crew ?? {}) };
  const bought = { ...(runtimeShip.crew ?? {}) };
  const initialCrew = Math.max(1, totalPeople(Object.keys(bought).length ? bought : crew));
  const crewShare = clamp(Math.round((100 * totalPeople(crew)) / initialCrew), 0, 100);
  const stored = runtimeShip.condition ?? {};
  return {
    kind: "player",
    name: runtimeShip.name,
    pieces,
    crew,
    initialCrew,
    crewMin: hull?.crewMin ?? 1,
    maxSpeedKn: runtimeShip.speedKn,
    hullToughness: hullToughness(hull),
    // A hull that comes back from the last voyage damaged sails damaged (S23).
    condition: {
      hull: Number.isFinite(stored.hull) ? clamp(stored.hull, 0, 100) : 100,
      rigging: Number.isFinite(stored.rigging) ? clamp(stored.rigging, 0, 100) : 100,
      crew: crewShare,
      morale: Number.isFinite(stored.morale) ? clamp(stored.morale, 0, 100) : 100,
    },
    crewDamagePool: 0,
    // What each beam has already put into the enemy, for the floating bars (S21).
    damageDealt: { babor: 0, estribor: 0 },
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
    damageDealt: { babor: 0, estribor: 0 },
    // The water this enemy hunts in, which decides what its guns hit for (S60).
    zoneId,
    status: "fighting",
  };
}

/* ---------------------------------------------------------------- ammunition choice (S65) */

/**
 * The rounds the player can call for in the middle of a fight, one per key (S65). Iron
 * to sink, chain shot to strip the rig, hailshot to clear a deck: the three things a
 * captain actually chooses between, and the three the catalogue already models.
 */
export const AMMO_SWITCH = ["bala-hierro", "cadena", "metralla"];

/** Key to round: the player presses 1, 2 or 3. */
export const AMMO_KEYS = Object.freeze({
  "1": "bala-hierro",
  "2": "cadena",
  "3": "metralla",
});

/** The round a key stands for, or null when the key means nothing. */
export function ammoKeyAmmoId(key) {
  const name = typeof key === "string" ? key.trim() : "";
  return Object.prototype.hasOwnProperty.call(AMMO_KEYS, name) ? AMMO_KEYS[name] : null;
}

/** Whether one gun can actually fire a round: what the piece itself declares. */
function pieceCarries(pieceId, ammoId) {
  const piece = pieceById(pieceId);
  return Boolean(piece && Array.isArray(piece.ammo) && piece.ammo.includes(ammoId));
}

/**
 * Load one beam with `ammoId` (S65), the swivels included, because a swivel answers for
 * whichever beam fires it (S20). Only the guns that can fire the round are switched: a
 * 32-pounder cannot take chain shot, so she keeps whatever she had, and so does her
 * reload clock and her rounds. Nothing is spent by switching.
 *
 * Returns what happened, so the HUD can say it: how many guns took the round and how
 * many kept theirs.
 */
export function setSideAmmo(combatant, side, ammoId) {
  const result = { ammoId, switched: 0, kept: 0 };
  if (!combatant || !Array.isArray(combatant.pieces)) return result;
  if (!ammoById(ammoId)) return result;

  for (const p of combatant.pieces) {
    if (p.side !== side && p.side !== "swivel") continue;
    if (pieceCarries(p.pieceId, ammoId)) {
      if (p.ammoId !== ammoId) {
        result.switched += 1;
        // Changing the round costs reload time on this gun until it fires again (S70).
        const cost = Number(COMBAT.ammoReloadPenalty);
        p.ammoPenalty = Number.isFinite(cost) && cost > 0 ? cost : 0;
      }
      p.ammoId = ammoId;
    } else {
      result.kept += 1;
    }
  }
  return result;
}

/**
 * Load every beam that can take the round with `ammoId` (S65): what the key press does
 * when the player is not choosing a beam. Both sides and the swivels are asked; the guns
 * that cannot carry the round keep the one they had.
 */
export function setBroadsideAmmo(combatant, ammoId) {
  const result = { ammoId, switched: 0, kept: 0 };
  if (!combatant || !Array.isArray(combatant.pieces)) return result;
  if (!ammoById(ammoId)) return result;
  for (const side of ["babor", "estribor"]) {
    const one = setSideAmmo(combatant, side, ammoId);
    result.switched += one.switched;
    result.kept += one.kept;
  }
  // A hull with swivels only would otherwise never see them switched.
  const swivels = combatant.pieces.filter((p) => p.side === "swivel");
  if (swivels.length && !combatant.pieces.some((p) => p.side === "babor" || p.side === "estribor")) {
    for (const p of swivels) {
      if (pieceCarries(p.pieceId, ammoId)) {
        if (p.ammoId !== ammoId) result.switched += 1;
        p.ammoId = ammoId;
      } else {
        result.kept += 1;
      }
    }
  }
  return result;
}

/**
 * Load the whole squadron with one round (S127). The captain's order is the fleet's order:
 * when she changes ammunition, every hull that can fire that round changes with her.
 *
 * Each escort answers for her own guns, so the totals add up over the fleet: a hull with a
 * 32-pounder still keeps it, exactly as the captain's own big gun does. Nothing is spent
 * by switching and each gun that changes pays its own reload penalty (S70).
 *
 * Returns the captain's own result plus a total across the squadron, so the banner can say
 * how many guns of the whole fleet took the round.
 */
export function setFleetAmmo(captain, escorts, ammoId) {
  const total = { ammoId, switched: 0, kept: 0, hulls: 0 };
  const add = (one) => {
    total.switched += one.switched;
    total.kept += one.kept;
    return one;
  };
  const own = add(setBroadsideAmmo(captain, ammoId));
  if (own.switched > 0 || own.kept > 0) total.hulls += 1;
  for (const escort of Array.isArray(escorts) ? escorts : []) {
    const combat = escort?.combat;
    // A hull that struck or sank is not a gun that can take an order.
    if (!combat || combat.status !== "fighting") continue;
    const one = setBroadsideAmmo(combat, ammoId);
    if (one.switched === 0 && one.kept === 0) continue;
    add(one);
    total.hulls += 1;
  }
  return { ...total, captain: own };
}

/** The same as `setBroadsideAmmo`, named for what the key press does. */
export function chooseAmmo(combatant, ammoId) {
  return setBroadsideAmmo(combatant, ammoId);
}

/**
 * What one beam is loaded with, for the HUD (S65). A beam whose guns do not all carry the
 * same round reads as mixed, and names the round most of her guns have: after asking for
 * chain shot, a beam with one 32-pounder left on iron is honestly mixed, not "chain".
 */
function describeSide(combatant, side) {
  const guns = (combatant?.pieces ?? []).filter((p) => p.side === side || p.side === "swivel");
  if (guns.length === 0) return { id: null, name: "", mixed: false };
  const counts = new Map();
  for (const gun of guns) counts.set(gun.ammoId, (counts.get(gun.ammoId) ?? 0) + 1);
  const [id] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { id, name: ammoById(id)?.name ?? id, mixed: counts.size > 1 };
}

/** Both beams, for the HUD: what is loaded right now, mixed rounds included (S65). */
export function describeAmmo(combatant) {
  return { babor: describeSide(combatant, "babor"), estribor: describeSide(combatant, "estribor") };
}

/* ---------------------------------------------------------------- the opening volley (S69) */

const clampBonus = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 ? numeric : 1;
};

/**
 * Mark that a fight has started for this combatant (S69): every beam that has not fired
 * yet gets its opening bonus back. Called when an enemy is first engaged, so a new fight
 * is a new opening instead of a bonus that was already spent on the last one.
 */
export function markEngaged(combatant) {
  if (!combatant) return combatant;
  combatant.engaged = true;
  combatant.openedFire = { babor: false, estribor: false };
  return combatant;
}

/**
 * What one beam's volley is worth right now (S69): the opening multipliers while the
 * beam has not fired yet in this engagement, and plain 1s after that. A sunk or struck
 * ship has no volley to improve.
 */
export function openingBonus(combatant, side) {
  const none = { damage: 1, accuracy: 1 };
  if (!combatant || combatant.status !== "fighting") return none;
  if (!combatant.engaged) return none;
  if (combatant.openedFire?.[side]) return none;
  return {
    damage: clampBonus(COMBAT.openingDamageBonus),
    accuracy: clampBonus(COMBAT.openingAccuracyBonus),
  };
}

/* ---------------------------------------------------------------- gunnery */

/**
 * Reload-time multiplier for this hull (S53, S56).
 *
 * The bonus is measured against the **whole crewed battery**, not against the guns
 * that happen to be reloading at this instant (S56). Measured on the reloading guns
 * alone, a ship that fires one beam at a time — which is exactly what the enemy AI
 * does — halves the denominator and collects the maximum bonus for free, without a
 * single spare gunner. The just-fired guns are still passed in so a caller can say
 * what it fired, but they no longer narrow the denominator.
 */
export function reloadFactor(combatant, justFired = []) {
  const gunners = combatant.crew.artillero ?? 0;
  if (gunners <= 0) return combatant.pieces.length ? Infinity : 1;
  return 1 / reloadBonus(crewedPieces(combatant.pieces, gunners), gunners);
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

/**
 * How far a gun actually carries with the round it is loaded with (S68). The catalogue
 * has always declared a `rangeFactor` per ammunition — chain shot and hailshot do not
 * fly as far as iron — but nothing read it, so a gun reached the same distance whatever
 * it was loaded with. A round the piece cannot fire falls back to its bare range: this
 * gates and draws range, so it must fail open rather than make a gun useless.
 */
export function effectiveRangeM(piece, ammoId) {
  const base = Number(piece?.rangeM);
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Array.isArray(piece.ammo) || !piece.ammo.includes(ammoId)) return base;
  // The declared range is the range with the piece's own round: a verso's 180 m are its
  // hailshot range, and the catalogue says so. Applying the factor on top would halve
  // the reach of the very round the datum describes, so the principal round keeps the
  // bare range and only a different round moves it (S68).
  if (piece.ammo[0] === ammoId) return base;
  const factor = Number(ammoById(ammoId)?.rangeFactor);
  if (!Number.isFinite(factor) || factor <= 0) return base;
  return base * factor;
}

/**
 * Hit probability by distance, from the workbook's effective-range idea (R6). `ammoId`
 * narrows the range to what that round carries (S68); without it the gun's bare range
 * is used, which is what the callers that predate the round argument expect.
 */
export function hitProbability(piece, distanceM, accuracyMod = 1, ammoId = null) {
  const range = ammoId ? effectiveRangeM(piece, ammoId) : Number(piece?.rangeM);
  if (!Number.isFinite(range) || range <= 0) return 0;
  if (distanceM > range) return 0;
  const x = distanceM / range;
  return COMBAT.baseAccuracy * (1 - Math.pow(x, 1.6)) * accuracyMod;
}

/**
 * The range of one beam right now (S68): the shortest gun that can answer for it, with
 * the round it is actually loaded with. The shortest, not the longest, because a circle
 * drawn at the longest gun's range would promise a reach half the battery does not have.
 * The swivels answer for both beams (S20). Zero when the beam has no guns at all.
 */
export function sideRangeM(combatant, side) {
  if (!combatant || !Array.isArray(combatant.pieces)) return 0;
  let shortest = Infinity;
  for (const p of combatant.pieces) {
    if (p.side !== side && p.side !== "swivel") continue;
    const range = effectiveRangeM(pieceById(p.pieceId), p.ammoId);
    if (range > 0 && range < shortest) shortest = range;
  }
  return Number.isFinite(shortest) ? shortest : 0;
}

/** The radius to draw for one beam, or 0 when the circle is switched off (S68). */
export function rangeCircleM(combatant, side) {
  if (!COMBAT.showRange) return 0;
  return sideRangeM(combatant, side);
}

/**
 * Damage of one hit, split by the ammunition's declared profile (S5), scaled by the
 * zone's multiplier (S60). `factor` is 1 for the captain and for anything that does not
 * declare one, so only the enemy's zones can be tuned.
 */
export function damageRoll(piece, ammo, falloff, factor = 1) {
  const total = piece.shotKg * ammo.massFactor * COMBAT.damageScale * falloff * factor;
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
  const available = new Set(crewedPieces(combatant.pieces, combatant.crew.artillero ?? 0));
  return combatant.pieces.filter((p) => {
    if (!available.has(p)) return false;
    const piece = pieceById(p.pieceId);
    return (
      (p.side === side || p.side === "swivel") &&
      p.reloadTimer <= 0 &&
      p.shotsLeft > 0 &&
      effectiveRangeM(piece, p.ammoId) >= distanceM
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

  const factor = reloadFactor(combatant, pieces);
  const accuracy = accuracyModifier(combatant);
  // The first volley of a beam after engaging is the opening one (S69): harder hitting
  // and better aimed, and it is spent by firing.
  const opening = openingBonus(combatant, side);
  let landed = 0;
  for (const p of pieces) {
    const piece = pieceById(p.pieceId);
    // A gun that changed round reloads more slowly until it fires again (S70).
    const penalty = 1 + Math.max(0, Number(p.ammoPenalty) || 0);
    p.reloadTimer = (piece.reloadS * factor * penalty) / COMBAT.timeScale;
    p.ammoPenalty = 0;
    p.shotsLeft -= 1;

    const hit = rnd() < Math.min(1, hitProbability(piece, distanceM, accuracy * opening.accuracy, p.ammoId));
    const falloff = 1 - 0.5 * (distanceM / effectiveRangeM(piece, p.ammoId));
    const damage = hit
      ? damageRoll(piece, ammoById(p.ammoId), falloff, damageFactorOf(combatant) * opening.damage)
      : null;
    if (damage) landed += damage.hull + damage.rigging + damage.crew;
    volley.push({
      pieceId: p.pieceId,
      side,
      ammoId: p.ammoId,
      hit,
      damage,
      distanceM,
    });
  }
  // Firing spends this beam's opening bonus (S69), so the next volley is a plain one.
  if (!combatant.openedFire) combatant.openedFire = { babor: false, estribor: false };
  combatant.openedFire[side] = true;
  // The floating bars read what each beam has actually put into the enemy (S21).
  if (!combatant.damageDealt) combatant.damageDealt = { babor: 0, estribor: 0 };
  combatant.damageDealt[side] = (combatant.damageDealt[side] ?? 0) + landed;
  return { combatant, volley };
}

/* ---------------------------------------------------------------- side state (S21) */

/**
 * The guns of one beam: its own fixed pieces plus the swivels, which are not
 * bolted to a side and answer for whichever beam fires them (S20).
 */
export function sidePieces(combatant, side) {
  const available = new Set(crewedPieces(combatant.pieces, combatant.crew.artillero ?? 0));
  return combatant.pieces.filter((p) => available.has(p) && (p.side === side || p.side === "swivel"));
}

/**
 * Share of a beam's guns that are loaded and still have rounds, 0 to 1. This is
 * the reload bar: it fills as the battery comes back, so a partly reloaded beam
 * reads as partly ready instead of frozen at zero (S21).
 */
export function loadedShare(combatant, side) {
  const guns = sidePieces(combatant, side);
  if (guns.length === 0) return 0;
  const loaded = guns.filter((p) => p.reloadTimer <= 0 && p.shotsLeft > 0).length;
  return loaded / guns.length;
}

/** Expected damage of a set of guns at `distanceM`, hit probability included. */
function expectedVolley(combatant, guns, distanceM) {
  const accuracy = accuracyModifier(combatant);
  return guns.reduce((sum, p) => {
    const piece = pieceById(p.pieceId);
    const ammo = ammoById(p.ammoId);
    if (!ammo) return sum;
    const falloff = 1 - 0.5 * (distanceM / effectiveRangeM(piece, p.ammoId));
    const damage = damageRoll(piece, ammo, falloff, damageFactorOf(combatant));
    const expected = hitProbability(piece, distanceM, accuracy, p.ammoId);
    return sum + expected * (damage.hull + damage.rigging + damage.crew);
  }, 0);
}

/**
 * Expected damage of the beam's next broadside at `distanceM`: what every loaded
 * gun in range would average, hit probability included. Expected value, not a
 * lucky roll, so the bar does not flicker (S21).
 */
export function readyDamage(combatant, side, distanceM) {
  return expectedVolley(combatant, firingPieces(combatant, side, distanceM), distanceM);
}

/**
 * Expected damage of the whole beam at `distanceM`, loaded or not: the guns that
 * still have rounds and reach the target. It is the unit every ship's damage bar is
 * measured in, so a patache and a galleon share one scale (S21), and unlike
 * `readyDamage` it does not drop to zero while the guns reload, so a bar that is
 * scaled against another ship's battery does not jump when that ship fires.
 */
export function sideCapacity(combatant, side, distanceM) {
  if (combatant.status !== "fighting") return 0;
  const guns = sidePieces(combatant, side).filter(
    (p) => p.shotsLeft > 0 && effectiveRangeM(pieceById(p.pieceId), p.ammoId) >= distanceM,
  );
  return expectedVolley(combatant, guns, distanceM);
}

/** Damage this beam has already landed on the enemy, in damage points (S21). */
export function damageDealt(combatant, side) {
  return combatant.damageDealt?.[side] ?? 0;
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

/**
 * Bring a combatant's status in line with its condition. Restoring a saved voyage
 * copies condition and crew straight onto the combatant, so a hull that went down on
 * the last trip would otherwise come back "fighting" with zero hull (S36).
 */
export function refreshStatus(combatant) {
  if (!combatant || !combatant.condition) return combatant;
  if (combatant.status && combatant.status !== "fighting") return combatant;
  updateStatus(combatant);
  return combatant;
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

/**
 * Gold in a defeated enemy's wreck, scaled by hull value and zone loot (S61). The hull's
 * share is the tuning value, so the settings screen can make prizes richer or poorer
 * without a new voyage.
 */
export function wreckPrize(encounter, zone) {
  const hull = hullById(encounter.hullId);
  const loot = zone?.lootFactor ?? 1;
  const share = Number.isFinite(LOOT.hullShare) && LOOT.hullShare >= 0 ? LOOT.hullShare : 0.06;
  return Math.round(((hull?.priceGold ?? 500) * share + LOOT.flatGold) * loot);
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
export function aiStep(enemy, playerPos, dt, rnd, { wind = null } = {}) {
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

  // A crew below the hull's minimum answers the helm poorly, the enemy included (S57).
  turn *= maneuverFactor(combat);

  // The enemy hull moves with the same physics as the player's (S57): one shared
  // function decides the heading, the speed and the drift, so the two can never drift
  // apart again. Its own hull's turn factor is included, as it is for the captain (S48).
  const stepped = stepHull(
    { ...enemy, speedKn: combat.maxSpeedKn, turnFactor: hullTurnFactor(enemy.hullId) },
    // Her own rigging, not the player's: a dismasted enemy is slow too (S89).
    { turn, throttle, wind, rigging: combat },
    dt,
  );
  const { x, y, heading, currentSpeedKn } = stepped;

  // fire after moving, on the side that now bears
  const newDistance = Math.hypot(playerPos.x - x, playerPos.y - y);
  const side = sideForBearing(heading, bearingTo({ x, y }, playerPos));
  let volley = [];
  if (side && combat.condition.hull >= COMBAT.fleeHullPct) {
    volley = fireBroadside(combat, side, newDistance, rnd).volley;
  }

  return { enemy: { ...enemy, x, y, heading, currentSpeedKn }, volley };
}
