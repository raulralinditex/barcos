/**
 * Orders model: what a squadron does besides holding the helm (S155-F/G).
 *
 * The player asked for two things once a captain is selected (verbatim): "clicando 2 veces
 * sobre un sitio moverla a ese sitio", and "una tecla para que se mueva automaticamente
 * llendo hacia las bolas amarillas a recoger los doblones". Both are the same machinery: an
 * order names a point of the sea, and the squadron sails to it with her own speed, her own
 * inertia, her own turning circle and the wind of the day.
 *
 * Pure and UI-free: it says which helm to hold and how much sail to carry. The sea screen is
 * the only thing that moves a hull.
 */

import { WORLD } from "./world.js";

export const ORDER = {
  /** Sail to a point and stop being under orders on arrival. */
  destination: "destination",
  /** Chase the nearest golden buoy until the sea has none left. */
  pickUp: "pickUp",
};

/**
 * How close a hull has to be to count as arrived, in metres. The world already pays a
 * treasure within `WORLD.pickupRadiusM`, so a destination is the same radius: an order the
 * player gave on a buoy is collected by the same rule that pays it.
 */
export const ARRIVAL_RADIUS_M = WORLD.pickupRadiusM;

const isPoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);

/** The compass bearing from `from` to `to`, in the sea's convention (0 east, clockwise). */
export function bearingTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * An order to sail to a point. A point that is not a point is not an order: a double click
 * on nothing must leave the squadron exactly as she was.
 */
export function destinationOrder(point, from) {
  if (!isPoint(point)) return null;
  const origin = isPoint(from) ? from : { x: 0, y: 0 };
  return {
    kind: ORDER.destination,
    x: point.x,
    y: point.y,
    distanceM: Math.hypot(point.x - origin.x, point.y - origin.y),
    arrived: false,
  };
}

/**
 * An order to work the golden buoys, aimed at the nearest one. Only treasures count: an
 * enemy is not something to sail into, and a wreck is paid by sailing over it, which the
 * world already does for any hull of the squadron (S128).
 *
 * `remaining` is how many buoys this round set out for (S158). The sea tops its treasures
 * back up to the zone's quota on every tick, so "no golden buoy left" never comes true and
 * an order that waited for it became an endless loop of sail-collect-sail. The round ends
 * when the buoys it named are collected.
 */
export function pickUpOrder(from, encounters) {
  if (!isPoint(from) || !Array.isArray(encounters)) return null;
  let best = null;
  let bestDistance = Infinity;
  // S181: the round names the buoys it set out for. Counting how many are in the water made
  // the order endless, because the sea tops its quota back up on every tick: the count went
  // down by one and the sea put one back. The ids are the round; what the sea seeds later is
  // another round, started by the player.
  const ids = [];
  for (const encounter of encounters) {
    if (encounter?.type !== "treasure" || !isPoint(encounter)) continue;
    if (Number.isFinite(encounter.id)) ids.push(encounter.id);
    const distance = Math.hypot(encounter.x - from.x, encounter.y - from.y);
    if (distance < bestDistance) {
      best = encounter;
      bestDistance = distance;
    }
  }
  if (!best) return null;
  return {
    kind: ORDER.pickUp,
    targetId: best.id,
    x: best.x,
    y: best.y,
    distanceM: bestDistance,
    arrived: false,
    remaining: ids.length,
    ids,
  };
}

/**
 * The helm and the sail one tick of an order asks for.
 *
 * The turn is proportional to the angle left to close, normalised to the rudder's own range,
 * so a hull a few degrees off her course makes a small correction instead of swinging the
 * helm hard over. A destination is sailed at full sail; a pick-up too, because the point of
 * the order is to save the player the trip, not to cruise.
 *
 * An order that is not an order, or a hull with no position, yields a straight helm and no
 * sail: the caller keeps the wheel it already had instead of being handed a random one.
 */
export function steerTowards(ship, order) {
  if (!isPoint(ship) || !isPoint(order)) return { turn: 0, throttle: 0 };
  const heading = Number.isFinite(ship.heading) ? ship.heading : 0;
  const wanted = bearingTo(ship, order);
  let delta = (wanted - heading) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  // A full helm only for a quarter turn or more; inside that it is proportional.
  const turn = Math.max(-1, Math.min(1, delta / (Math.PI / 4)));
  return { turn, throttle: 1 };
}

/**
 * Whether the order is over. A destination ends when the hull is inside the arrival radius;
 * a pick-up ends when the round has no buoy left to chase, which `orderProgress` decides.
 *
 * A pick-up must never answer `true` here for reaching her buoy (S158): reaching it is the
 * point of the trip, not the end of it. The bug the player reported was exactly that, and it
 * left her stopped on the buoy she had just collected.
 *
 * `cancelled` is the player taking the wheel: steering by hand ends whatever order was live,
 * which is the rule the double click was announced with.
 */
export function orderDone(ship, order, { cancelled = false } = {}) {
  if (!order || typeof order !== "object") return false;
  if (cancelled) return true;
  if (order.kind !== ORDER.destination) return false;
  if (!isPoint(ship)) return false;
  return Math.hypot(ship.x - order.x, ship.y - order.y) <= ARRIVAL_RADIUS_M;
}

/**
 * The next tick of a pick-up order: keep the buoy being chased while she is still afloat,
 * move to the nearest one when she is gone, and end the round when the buoys it set out for
 * are all collected (S158).
 *
 * This is what makes the order a loop instead of one trip, without making it a life
 * sentence: the captain collects, the next buoy becomes the mark without the player touching
 * anything, and the round ends when her list is empty instead of when the sea stops seeding.
 */
export function orderProgress(ship, order, encounters) {
  if (!order || order.kind !== ORDER.pickUp) return order ?? null;
  const list = Array.isArray(encounters) ? encounters : [];
  const current = list.find(
    (encounter) => encounter?.type === "treasure" && encounter.id === order.targetId,
  );
  // S181: the round is the list of ids it named. A buoy is owed while it is still in the
  // water, whether or not it is the one being chased right now — the sea keeps seeding new
  // ones, and those are not this round's business.
  const named = Array.isArray(order.ids) ? order.ids : null;
  const stillAfloat = named
    ? named.filter((id) => list.some((entry) => entry?.type === "treasure" && entry.id === id))
    : null;
  const remaining = named
    ? stillAfloat.length
    : (Number.isFinite(order.remaining) ? Math.max(0, order.remaining) : null);
  if (current) return { ...order, x: current.x, y: current.y, remaining };
  // The buoy this tick was aimed at is gone: she was collected, or she drifted out of the
  // sea. S181: `remaining` is already the count of the round's named buoys still afloat, so
  // it needs no second subtraction here — doing it twice ended a three-buoy round after two
  // and left one named buoy uncollected.
  const left = remaining;
  if (left === 0) return null;
  // The next mark is the nearest buoy this round named, never one the sea seeded afterwards.
  const candidates = named
    ? list.filter((entry) => entry?.type === "treasure" && named.includes(entry.id) && isPoint(entry))
    : list;
  const next = pickUpOrder(ship, candidates);
  if (!next) return null;
  return {
    ...next,
    // A round keeps the ids it started with: picking the next mark must not re-name the round.
    ids: named ?? next.ids,
    remaining: named ? Math.min(left, next.remaining) : (left === null ? next.remaining : Math.min(left, next.remaining)),
  };
}

/** The wheel is the player's again: no order is live. */
export function clearOrder() {
  return null;
}

/**
 * The distance an order still has to sail, for the banner and the mark. Zero when there is
 * no order, so a caller can print it without a second check.
 */
export function orderDistance(ship, order) {
  if (!isPoint(ship) || !isPoint(order)) return 0;
  return Math.hypot(order.x - ship.x, order.y - ship.y);
}
