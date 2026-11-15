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

import { COMMODITIES, commodityById, hullById, shipyardById } from "../data/naval-data.js";

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
 * The hold must fit and the yard must have the whole order. Missing or broken stock
 * falls back to a yard at rest; stock is supplied from the board's quote (S119).
 */
export function buyCargo({ manifest, capacityKg, cargoKg, gold }, commodityId, units, zoneId, { unitPrice, availableStock } = {}) {
  const commodity = commodityById(commodityId);
  const wanted = Math.floor(Number(units) || 0);
  if (!commodity || wanted <= 0 || wanted > availableUnits(commodity.id, availableStock)) return null;
  const purse = Number.isFinite(gold) ? gold : 0;
  const quoted = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : buyPrice(commodity.id, zoneId);
  const cost = quoted * wanted;
  if (cost > purse) return null;
  const hold = holdOf(manifest);
  const addedKg = wanted * commodity.kgPerUnit;
  const freeKg = Number.isFinite(capacityKg) ? capacityKg - (Number(cargoKg) || hold.cargoKg) : Infinity;
  if (addedKg > freeKg) return null;
  const existing = hold.manifest.filter((entry) => entry.commodityId === commodity.id);
  const next = holdOf([
    ...hold.manifest.filter((entry) => entry.commodityId !== commodity.id),
    { commodityId: commodity.id, units: wanted + existing.reduce((sum, entry) => sum + entry.units, 0) },
  ]);
  return { hold: next, paid: cost, gold: purse - cost, commodity, units: wanted };
}

/**
 * Sell `units` of a commodity at a yard (S114). Only what is actually in the hold can be
 * sold: a hold with 3 barrels sells 3, never 4.
 */
export function sellCargo({ manifest, gold }, commodityId, units, zoneId, { unitPrice } = {}) {
  const commodity = commodityById(commodityId);
  const wanted = Math.floor(Number(units) || 0);
  if (!commodity || wanted <= 0) return null;
  const hold = holdOf(manifest);
  const available = hold.manifest.filter((entry) => entry.commodityId === commodity.id)
    .reduce((sum, entry) => sum + entry.units, 0);
  if (available < wanted) return null;
  const quoted = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : sellPrice(commodity.id, zoneId);
  const earned = quoted * wanted;
  let remaining = wanted;
  const left = hold.manifest.map((entry) => {
    if (entry.commodityId !== commodity.id) return entry;
    const removed = Math.min(remaining, entry.units);
    remaining -= removed;
    return { ...entry, units: entry.units - removed };
  }).filter((entry) => entry.units > 0);
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
function availableUnits(commodityId, availableStock) {
  return Math.floor(stockOf({ stock: { [commodityId]: availableStock } }, commodityId));
}

export function affordableUnits({ capacityKg, cargoKg, gold }, commodityId, zoneId, { unitPrice: quote, availableStock } = {}) {
  const commodity = commodityById(commodityId);
  if (!commodity) return 0;
  const unitPrice = Number.isFinite(quote) && quote >= 0 ? quote : buyPrice(commodity.id, zoneId);
  const freeKg = Math.max(0, (Number(capacityKg) || 0) - (Number(cargoKg) || 0));
  const bySpace = Math.floor(freeKg / commodity.kgPerUnit);
  const byPurse = unitPrice > 0 ? Math.floor((Number(gold) || 0) / unitPrice) : bySpace;
  return Math.max(0, Math.min(bySpace, byPurse, availableUnits(commodity.id, availableStock)));
}

/* ------------------------------------------------- what a defeated hull carried (S115) */

/** Deterministic RNG, the same one the sea uses: same sail, same hold. */
function mulberry32(state) {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: t };
}

/**
 * How much a hold of a zone is worth as a multiplier on the declared enemy hold (S115).
 * Deeper water carries richer cargo, which is what makes a dangerous crossing pay.
 */
const HOLD_ZONE = { costera: 0.5, abierto: 1, abismo: 1.8 };

/**
 * The hold an enemy sails with (S115). Deterministic in the encounter id and the hull,
 * exactly like her guns (combat.js), so the same sail always carries the same cargo: a
 * reload cannot reroll a rich prize.
 *
 * The kg is scaled by her zone, and the goods are spread across the catalogue so a
 * captured hold is worth selling rather than a single line of barrels.
 */
export function enemyHoldFor(encounter) {
  const id = Number(encounter?.id);
  const hull = hullById(encounter?.hullId);
  if (!Number.isFinite(id) || !hull) return null;
  const zoneId = encounter.zoneId ?? "costera";
  const zoneFactor = HOLD_ZONE[zoneId] ?? HOLD_ZONE.costera;
  const baseKg = Number.isFinite(COMMERCE.enemyHoldKg) ? COMMERCE.enemyHoldKg : 12000;
  const targetKg = Math.round(baseKg * zoneFactor * (0.6 + 0.8 * ((id * 2654435761) % 1000) / 1000));

  let state = (id * 40503) ^ 0x9e3779b9;
  const rnd = () => {
    const r = mulberry32(state);
    state = r.state;
    return r.value;
  };
  const manifest = [];
  let leftKg = targetKg;
  // A merchantman fills her hold with a few lines of goods, never one endless one.
  const lines = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < lines && leftKg > 0; i += 1) {
    const commodity = COMMODITIES[Math.floor(rnd() * COMMODITIES.length)];
    const share = i === lines - 1 ? 1 : 0.2 + rnd() * 0.5;
    const units = Math.floor((leftKg * share) / commodity.kgPerUnit);
    if (units <= 0) continue;
    manifest.push({ commodityId: commodity.id, units });
    leftKg -= units * commodity.kgPerUnit;
  }
  return holdOf(manifest);
}

/**
 * What a defeated hull leaves to be picked up (S115): her whole hold if she struck her
 * colours, a declared share of it if she went down. A fight that is not over yet leaves
 * nothing, because nothing has been won.
 */
export function defeatedHold(hold, status, { share = COMMERCE.sunkCargoShare } = {}) {
  const source = holdOf(hold?.manifest ?? []);
  if (source.cargoKg === 0) return { manifest: [], cargoKg: 0 };
  if (status === "surrendered") return source;
  if (status !== "sunk") return { manifest: [], cargoKg: 0 };
  return salvageHold(source.manifest, share);
}

/**
 * Load a prize into a hull's hold (S115). Only what fits goes aboard; the rest stays in
 * the water, so a small hull cannot swallow a galleon's cargo. Returns the ship with her
 * new hold and what was left behind, never null: a prize that does not fit is a smaller
 * prize, not a failed one.
 */
export function awardHold(ship, prize) {
  const incoming = holdOf(prize?.manifest ?? []);
  const current = shipHold(ship);
  const capacity = Number(ship?.capacityKg);
  const freeKg = Number.isFinite(capacity) ? Math.max(0, capacity - (Number(ship?.cargoKg) || 0)) : Infinity;

  const manifest = [...current.manifest.map((entry) => ({ ...entry }))];
  let leftKg = 0;
  const left = [];
  for (const entry of incoming.manifest) {
    const fits = Math.min(entry.units, Math.floor(freeKg / commodityById(entry.commodityId).kgPerUnit));
    const remainder = entry.units - Math.max(0, fits);
    if (fits > 0) {
      const existing = manifest.find((line) => line.commodityId === entry.commodityId);
      if (existing) existing.units += fits;
      else manifest.push({ commodityId: entry.commodityId, units: fits });
    }
    if (remainder > 0) {
      left.push({ commodityId: entry.commodityId, units: remainder });
      leftKg += remainder * commodityById(entry.commodityId).kgPerUnit;
    }
  }
  return { ship: withHold(ship, holdOf(manifest)), left: holdOf(left), leftKg };
}

/* --------------------------------------------------------------- a market with memory */

/**
 * The state of one yard's market (S119). It is not a price list: it is how much of each
 * thing the yard has, and the price is derived from it. That way a market can never lie
 * about what it holds, and a save can be repaired by clamping the stock instead of
 * trusting a number someone typed.
 *
 * `stock` is in units, one entry per commodity id. A yard with no entry has her full
 * stock, because a market that never traded is a market at rest.
 */
export const MARKET_MEMORY = {
  /** Units of each commodity a yard holds at rest, where her price is the zone base (S119). */
  baseStock: 60,
  /** The most a yard can hold: a glutted market, at her floor price (S119). */
  maxStock: 120,
  /** How much of the base price one unit of stock moves, kept for tuning (S119). */
  elasticity: 0.9,
  /** Days of game time for a yard to come back to her resting stock (S119). */
  recoveryDays: 3,
  /** The price share at a glutted yard (maxStock). Never lower than this (S119). */
  floorShare: 0.45,
  /** The price share at an empty yard (0 stock). Never higher than this (S119). */
  ceilShare: 1.6,
};

/**
 * The stock a yard holds of one commodity right now, read from her memory (S119).
 * A missing, broken or negative entry is the base stock: a market at rest.
 */
export function stockOf(memory, commodityId) {
  const base = MARKET_MEMORY.baseStock;
  const entry = memory?.stock?.[commodityId];
  if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0 || !commodityById(commodityId)) return base;
  return Math.min(MARKET_MEMORY.maxStock, entry);
}

/** Price pressure falls from the empty-yard ceiling through rest to the glut floor. */
export function stockFactor(stock, { base = MARKET_MEMORY.baseStock, max = MARKET_MEMORY.maxStock, floor = MARKET_MEMORY.floorShare, ceil = MARKET_MEMORY.ceilShare } = {}) {
  const held = typeof stock === "number" && !Number.isNaN(stock) ? stock : base;
  if (held <= 0) return ceil;
  if (held >= max) return floor;
  if (held === base) return 1;
  if (held < base) return ceil - (ceil - 1) * held / base;
  return 1 - (1 - floor) * (held - base) / (max - base);
}

/**
 * What the yard charges for one unit right now (S119): her zone's price, moved by how
 * much of it she holds. Scarcity is dearer, and it is the same rule the player faces
 * when she sells into a market that already has too much.
 */
export function buyPriceNow(commodityId, zoneId, memory) {
  const commodity = commodityById(commodityId);
  if (!commodity) return 0;
  return price(commodity.baseGold * marketOf(zoneId).buy * stockFactor(stockOf(memory, commodity.id)));
}

/** What the yard pays for one unit right now (S119), moved by her own stock. */
export function sellPriceNow(commodityId, zoneId, memory) {
  const commodity = commodityById(commodityId);
  if (!commodity) return 0;
  return price(commodity.baseGold * marketOf(zoneId).sell * stockFactor(stockOf(memory, commodity.id)));
}

/**
 * One yard's whole board at her current stock (S119), which is what the market screen
 * paints. `before` is the base price for the zone, so the screen can show the drift.
 */
export function marketBoardNow(zoneId, memory) {
  return COMMODITIES.map((commodity) => ({
    id: commodity.id,
    nameKey: commodity.nameKey,
    kgPerUnit: commodity.kgPerUnit,
    buy: buyPriceNow(commodity.id, zoneId, memory),
    sell: sellPriceNow(commodity.id, zoneId, memory),
    baseBuy: buyPrice(commodity.id, zoneId),
    baseSell: sellPrice(commodity.id, zoneId),
    stock: stockOf(memory, commodity.id),
  }));
}

/**
 * A yard's memory, with one commodity's stock moved by `delta` units (S119). It is
 * clamped between zero and maxStock; a glut can exceed the resting stock.
 */
export function withStock(memory, commodityId, delta) {
  const current = stockOf(memory, commodityId);
  const change = typeof delta === "number" && Number.isFinite(delta) ? delta : 0;
  const next = Math.max(0, Math.min(MARKET_MEMORY.maxStock, current + change));
  return {
    ...memory,
    stock: { ...(memory?.stock ?? {}), [commodityId]: next },
  };
}

/** Drop unknown yards and repair malformed saved stock without advancing the clock. */
export function normaliseMarkets(memories) {
  const result = {};
  if (!memories || typeof memories !== "object" || Array.isArray(memories)) return result;
  for (const [yardId, memory] of Object.entries(memories)) {
    if (!shipyardById(yardId)) continue;
    const stock = {};
    for (const commodity of COMMODITIES) stock[commodity.id] = stockOf(memory, commodity.id);
    result[yardId] = { stock };
  }
  return result;
}

/**
 * Let every yard's market come back towards her base stock (S119), for the game time
 * that has passed. The player chose a market that recovers instead of one that dries up
 * for good, so the only question here is how fast: `recoveryDays` of game time.
 *
 * The same linear rate refills a drained yard and drains a glutted one, stopping at rest.
 */
export function recoverMarkets(memories, seconds) {
  const elapsed = Number(seconds);
  const perDay = MARKET_MEMORY.baseStock / Math.max(1, MARKET_MEMORY.recoveryDays);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return memories ?? {};
  const days = elapsed / secondsPerGameDay();
  if (days <= 0) return memories ?? {};
  const gain = perDay * days;
  const result = {};
  for (const [yardId, memory] of Object.entries(memories && typeof memories === "object" ? memories : {})) {
    if (!shipyardById(yardId)) continue;
    const stock = {};
    for (const commodity of COMMODITIES) {
      const current = stockOf(memory, commodity.id);
      stock[commodity.id] = current < MARKET_MEMORY.baseStock
        ? Math.min(MARKET_MEMORY.baseStock, current + gain)
        : Math.max(MARKET_MEMORY.baseStock, current - gain);
    }
    result[yardId] = { stock };
  }
  return result;
}

/** Seconds of play that stand for one game day, read from the live setting (S67). */
function secondsPerGameDay() {
  // Imported lazily to keep this module free of a cycle: game-time reads no commerce.
  const value = Number(GLOBAL_GAME_TIME?.gameSecondsPerDay);
  return Number.isFinite(value) && value > 0 ? value : 100;
}

/**
 * The live length of a game day, injected by the settings boot (S67). Commerce never
 * imports game-time directly: both modules are read by the settings screen, and a cycle
 * there would be a load-order bug waiting to happen.
 */
export let GLOBAL_GAME_TIME = { gameSecondsPerDay: 100 };

/** Point the market's clock at the live game-time block (S67). */
export function bindGameTime(block) {
  if (block && Number.isFinite(Number(block.gameSecondsPerDay))) GLOBAL_GAME_TIME = block;
}
