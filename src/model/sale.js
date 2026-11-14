/**
 * S62-S64: selling a hull and keeping a captured one.
 *
 * Three rules that belong together, because they share one question: what is a hull
 * worth to the player once she is no longer the one they sail?
 *
 *  - a hull the player owns sells for a share of her value (S62);
 *  - an enemy that strikes her colours can be taken instead of looted (S63);
 *  - the captured hull joins the fleet as the player's own and can be sold too (S64).
 *
 * Pure and storage-free: the sea screen and the shipyard only apply what is here.
 */

import { COMBAT } from "./combat.js";
import { hullById } from "../data/naval-data.js";
import { captainShip, removeShip } from "./fleet.js";
import { normaliseGold } from "./economy.js";
import { shipValue } from "./repair.js";

export const SALES = {
  /** Share of a hull's value the yard pays when the player sells her (S62). */
  share: 0.5,
};

/**
 * What selling one hull pays (S62): a share of her value, in whole doblones. The share
 * is the setting, so the screen and the sale can never disagree. Rounded down, so a
 * sale can never be a way to earn gold from price fractions.
 */
export function salePrice(ship, { share = SALES.share } = {}) {
  const value = shipValue(ship);
  const rate = Number(share);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.floor(value * rate + 1e-9);
}

/**
 * Sell one hull. Returns the fleet without her and the new purse, or null when the
 * sale is not allowed: the last hull cannot be sold (there would be nothing left to
 * sail), and an unknown id sells nothing. A captain who is sold hands the fleet to the
 * next hull in line, exactly as `removeShip` already does when she sinks.
 */
export function sellShip(fleet, shipId, gold, options = {}) {
  const ships = fleet?.ships ?? [];
  const ship = ships.find((entry) => entry.id === shipId);
  if (!ship) return null;
  // Selling the last hull would leave the player ashore with no way back to sea.
  if (ships.length <= 1) return null;
  const price = salePrice(ship, options);
  return {
    fleet: removeShip(fleet, shipId),
    gold: normaliseGold(gold) + price,
    price,
    ship,
  };
}

/** Whether a hull may be sold at all, so the screen can hide or disable the button. */
export function canSellShip(fleet, shipId) {
  const ships = fleet?.ships ?? [];
  if (ships.length <= 1) return false;
  return ships.some((entry) => entry.id === shipId);
}

/* ---------------------------------------------------------------- capture (S63) */

/**
 * The fleet entry for a hull taken as a prize (S63). She keeps the hull and the guns
 * she was fighting with, because that is what makes her worth taking: a captured ship
 * of the line is a ship of the line, not a bare frame. Her condition is whatever she
 * had left when she struck, and her crew is what survived — the player has to hire and
 * repair her like any other hull.
 *
 * The value she is worth is the catalogue price of her hull, since nothing was paid for
 * her. `captured: true` marks her as a prize, so the screens can say where she came from.
 */
export function capturedShip(encounter, { name = null, id = null } = {}) {
  const hull = hullById(encounter?.hullId);
  const combat = encounter?.combat;
  if (!hull || !combat) return null;

  // One battery entry per piece and side, rebuilt from the individual guns she carried.
  const batteries = [];
  for (const piece of combat.pieces ?? []) {
    const existing = batteries.find((entry) => entry.pieceId === piece.pieceId && entry.side === piece.side);
    if (existing) {
      existing.qty += 1;
      existing.shotsPerPiece = Math.max(existing.shotsPerPiece, piece.shotsLeft ?? 0);
      continue;
    }
    batteries.push({
      pieceId: piece.pieceId,
      side: piece.side,
      ammoId: piece.ammoId,
      qty: 1,
      shotsPerPiece: Math.max(0, piece.shotsLeft ?? 0),
    });
  }

  const crew = { ...(combat.crew ?? {}) };
  return {
    id: id ?? `prize-${encounter.id}-${Date.now()}`,
    name: name ?? hull.name,
    hullId: hull.id,
    hullName: hull.name,
    hullType: hull.type,
    country: hull.country,
    date: hull.date,
    maxPiecesPerSide: hull.maxPiecesPerSide,
    speedKn: combat.maxSpeedKn,
    crew,
    crewAlive: { ...crew },
    batteries,
    // What she had left when she struck, so a prize has to be repaired like any hull.
    condition: { ...combat.condition },
    // Nothing was paid for her, so her value is her catalogue price.
    paidGold: hull.priceGold,
    captured: true,
  };
}

/**
 * The prize a surrendered enemy offers (S63), or null when the fight is not over or the
 * hull was sunk: a sunk ship is a wreck, not a capture. `surrenderCrewPct` is the same
 * threshold the combat model uses, so the two can never disagree about what surrender
 * means.
 */
export function captureableShip(encounter, { surrenderCrewPct = COMBAT.surrenderCrewPct } = {}) {
  if (!encounter || encounter.type !== "enemy") return null;
  const combat = encounter.combat;
  if (!combat) return null;
  if (combat.status === "sunk") return null;
  const struck = combat.status === "surrendered" || combat.condition?.crew <= surrenderCrewPct;
  if (!struck) return null;
  return capturedShip(encounter);
}

/**
 * Add a prize to the fleet. A fleet with no captain takes the prize as its captain,
 * which is the only way a player who lost every hull could sail again; otherwise she
 * joins as a hull in port, exactly like a bought ship that is not promoted.
 */
export function withPrize(fleet, prize) {
  if (!prize) return fleet;
  const ships = [...(fleet?.ships ?? []), prize];
  const captainId = captainShip(fleet)?.id ?? prize.id;
  return { ships, captainId };
}
