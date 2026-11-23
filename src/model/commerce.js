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

import { COMMODITIES, SHIPYARDS, commodityById, hullById, shipyardById } from "../data/naval-data.js";

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

/**
 * The live price multipliers of every yard and good, flat and keyed `yardId/commodityId`.
 * Each entry IS the object in the yard's own `market`, so the settings screen edits the
 * yard's market in place and the prices follow.
 */
export const YARD_MARKETS = Object.fromEntries(
  SHIPYARDS.flatMap((yard) => Object.entries(yard.market ?? {}).map(([id, shares]) => [`${yard.id}/${id}`, shares])),
);

/** The yard whose own market list this key names, or null when it names a zone. */
const yardMarket = (key) => {
  const yard = shipyardById(key);
  return yard?.market && typeof yard.market === "object" ? yard : null;
};

/**
 * Whether a market trades a good. A yard trades exactly the goods she lists (her own
 * market); a market with no list of its own, a zone, trades everything.
 */
export function tradedHere(key, commodityId) {
  const yard = yardMarket(key);
  return yard ? Boolean(yard.market[commodityId]) : Boolean(commodityById(commodityId));
}

/** The multiplier a market puts on a good's base price, on one side (`buy` or `sell`). */
const shareOf = (key, commodityId, side) => {
  const yard = yardMarket(key);
  return yard ? yard.market[commodityId]?.[side] : marketOf(key)[side];
};

/** A price, in whole doblones, never negative and never NaN. */
const price = (value) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);

/** What one unit of a commodity costs to buy in a zone. */
export function buyPrice(commodityId, zoneId) {
  const commodity = commodityById(commodityId);
  if (!commodity || !tradedHere(zoneId, commodity.id)) return 0;
  return price(commodity.baseGold * shareOf(zoneId, commodity.id, "buy"));
}

/** What one unit of a commodity pays to sell in a zone. */
export function sellPrice(commodityId, zoneId) {
  const commodity = commodityById(commodityId);
  if (!commodity || !tradedHere(zoneId, commodity.id)) return 0;
  return price(commodity.baseGold * shareOf(zoneId, commodity.id, "sell"));
}

/** The whole catalogue priced for one yard, which is what the market screen lists. */
export function marketBoard(zoneId) {
  return COMMODITIES.filter((commodity) => tradedHere(zoneId, commodity.id)).map((commodity) => ({
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

/* ------------------------------------------------- holding the buy button (S138) */

/**
 * Holding the buy button (S138). The player's rule: one press buys a unit, and keeping the
 * button down buys ten at a time until the money runs out. The step is data so the screen
 * and the model can never disagree about it.
 */
export const HOLD_BUY = { firstUnits: 1, repeatUnits: 10 };

/** How many units a repeat of the held button asks for: the first is one, the rest ten. */
export function holdBuyUnits(repeat) {
  const index = Number(repeat);
  return Number.isFinite(index) && index > 0 ? HOLD_BUY.repeatUnits : HOLD_BUY.firstUnits;
}

/**
 * How many units a held press may buy in total, given what the purse, the hold and the
 * yard's stock allow (S138): one unit first, then as many whole batches of ten as fit.
 * Nothing is rounded up, so the answer is always affordable and always fits.
 */
export function holdBuyTotal(input) {
  const { unitPrice, gold, room, stock } = input && typeof input === "object" ? input : {};
  const price = Number(unitPrice);
  const purse = Number(gold);
  const freeKg = Number(room);
  const available = Number(stock);
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (!Number.isFinite(purse) || purse <= 0) return 0;
  const roomLeft = Number.isFinite(freeKg) && freeKg > 0 ? Math.floor(freeKg) : 0;
  const stockLeft = Number.isFinite(available) && available > 0 ? Math.floor(available) : 0;
  const byPurse = Math.floor(purse / price);
  const ceiling = Math.min(byPurse, roomLeft, stockLeft);
  if (ceiling <= 0) return 0;
  const batches = Math.floor((ceiling - HOLD_BUY.firstUnits) / HOLD_BUY.repeatUnits);
  return HOLD_BUY.firstUnits + Math.max(0, batches) * HOLD_BUY.repeatUnits;
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
  if (!commodity || !tradedHere(zoneId, commodity.id) || wanted <= 0 || wanted > availableUnits(commodity.id, availableStock)) return null;
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
 *
 * The yard pays the price her own stock earns, unit by unit (S125). Quoting one price and
 * applying it to the whole load made a single sale of 500 silver pay 288000 doblones into
 * a market that holds 60: the stock only moved after the money was counted, so the curve
 * of S119 never had a chance to bite. With `memory` the yard pays the price that
 * corresponds to each unit she takes, so a big load pays less per unit the deeper it goes.
 *
 * Without `memory` the old flat quote stands: callers that have no market state (and the
 * tests that pin a single price) keep working.
 */
export function sellCargo({ manifest, gold }, commodityId, units, zoneId, { unitPrice, memory } = {}) {
  const commodity = commodityById(commodityId);
  const wanted = Math.floor(Number(units) || 0);
  if (!commodity || !tradedHere(zoneId, commodity.id) || wanted <= 0) return null;
  const hold = holdOf(manifest);
  const available = hold.manifest.filter((entry) => entry.commodityId === commodity.id)
    .reduce((sum, entry) => sum + entry.units, 0);
  if (available < wanted) return null;

  // Per-unit pricing when the caller hands the yard's memory: the stock climbs with each
  // unit sold, so the next unit pays less. The flat quote is the fallback.
  let earned = 0;
  if (memory && typeof memory === "object") {
    let walking = memory;
    for (let sold = 0; sold < wanted; sold += 1) {
      earned += sellPriceNow(commodity.id, zoneId, walking);
      walking = withStock(walking, commodity.id, 1);
    }
  } else {
    const quoted = Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : sellPrice(commodity.id, zoneId);
    earned = quoted * wanted;
  }

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
  if (!commodity || !tradedHere(zoneId, commodity.id)) return 0;
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
 * How much a hold of a zone is worth as a multiplier on the declared prize value (S177).
 * Deeper water carries richer cargo, which is what makes a dangerous crossing pay.
 */
const HOLD_ZONE = { costera: 0.5, abierto: 1, abismo: 1.8 };

/**
 * What a prize is worth, as a rule about value and not about weight (S177).
 *
 * The player reported a hold worth 13 million doblones and she was right: the prize used to
 * aim at 12 tonnes of whatever the dice picked, so twelve tonnes of timber (18 loads, 522
 * doblones) and twelve tonnes of diamonds (3,000 stones, 13,440,000) were the same roll. The
 * weight limit was never a value limit.
 *
 * Now the prize aims at a value: a share of what the hull herself is worth, moved by the
 * water she sails. The goods are only the form that value takes, so a rich good arrives in
 * small quantity — which is both the fix and the realistic answer.
 */
export const HOLD_VALUE = {
  /**
   * The share of the hull's own price a prize is worth, before the zone. 0.08 means a
   * 50,000-doblón galleon carries about 4,000 doblones of cargo, which pays for the fight
   * and the crossing without breaking the economy.
   */
  prizeShareOfHull: 0.08,
  /** How far either way one prize may land from that share, as a multiplier band. */
  minSpread: 0.6,
  maxSpread: 1.4,
  /** The value multiplier of each water (S177), the same shape the old weight factor had. */
  zoneFactor: HOLD_ZONE,
};

/**
 * The hold an enemy sails with (S115, S177). Deterministic in the encounter id and the
 * hull, exactly like her guns (combat.js), so the same sail always carries the same cargo:
 * a reload cannot reroll a rich prize.
 *
 * The target is a value in doblones, scaled by her hull and her water. The goods are drawn
 * from the catalogue and bought with that value, line by line, so what she carries is worth
 * what she is meant to be worth whatever the dice hand her.
 */
export function enemyHoldFor(encounter) {
  const id = Number(encounter?.id);
  const hull = hullById(encounter?.hullId);
  if (!Number.isFinite(id) || !hull) return null;
  const zoneId = encounter.zoneId ?? "costera";
  const zoneFactor = HOLD_VALUE.zoneFactor[zoneId] ?? HOLD_VALUE.zoneFactor.costera;

  let state = (id * 40503) ^ 0x9e3779b9;
  const rnd = () => {
    const r = mulberry32(state);
    state = r.state;
    return r.value;
  };
  // The value this sail carries: a share of her hull, the water's factor, and a band that
  // keeps two prizes of the same water from being identical.
  const share = HOLD_VALUE.minSpread + (HOLD_VALUE.maxSpread - HOLD_VALUE.minSpread) * rnd();
  const hullPrice = Number(hull.priceGold) || 0;
  let leftGold = Math.round(hullPrice * HOLD_VALUE.prizeShareOfHull * zoneFactor * share);

  const manifest = [];
  // A merchantman fills her hold with a few lines of goods, never one endless one.
  const lines = 2 + Math.floor(rnd() * 3);
  // S177: the hold also has to be able to carry what she is worth. A value rule alone
  // bought 104 tonnes of wine for a great galleon, which no hull could take aboard and
  // which made the prize uncollectable. The weight ceiling is the old declared hold, and
  // it is a ceiling, not a target: the value decides, the weight only stops nonsense.
  const maxKg = (Number.isFinite(COMMERCE.enemyHoldKg) ? COMMERCE.enemyHoldKg : 12000) *
    (HOLD_VALUE.zoneFactor[zoneId] ?? 1);
  let leftKg = maxKg;
  for (let i = 0; i < lines && leftGold > 0 && leftKg > 0; i += 1) {
    const commodity = COMMODITIES[Math.floor(rnd() * COMMODITIES.length)];
    const lineGold = i === lines - 1 ? leftGold : Math.round(leftGold * (0.2 + rnd() * 0.5));
    // Units are bought with the value of the line, at the good's base price: a rich good
    // therefore arrives in small quantity, which is the whole point of the rule.
    const units = Math.floor(lineGold / Math.max(1, commodity.baseGold));
    const unitsByWeight = Math.floor(leftKg / Math.max(1, commodity.kgPerUnit));
    const taken = Math.min(units, unitsByWeight);
    if (taken <= 0) continue;
    manifest.push({ commodityId: commodity.id, units: taken });
    leftGold -= taken * commodity.baseGold;
    leftKg -= taken * commodity.kgPerUnit;
  }
  // S177: a cheap good cannot carry a rich prize in the weight she has. Twelve tonnes of
  // timber is worth a few hundred doblones however it is counted, so a line that ran out of
  // room leaves value unspent — and that is what made two prizes of the same water differ
  // eightfold. The leftover is placed on the densest goods that still fit, which is exactly
  // the cargo a real merchantman would carry to be worth what she is worth.
  if (leftGold > 0 && leftKg > 0) {
    const densest = [...COMMODITIES].sort((a, b) => b.baseGold / b.kgPerUnit - a.baseGold / a.kgPerUnit);
    for (const commodity of densest) {
      if (leftGold <= 0 || leftKg <= 0) break;
      const units = Math.min(
        Math.floor(leftGold / Math.max(1, commodity.baseGold)),
        Math.floor(leftKg / Math.max(1, commodity.kgPerUnit)),
      );
      if (units <= 0) continue;
      const line = manifest.find((entry) => entry.commodityId === commodity.id);
      if (line) line.units += units;
      else manifest.push({ commodityId: commodity.id, units });
      leftGold -= units * commodity.baseGold;
      leftKg -= units * commodity.kgPerUnit;
    }
  }
  // A roll can still come up empty when every good it drew was too rich for the room. A
  // prize worth nothing is not a prize, so the hold falls back to the cheapest good, which
  // always fits a line of it.
  if (manifest.length === 0) {
    const cheapest = [...COMMODITIES].sort((a, b) => a.baseGold - b.baseGold)[0];
    const units = Math.min(
      Math.floor(leftGold / Math.max(1, cheapest.baseGold)),
      Math.floor(maxKg / Math.max(1, cheapest.kgPerUnit)),
    );
    if (units > 0) manifest.push({ commodityId: cheapest.id, units });
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
  // S176: the room is measured once, before the loop, but it has to come DOWN with every
  // line the hold accepts. A prize arrives as several lines of goods, and comparing each
  // one against the space the hold had when the loop began let three lines fit three times:
  // a 40,000 kg hold took 40,140 kg, and a rich line of diamonds — which weighs almost
  // nothing — was the line that could never be stopped by weight.
  let roomKg = freeKg;
  let leftKg = 0;
  const left = [];
  for (const entry of incoming.manifest) {
    const unitKg = commodityById(entry.commodityId).kgPerUnit;
    const fits = Math.min(entry.units, Math.floor(roomKg / unitKg));
    const remainder = entry.units - Math.max(0, fits);
    if (fits > 0) {
      const existing = manifest.find((line) => line.commodityId === entry.commodityId);
      if (existing) existing.units += fits;
      else manifest.push({ commodityId: entry.commodityId, units: fits });
      roomKg -= fits * unitKg;
    }
    if (remainder > 0) {
      left.push({ commodityId: entry.commodityId, units: remainder });
      leftKg += remainder * unitKg;
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
  if (!commodity || !tradedHere(zoneId, commodity.id)) return 0;
  return price(commodity.baseGold * shareOf(zoneId, commodity.id, "buy") * stockFactor(stockOf(memory, commodity.id)));
}

/** What the yard pays for one unit right now (S119), moved by her own stock. */
export function sellPriceNow(commodityId, zoneId, memory) {
  const commodity = commodityById(commodityId);
  if (!commodity || !tradedHere(zoneId, commodity.id)) return 0;
  return price(commodity.baseGold * shareOf(zoneId, commodity.id, "sell") * stockFactor(stockOf(memory, commodity.id)));
}

/**
 * One yard's whole board at her current stock (S119), which is what the market screen
 * paints. `before` is the base price for the zone, so the screen can show the drift.
 */
export function marketBoardNow(zoneId, memory) {
  return COMMODITIES.filter((commodity) => tradedHere(zoneId, commodity.id)).map((commodity) => ({
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
 * Where a yard stands on one good, compared with every other yard that trades it (S135):
 * `cheaper` when she asks the least for it, `dearer` when she asks the most, `even`
 * otherwise. A good only one yard trades has nothing to compare against, so it is `even`.
 *
 * The comparison uses the live board of each yard, so a drained market moves the colours
 * with it: the answer is always "against the rest of my markets right now", never against
 * a stored table.
 */
export function priceStanding(commodityId, yardId, memories) {
  const commodity = commodityById(commodityId);
  if (!commodity || !shipyardById(yardId)) return "even";
  const prices = [];
  for (const yard of SHIPYARDS) {
    if (!tradedHere(yard.id, commodity.id)) continue;
    prices.push({ id: yard.id, price: buyPriceNow(commodity.id, yard.id, memories?.[yard.id] ?? {}) });
  }
  const mine = prices.find((entry) => entry.id === yardId);
  if (!mine) return "even";
  const lowest = Math.min(...prices.map((entry) => entry.price));
  const highest = Math.max(...prices.map((entry) => entry.price));
  if (lowest === highest) return "even";
  if (mine.price === lowest) return "cheaper";
  if (mine.price === highest) return "dearer";
  return "even";
}

/**
 * Where a yard stands on one good as a place to SELL it (S136), compared with every other
 * yard that trades it: `best` when she pays the most, `worst` when she pays the least,
 * `even` otherwise.
 *
 * This is deliberately not `priceStanding`: buying wants the lowest ask and selling wants
 * the highest bid, and a yard can be both the cheapest to buy from and the worst to sell
 * to. One colour cannot answer two questions.
 */
export function sellStanding(commodityId, yardId, memories) {
  const commodity = commodityById(commodityId);
  if (!commodity || !shipyardById(yardId)) return "even";
  const prices = [];
  for (const yard of SHIPYARDS) {
    if (!tradedHere(yard.id, commodity.id)) continue;
    prices.push({ id: yard.id, price: sellPriceNow(commodity.id, yard.id, memories?.[yard.id] ?? {}) });
  }
  const mine = prices.find((entry) => entry.id === yardId);
  if (!mine) return "even";
  const lowest = Math.min(...prices.map((entry) => entry.price));
  const highest = Math.max(...prices.map((entry) => entry.price));
  if (lowest === highest) return "even";
  if (mine.price === highest) return "best";
  if (mine.price === lowest) return "worst";
  return "even";
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
