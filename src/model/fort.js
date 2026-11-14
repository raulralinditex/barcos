/**
 * S74: the shipyard as a combatant.
 *
 * The yard stops being a circle of "keep out" and becomes a static hull with a battery, a
 * garrison and a hull of her own. She fights with the same rules as any ship, she can be
 * carried by a boarding party that breaks her garrison, and while she is in enemy hands
 * the port is closed.
 *
 * Pure and testable: the sea screen and the shipyard screen only apply this.
 */

import { COMBAT, applyDamage } from "./combat.js";
import { pieceById } from "../data/naval-data.js";
import { crewedPieces } from "./gunnery.js";

export const FORT = {
  /** Hull condition the yard starts with, before the setting and the victories (S74). */
  hull: 100,
  /**
   * Hull toughness, read like a ship's: how much punishment one point of hull takes. A
   * fortification is masonry and earth, not planking: measured, a galleon of the abyss
   * sinks a hull of toughness 4 in three seconds of world time, which is not a siege.
   * A hundred is measured: one abyss galleon then breaks her garrison in about 55 s of
   * world time, which is a siege the player can sail home to interrupt.
   */
  toughness: 100,
  /** Guns per broadside at the start. Grows by one every `gunsPerVictories` wins. */
  gunsPerSide: 3,
  /** Victories of the player that add one more gun to each broadside. */
  gunsPerVictories: 5,
  /**
   * Garrison: gunners and soldiers, the crew a boarding party has to break. Measured: with
   * fewer than about two hundred men the garrison, not the hull, is what gives way, and a
   * single galleon of the abyss carries her in under a minute.
   */
  gunners: 12,
  soldiers: 200,
  /** Rounds each gun carries. A fort is resupplied, so this is generous. */
  shotsPerGun: 40,
  /** What the yard's guns are: coastal ordnance, heavy enough to matter. */
  pieceId: "media-culebrina-9",
  /** Which enemies may assault the yard at all (S74): only the abyss sends a squadron. */
  attackerZoneId: "abismo",
};

/**
 * Build the yard's combatant (S74). It is a static hull: no speed, no manoeuvre, and the
 * same damage pipeline as a ship, so the rules cannot drift apart.
 *
 * `gunsPerSide` grows with the player's victories: every `gunsPerVictories` wins adds one
 * gun to each broadside. It is never a purchase, so there is nothing to buy and nothing
 * to forget.
 */
export function createFortCombatant({ victories = 0, gunsPerSide = FORT.gunsPerSide, hull = FORT.hull, toughness = FORT.toughness } = {}) {
  const wins = Math.max(0, Math.floor(Number(victories) || 0));
  const extra = Math.floor(wins / Math.max(1, FORT.gunsPerVictories));
  const perSide = Math.max(0, Math.floor(Number(gunsPerSide) || 0)) + extra;
  const piece = pieceById(FORT.pieceId);

  const pieces = [];
  for (const side of ["babor", "estribor"]) {
    for (let i = 0; i < perSide; i += 1) {
      pieces.push({
        pieceId: FORT.pieceId,
        side,
        ammoId: piece?.ammo?.[0] ?? "bala-hierro",
        reloadTimer: 0,
        shotsLeft: FORT.shotsPerGun,
      });
    }
  }

  const gunners = Math.max(0, Math.floor(Number(FORT.gunners) || 0));
  const soldiers = Math.max(0, Math.floor(Number(FORT.soldiers) || 0));
  const crew = { marino: 0, artillero: gunners, soldado: soldiers };
  const initialCrew = Math.max(1, gunners + soldiers);
  const hullValue = Number.isFinite(Number(hull)) ? Math.min(100, Math.max(0, Number(hull))) : FORT.hull;

  return {
    kind: "fort",
    name: "Astillero",
    pieces,
    crew,
    initialCrew,
    crewMin: 1,
    maxSpeedKn: 0,
    hullToughness: Number.isFinite(Number(toughness)) && Number(toughness) > 0 ? Number(toughness) : FORT.toughness,
    condition: { hull: hullValue, rigging: 100, crew: 100, morale: 100 },
    crewDamagePool: 0,
    damageDealt: { babor: 0, estribor: 0 },
    status: "fighting",
    /** A fort never moves; the sea screen keeps her at the origin. */
    static: true,
    x: 0,
    y: 0,
    heading: 0,
  };
}

/**
 * Whether one enemy may assault the yard (S74). Only the abyss sends a squadron: a coastal
 * privateer has no business storming a fortification, and letting her try would turn the
 * home port into a permanent nuisance.
 */
export function canAssaultFort(zoneId) {
  return zoneId === FORT.attackerZoneId;
}

/** True once the yard's garrison has broken and she has struck (S74). */
export function fortCaptured(fort) {
  return Boolean(fort) && fort.status === "surrendered";
}

/** True once the yard's hull is gone (S74). A ruined yard is not a captured one. */
export function fortDestroyed(fort) {
  return Boolean(fort) && fort.status === "sunk";
}

/**
 * True while the port is closed to the player (S74): a captured yard takes the repairs and
 * the sailing with her. A destroyed yard is also closed, for the same reason.
 */
export function portClosed(fort) {
  return fortCaptured(fort) || fortDestroyed(fort);
}

/**
 * The yard's next broadside at one beam, as expected damage: what the sea uses to decide
 * whether she fires. Reuses the ship rule for who can shoot and for the round's effect.
 */
export function fortReadyGuns(fort, side) {
  if (!fort || fort.status !== "fighting") return [];
  const available = new Set(crewedPieces(fort.pieces, fort.crew.artillero ?? 0));
  return fort.pieces.filter((p) => available.has(p) && (p.side === side || p.side === "swivel") && p.reloadTimer <= 0 && p.shotsLeft > 0);
}

/** One gun's worth of fire from the yard at a ship `distanceM` away (S74). */
export function fortFire(fort, side, distanceM, rnd) {
  const guns = fortReadyGuns(fort, side).filter((p) => {
    const piece = pieceById(p.pieceId);
    return piece && piece.rangeM >= distanceM;
  });
  const volley = [];
  if (guns.length === 0) return { fort, volley };

  for (const p of guns) {
    const piece = pieceById(p.pieceId);
    p.reloadTimer = piece.reloadS / COMBAT.timeScale;
    p.shotsLeft -= 1;
    const x = distanceM / piece.rangeM;
    const chance = COMBAT.baseAccuracy * (1 - Math.pow(x, 1.6));
    const hit = rnd() < chance;
    volley.push({ pieceId: p.pieceId, side, ammoId: p.ammoId, hit, distanceM });
  }
  return { fort, volley };
}

/**
 * Hit the yard with a ship's volley (S74). She takes damage through the same `applyDamage`
 * a hull does, so her garrison breaks at the same threshold and her hull goes at zero.
 */
export function damageFort(fort, damage) {
  if (!fort || fort.status !== "fighting") return { fort, casualties: 0 };
  return applyDamage(fort, damage);
}

/** What a yard is worth to a boarding party: her guns and her stores (S74). */
export function fortPrize(fort) {
  if (!fort) return 0;
  const guns = (fort.pieces ?? []).length;
  const crew = (fort.crew?.soldado ?? 0) + (fort.crew?.artillero ?? 0);
  return guns * 40 + crew * 3;
}
