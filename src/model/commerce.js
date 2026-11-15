/**
 * S113-S114: the trade. Buy where a thing is made, sell where it is missed.
 *
 * One rule decides every price: a commodity is cheap in the water that produces it and
 * dear in the water that lacks it. So a voyage is a real decision — the profit is the
 * distance, and the risk of the crossing is its cost.
 *
 * The load is not a second inventory (S114). What the player buys here is the same
 * cargo that already weighs her down, deepens her draught and raises her worth
 * (S110, S111): the manifest is what the hold is made of, and `cargoKg` is its total.
 */

import { COMMODITIES, commodityById } from "../data/naval-data.js";

/**
 * The market of each zone (S113): how a commodity's base price is scaled when the yard
 * buys it and when the yard sells it.
 *
 * `produce` is where a thing is made, so it is cheap to buy there. `demand` is what the
 * water lacks, so it pays well. The gap between them is the trade, and the spread is
 * deliberately wide enough that a coastal-to-abyssal run pays for the crossing.
 */
export const MARKETS = {
  costera: { buy: 0.6, sell: 1.0 },
  abierto: { buy: 1.0, sell: 1.8 },
  abismo: { buy: 1.6, sell: 3.2 },
};

/** The trade tuning the settings screen may change (S113). */
export const COMMERCE = {
  /** Share of a sunk enemy's hold that can still be salvaged (S115). */
  sunkCargoShare: 0.35,
  /** Cap on the manifest a spawned enemy carries, in kg, before the zone factor (S115). */
  enemyHoldKg: 12000,
};

/** The market of a zone, falling back to coastal water for anything unknown. */
export function marketOf(zoneId) {
  return MARKETS[zoneId] ?? MARKETS.costera;
}

/** A price, in whole doblones, never negative and never NaN. */
const price = (value) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

/** What one unit of a commodity costs to buy in a zone. */
export function buyPrice(commodityId, zoneId) {
  const commodity = commodityById(commodityId);
  if (!commodity) return 0;
  return price(commodity.baseGold * marketOf(zoneId).buy);
}

/** What one unit of a commodity pays to sell in a zone. */
export function sellPrice(commodityId, zoneId) {
  const commodity = commodityById(commodityId);
  if (!commodity) return 0;
  return price(commodity.baseGold * marketOf(zoneId).sell);
}

/** The whole catalogue priced for one yard, which is what the market screen lists. */
export function marketBoard(zoneId) {
  return COMMODITIES.map((commodity) => ({
    id: commodity.id,
    nameKey: commodity.nameKey,
    kgPerUnit: commodity.kgPerUnit,
    buy: buyPrice(commodity.id, zoneId),
    sell: sellPrice(commodity.id, zoneId),
  }));
}

/* ------------------------------------------------------------------- the hold (S114) */

/**
 * A hold: the manifest plus the kg it adds up to. `cargoKg` is never stored twice —
 * it is the sum of the manifest, so the two can never disagree about what a ship
 * weighs.
 */
export function holdOf(manifest = []) {
  const entries = (Array.isArray(manifest) ? manifest : [])
    .map((entry) => {
      const commodity = commodityById(entry?.commodityId);
      const units = Math.max(0, Math.floor(Number(entry?.units) || 0));
      if (!commodity || units <= 0) return null;
      return { commodityId: commodity.id, units, kg: units * commodity.kgPerUnit };
    })
    .filter(Boolean);
  return { manifest: entries, cargoKg: entries.reduce((total, entry) => total + entry.kg, 0) };
}

/** The hold of a ship, whatever shape it was saved in. */
export function shipHold(ship) {
  return holdOf(ship?.manifest ?? []);
}

/**
 * What is left of a hold after `share` of it is lost (S115). Whole units survive, so a
 * salvaged hold is a real manifest and not a fraction of a barrel.
 */
export function salvageHold(manifest, share) {
  const rate = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
  const entries = (Array.isArray(manifest) ? manifest : [])
    .map((entry) => {
      const units = Math.floor((Number(entry?.units) || 0) * rate);
      return units > 0 ? { ...entry, units } : null;
    })
    .filter(Boolean);
  return holdOf(entries);
}

/* -------------------------------------------------------------- buying and selling */

/**
 * Buy `units` of a commodity at a yard (S114). Returns the new hold, the gold paid and
 * the new purse, or null when the trade is not allowed — and a refused trade pays
 * nothing and loads nothing, so the caller can never half-apply it.
 *
 * The hold must fit: the capacity the hull already declares is the only limit, because
 * the trade is the same cargo that weighs her down.
 */
export function buyCargo({ manifest, capacityKg, cargoKg, gold }, commodityId, units, zoneId) {
  const commodity = commodityById(commodityId);
  const wanted = Math.floor(Number(units) || 0);
  if (!commodity || wanted <= 0) return null;
  const purse = Number.isFinite(gold) ? gold : 0;
  const cost = buyPrice(commodity.id, zoneId) * wanted;
  if (cost > purse) return null;
  const hold = holdOf(manifest);
  const addedKg = wanted * commodity.kgPerUnit;
  const freeKg = Number.isFinite(capacityKg) ? capacityKg - (Number(cargoKg) || hold.cargoKg) : Infinity;
  if (addedKg > freeKg) return null;
  const next = holdOf([...hold.manifest, { commodityId: commodity.id, units: wanted }]);
  return { hold: next, paid: cost, gold: purse - cost, commodity, units: wanted };
}

/**
 * Sell `units` of a commodity at a yard (S114). Only what is actually in the hold can be
 * sold: a hold with 3 barrels sells 3, never 4.
 */
export function sellCargo({ manifest, gold }, commodityId, units, zoneId) {
  const commodity = commodityById(commodityId);
  const wanted = Math.floor(Number(units) || 0);
  if (!commodity || wanted <= 0) return null;
  const hold = holdOf(manifest);
  const stock = hold.manifest.find((entry) => entry.commodityId === commodity.id);
  if (!stock || stock.units < wanted) return null;
  const earned = sellPrice(commodity.id, zoneId) * wanted;
  const left = hold.manifest
    .map((entry) => (entry.commodityId === commodity.id ? { ...entry, units: entry.units - wanted } : entry))
    .filter((entry) => entry.units > 0);
  const purse = Number.isFinite(gold) ? gold : 0;
  return { hold: holdOf(left), earned, gold: purse + earned, commodity, units: wanted };
}

/**
 * Put a hold on a hull (S114). This is the only place that writes `manifest` and
 * `cargoKg` together, so the invariant `cargoKg = generic cargo + manifest kg` holds
 * everywhere: the hand-typed cargo of the builder is not merchandise and cannot be
 * sold, but it still weighs.
 */
export function withHold(ship, hold) {
  const previous = shipHold(ship).cargoKg;
  const generic = Math.max(0, (Number(ship?.cargoKg) || 0) - previous);
  const next = holdOf(hold?.manifest ?? []);
  return { ...ship, manifest: next.manifest, cargoKg: generic + next.cargoKg };
}

/**
 * The most units of a commodity a hull can still take (S114). The market screen shows
 * this, and it is what stops a player from buying a hold she cannot carry.
 */
export function affordableUnits({ capacityKg, cargoKg, gold }, commodityId, zoneId) {
  const commodity = commodityById(commodityId);
  if (!commodity) return 0;
  const unitPrice = buyPrice(commodity.id, zoneId);
  const freeKg = Math.max(0, (Number(capacityKg) || 0) - (Number(cargoKg) || 0));
  const bySpace = Math.floor(freeKg / commodity.kgPerUnit);
  const byPurse = unitPrice > 0 ? Math.floor((Number(gold) || 0) / unitPrice) : bySpace;
  return Math.max(0, Math.min(bySpace, byPurse));
}
