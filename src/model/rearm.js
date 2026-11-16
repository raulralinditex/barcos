/**
 * S121: rearming at the yard.
 *
 * The bug the player reported: "despues de librar varias batallas y teniendo todo
 * correctamente el barco a dejado de disparar".
 *
 * The cause was not in the fight. Every gun carries `shotsLeft`, firing spends one, and
 * a gun at zero is filtered out of `firingPieces` — it stops existing as a gun. Nothing
 * in the game ever put rounds back: not the yard, not the anchor, not a repair. After
 * enough battles a hull was a floating shell whose guns could not speak.
 *
 * So rearming is a service the yard sells, priced by the same ammunition formula the
 * builder already uses, and it is also where the player may load a heavier allowance
 * than the builder's default.
 */

import { ammoById, pieceById } from "../data/naval-data.js";
import { CONVENTIONS, PRICES } from "../data/naval-data.js";
import { normaliseGold } from "./economy.js";

/**
 * How many rounds one gun may carry (S121). The builder used to cap the box at 200 with
 * the number written twice in the UI; the player asked to carry more ammunition, so the
 * allowance is a declared, tunable value and every screen reads it from here.
 */
export const REARM = {
  /** The most rounds a single gun may carry, loadout or rearm (S121). */
  maxRoundsPerGun: 400,
  /** Rounds a gun gets when the player re-arms without asking for a number (S121). */
  defaultRoundsPerGun: 60,
};

/**
 * Whether a live gun sits on the same beam as a battery entry (S121). A save written
 * before this feature carries `side: "lado"` and the fleet sheet says `babor`, and a
 * rearm must not call that a different gun: the same beam under another name still owes
 * the rounds that were fired from it.
 */
function sameSide(live, declared) {
  return live === declared || live === undefined || declared === undefined || live === "lado";
}

/** Rounds one gun of a piece actually carries, clamped to the allowance (S121). */
export function roundsPerGun(pieceId, requested) {
  const piece = pieceById(pieceId);
  if (!piece) return 0;
  const wanted = Math.floor(Number(requested) || 0);
  if (wanted <= 0) return 0;
  return Math.min(wanted, REARM.maxRoundsPerGun);
}

/** What one round of a gun's ammunition costs, the builder's own formula (S121). */
function roundPrice(pieceId, ammoId) {
  const piece = pieceById(pieceId);
  if (!piece) return 0;
  const ammo = ammoById(ammoId ?? piece.ammo[0]);
  if (!ammo) return 0;
  return ammo.pricePerShotGold + piece.shotKg * CONVENTIONS.powderPerShotFraction * PRICES.powderGoldPerKg;
}

/**
 * The loadout a hull was built with, read back from her fleet entry (S121). This is what
 * the yard measures a rearm against: her bought allowance, not what is left in the racks.
 */
export function loadoutOf(ship) {
  return (ship?.batteries ?? []).map((battery) => ({
    pieceId: battery.pieceId,
    side: battery.side,
    ammoId: battery.ammoId,
    qty: Math.max(0, Math.floor(Number(battery.qty) || 0)),
    shotsPerPiece: roundsPerGun(battery.pieceId, battery.shotsPerPiece),
  }));
}

/**
 * How many rounds the hull is missing, and what putting them back costs (S121).
 *
 * `live` is the combat state, where each gun is an individual piece with its own
 * `shotsLeft`. A hull with no live combat (in port, never sailed) is measured against her
 * loadout alone and owes nothing: there is no rack to top up.
 *
 * A gun whose rack is full owes nothing, so rearming twice pays once. The price is per
 * round actually missing, so a half-spent battery costs half as much.
 */
export function rearmQuote(ship, live = null) {
  const loadout = loadoutOf(ship);
  const racks = live?.pieces ?? null;
  let missing = 0;
  let cost = 0;
  const lines = [];

  for (const battery of loadout) {
    // Each battery entry stands for `qty` guns of the same piece on the same side. The
    // live state has them as individual pieces, so they are counted in order.
    const guns = racks
      ? racks.filter((gun) => gun.pieceId === battery.pieceId && sameSide(gun.side, battery.side))
      : [];
    const allowance = battery.shotsPerPiece;
    const carried = guns.length > 0
      ? guns.slice(0, battery.qty).reduce((total, gun) => total + Math.max(0, Number(gun.shotsLeft) || 0), 0)
      : battery.qty * allowance;
    const owed = Math.max(0, battery.qty * allowance - carried);
    if (owed === 0) continue;
    const unit = roundPrice(battery.pieceId, battery.ammoId);
    const price = Math.ceil(owed * unit);
    missing += owed;
    cost += price;
    lines.push({ pieceId: battery.pieceId, side: battery.side, ammoId: battery.ammoId, rounds: owed, price });
  }

  return { rounds: missing, cost, lines, rearmable: missing > 0 };
}

/**
 * Put the missing rounds back (S121). Returns the fleet entry with her loadout topped up
 * and the live combat with full racks, or null when the player cannot pay or owes
 * nothing — a refused rearm changes neither the purse nor the ship.
 *
 * The loadout is what changes, because the fleet entry is what the next voyage is built
 * from (S23): topping up only the live racks would be undone the moment the sea is
 * rebuilt from the sheet.
 */
export function rearmShip(ship, live, gold, options = {}) {
  const purse = normaliseGold(gold);
  const quote = rearmQuote(ship, live);
  if (!quote.rearmable || quote.cost > purse) return null;

  const roundsFor = (battery) => {
    if (options.roundsPerGun !== undefined) return roundsPerGun(battery.pieceId, options.roundsPerGun);
    return roundsPerGun(battery.pieceId, battery.shotsPerPiece ?? REARM.defaultRoundsPerGun);
  };
  const batteries = (ship?.batteries ?? []).map((battery) => ({
    ...battery,
    shotsPerPiece: Math.max(roundsFor(battery), Number(battery.shotsPerPiece) || 0),
  }));

  const pieces = (live?.pieces ?? []).map((gun) => {
    const battery = batteries.find((entry) => entry.pieceId === gun.pieceId && sameSide(gun.side, entry.side));
    if (!battery) return gun;
    return { ...gun, shotsLeft: battery.shotsPerPiece };
  });

  return {
    quote,
    gold: purse - quote.cost,
    ship: { ...ship, batteries },
    live: live ? { ...live, pieces } : null,
  };
}

/**
 * Whether a hull is dry: she has guns and not one round between them (S121). The sea
 * screen uses it to say so out loud, because a silent ship reads as a broken ship.
 */
export function isOutOfAmmo(live) {
  const pieces = live?.pieces ?? [];
  if (pieces.length === 0) return false;
  return pieces.every((gun) => (Number(gun.shotsLeft) || 0) <= 0);
}
