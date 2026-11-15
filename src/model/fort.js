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
import { hullById, pieceById } from "../data/naval-data.js";
import { REPAIR } from "./repair.js";
import { normaliseGold } from "./economy.js";
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
 * Fort reinforcement (S100, S102): repairing the yard and buying her extra guns.
 *
 * The whole block is a live constant, so the settings screen (S33) can retune it like
 * every other number in the game. A fort has no purchase price to measure a repair
 * against, so her repair fee is her own pinch: `repairPinch` doblones for a hull taken
 * from wreck to full, in proportion to the damage, never below the ship rule's minimum.
 */
export const FORT_UPGRADE = {
  /** Doblones for each extra gun. One purchase arms both sides, like the victories do. */
  gunCost: 400,
  /** Extra guns per side beyond the battery she earns by victories. */
  maxPerSide: 6,
  /** What putting her from wreck to full costs: her pinch, not a ship price. */
  repairPinch: 800,
};

const clampGuns = (value, max) => Math.max(0, Math.min(max, Math.floor(Number(value) || 0)));

/** How many guns the player bought for the yard (S100). A save without them reads zero. */
export function fortBoughtGuns(fort) {
  return clampGuns(fort?.boughtGuns, FORT_UPGRADE.maxPerSide * 2);
}

/** Guns per side the yard fights with: base, victories' bonus and bought ones (S100). */
export function fortGunsPerSide({ victories = 0, boughtGuns = 0 } = {}) {
  const wins = Math.max(0, Math.floor(Number(victories) || 0));
  const earned = Math.floor(wins / Math.max(1, FORT.gunsPerVictories));
  return Math.max(0, Math.floor(Number(FORT.gunsPerSide) || 0)) + earned + clampGuns(boughtGuns, FORT_UPGRADE.maxPerSide);
}

/**
 * Room left under the cap (S100). The cap is on the total per side — base, victories and
 * purchases together — so settings that raise `gunsPerSide` eat the headroom first.
 */
export function fortGunHeadroom(fort, { victories = 0 } = {}) {
  const bought = fortBoughtGuns(fort);
  const perSide = fortGunsPerSide({ victories, boughtGuns: bought });
  const cap = Math.max(0, Math.floor(Number(FORT.gunsPerSide) || 0)) + Math.floor(Math.max(0, Math.floor(Number(victories) || 0)) / Math.max(1, FORT.gunsPerVictories)) + FORT_UPGRADE.maxPerSide;
  return Math.max(0, cap - perSide);
}

/** What the next gun costs (S102): the live setting, so the screen prices with it. */
export function fortGunCost() {
  const cost = Number(FORT_UPGRADE.gunCost);
  return Number.isFinite(cost) && cost > 0 ? Math.floor(cost) : 0;
}

/** What the fort's repair costs right now (S100/S102): a quote, nothing is changed. */
export function fortRepairQuote(fort) {
  const segments = ["hull", "crew"];
  const condition = fort?.condition ?? {};
  const worst = Math.min(
    ...segments.map((segment) => {
      const value = Number(condition[segment]);
      return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 100;
    }),
  );
  const share = Math.max(0, Math.min(1, (100 - worst) / 100));
  const pinch = Number(FORT_UPGRADE.repairPinch);
  const base = Number.isFinite(pinch) && pinch > 0 ? pinch : FORT_UPGRADE.repairPinch;
  const cost = Math.max(REPAIR.minCost, Math.round(base * share));
  const open = fort && fort.status === "fighting" && share > 0;
  return { cost: share > 0 ? cost : 0, damageShare: share, repairable: open };
}

/**
 * Repair the yard (S100): her hull and her garrison back to full, one purse charge.
 * The yard does not have rigging or morale of her own; a taken yard is refused, because
 * the port is closed (S74) and nobody sells anything to an enemy's fortification.
 */
export function fortRepair(fort, purse) {
  if (!fort) return { fort, gold: normaliseGold(purse), applied: false };
  const quote = fortRepairQuote(fort);
  const gold = normaliseGold(purse);
  if (!quote.repairable || gold < quote.cost) return { fort, gold, applied: false };
  fort.condition = { ...fort.condition, hull: 100, crew: 100 };
  return { fort, gold: gold - quote.cost, applied: true, cost: quote.cost };
}

/**
 * Buy one more gun for the yard (S100). One purchase arms both sides, `gunCost` from the
 * purse; refused without room under the cap or without the money, untouched in that case.
 */
export function buyFortGun(fort, purse) {
  const gold = normaliseGold(purse);
  if (!fort || fortGunHeadroom(fort) <= 0 || gold < fortGunCost()) {
    return { fort, gold, applied: false };
  }
  fort.boughtGuns = fortBoughtGuns(fort) + 1;
  return { fort, gold: gold - fortGunCost(), applied: true, cost: fortGunCost() };
}

/**
 * Build the yard's combatant (S74). It is a static hull: no speed, no manoeuvre, and the
 * same damage pipeline as a ship, so the rules cannot drift apart.
 *
 * `gunsPerSide` grows with the player's victories: every `gunsPerVictories` wins adds one
 * gun to each broadside, and now with the guns the player bought (S100).
 */
export function createFortCombatant({ victories = 0, boughtGuns = 0, gunsPerSide = FORT.gunsPerSide, hull = FORT.hull, toughness = FORT.toughness } = {}) {
  const perSide = fortGunsPerSide({ victories, boughtGuns, gunsPerSide });
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

/**
 * What the enemy leaves behind when she takes the yard (S93): a garrison of her own men.
 *
 * The occupation is a separate pool from the yard's own crew on purpose. The yard struck
 * *because* her garrison broke, so measuring the counter-attack on that same pool would
 * start the fight already lost. It is also the number the player has to break: retaking a
 * fortress is beating the men inside it, not knocking down the walls of your own harbour.
 */
export const OCCUPATION = {
  /**
   * Men the occupiers leave in her. A garrison of 212 is a fortress's *defence*, not a
   * force that holds a yard already taken: measured, breaking 212 men with a mid-sized
   * battery took 475 broadsides, which is not a fight, it is a chore. Sixty men is a
   * detachment the player can actually beat — measured, about 20 broadsides with a
   * 20-gun battery — while still being a real fight she can lose.
   */
  garrisonPct: 28,
  /** How much punishment one point of occupying crew takes, at the ship rate. */
  toughness: 1,
  /** Rounds each of her guns carries while she is held. An occupation is not resupplied. */
  shotsPerGun: 8,
  /**
   * The garrison the retaking party leaves behind, as a percentage. Retaking her is not a
   * rebuild (S94): she comes back with her hull as it was, and the men who took her back
   * stay to hold her. Without a floor she would strike again on the very next status
   * refresh, because she struck for having a broken garrison in the first place.
   */
  recoveredGarrisonPct: 45,
};

/**
 * The occupiers' fighting state for one taken yard (S93). Built on demand from the yard
 * itself, so there is exactly one record of "how strong is the enemy inside her" and it
 * lives where the rest of her state lives.
 */
function occupierState(fort) {
  if (!fort) return null;
  if (!fort.occupation) {
    fort.occupation = {
      // A full-strength occupation reads 100, whatever size the detachment is.
      condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
      crew: {
        marino: 0,
        artillero: FORT.gunners,
        soldado: Math.max(1, Math.round(FORT.soldiers * (OCCUPATION.garrisonPct / 100))),
      },
      initialCrew: Math.max(1, FORT.gunners + Math.round(FORT.soldiers * (OCCUPATION.garrisonPct / 100))),
      crewDamagePool: 0,
    };
  }
  return fort.occupation;
}

/**
 * Hand the yard to the enemy (S93). Called by the sea the moment she strikes, so the
 * occupiers exist before the player can shoot at them. Idempotent: occupying a yard that
 * is already held must not heal the men the player has already killed.
 */
export function occupyFort(fort) {
  if (!fort) return fort;
  if (!fortCaptured(fort) && !fortDestroyed(fort)) return fort;
  occupierState(fort);
  return fort;
}

/** True while the yard is held by the enemy and the player has to take her back (S93). */
export function fortHeldByEnemy(fort) {
  if (!fort) return false;
  return (fortCaptured(fort) || fortDestroyed(fort)) && Boolean(fort.occupation);
}

/** How much fight the occupiers have left, 0..100. A yard in our hands reads 100. */
export function fortOccupierCondition(fort) {
  if (!fortHeldByEnemy(fort)) return 100;
  const crew = Number(fort.occupation?.condition?.crew);
  return Number.isFinite(crew) ? crew : 100;
}

/** True once the occupiers have been broken and the yard is ours again (S93). */
export function fortRecovered(fort) {
  if (!fort) return false;
  return fort.status === "fighting";
}

/**
 * Hit the men holding the yard (S93). Their hull is not touched: the player is retaking
 * her own harbour, not bombarding it, and a fortress shelled into rubble is not recovered.
 * Once their garrison breaks, the yard changes hands in the same call.
 */
export function damageOccupiedFort(fort, damage) {
  if (!fortHeldByEnemy(fort)) return { fort, casualties: 0 };
  const state = fort.occupation;
  const crew = Number(damage?.crew);
  if (Number.isFinite(crew) && crew > 0) state.crewDamagePool += crew / OCCUPATION.toughness;

  let casualties = 0;
  while (state.crewDamagePool >= COMBAT.casualtyPoints) {
    state.crewDamagePool -= COMBAT.casualtyPoints;
    casualties += 1;
  }
  if (casualties > 0) {
    const alive = state.crew.soldado + state.crew.artillero + state.crew.marino;
    if (alive <= 0) {
      state.condition.crew = 0;
    } else {
      const take = Math.min(casualties, alive);
      // The soldiers are the ones who hold a wall: they take the losses first.
      const fromSoldiers = Math.min(take, state.crew.soldado);
      state.crew.soldado -= fromSoldiers;
      state.crew.artillero = Math.max(0, state.crew.artillero - (take - fromSoldiers));
      state.condition.crew = Math.max(
        0,
        Math.round((100 * (state.crew.soldado + state.crew.artillero + state.crew.marino)) / state.initialCrew),
      );
    }
  }

  if (state.condition.crew <= COMBAT.surrenderCrewPct) {
    // The men who took her are broken and the yard is ours again (S93).
    fort.status = "fighting";
    fort.condition.hull = Math.max(1, fort.condition.hull);
    fort.condition.crew = Math.max(OCCUPATION.recoveredGarrisonPct, fort.condition.crew);
    fort.crew = { marino: 0, artillero: FORT.gunners, soldado: Math.round(FORT.soldiers * (OCCUPATION.recoveredGarrisonPct / 100)) };
    fort.initialCrew = Math.max(1, FORT.gunners + FORT.soldiers);
    fort.crewDamagePool = 0;
    // Her guns come back with her, reloaded, with the rounds a yard keeps in her magazine.
    for (const piece of fort.pieces ?? []) {
      piece.reloadTimer = 0;
      piece.shotsLeft = FORT.shotsPerGun;
    }
    delete fort.occupation;
  }

  return { fort, casualties };
}

/**
 * The occupiers' next broadside (S93). They shoot with the yard's own guns, so the player
 * who comes to take her back is under the same fire she would face from any fortification.
 */
export function occupierReadyGuns(fort, side) {
  if (!fortHeldByEnemy(fort)) return [];
  const state = fort.occupation;
  const available = new Set(crewedPieces(fort.pieces, state.crew.artillero ?? 0));
  return (fort.pieces ?? []).filter(
    (p) => available.has(p) && (p.side === side || p.side === "swivel") && p.reloadTimer <= 0 && p.shotsLeft > 0,
  );
}

/** One volley from the men holding the yard, at a ship `distanceM` away (S93). */
export function occupierFire(fort, side, distanceM, rnd) {
  const guns = occupierReadyGuns(fort, side).filter((p) => {
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
    volley.push({ pieceId: p.pieceId, side, ammoId: p.ammoId, hit: rnd() < chance, distanceM });
  }
  return { fort, volley };
}

/** What a yard is worth to a boarding party: her guns and her stores (S74). */
export function fortPrize(fort) {
  if (!fort) return 0;
  const guns = (fort.pieces ?? []).length;
  const crew = (fort.crew?.soldado ?? 0) + (fort.crew?.artillero ?? 0);
  return guns * 40 + crew * 3;
}
