/**
 * Formation model: where the other hulls of the fleet sail (S36).
 *
 * The captain is `world.ship`. Every other hull that put to sea keeps a station
 * relative to her, and the whole formation rotates with her heading. An escort
 * steers and accelerates towards its station with its own speed, so a slower hull
 * really does fall behind instead of gliding along at the captain's pace.
 *
 * Pure and UI-free, like the rest of the model: same inputs, same positions.
 */

import { KN_TO_MS, WORLD } from "./world.js";
import { windEffect } from "./wind.js";
import { oarTurnFactor, speedUnderOars } from "./oars.js";

export const ESCORT = {
  /** How far astern of the captain the first station sits, in metres. */
  stationM: 120,
  /** How far off the centreline each column sits, in metres. */
  columnM: 95,
  /** Extra speed an escort may use to regain its station, as a factor of its own. */
  catchUpSpeed: 1.6,
  /** Beyond this distance an escort stops chasing the exact station and just closes in. */
  farM: 900,
  /** A station this close counts as held: no more jinking around it. */
  stationToleranceM: 18,
  /**
   * Extra speed an escort may add over the captain's, as a share of its own hull
   * speed, to close a gap. Bigger values snap back into formation harder.
   */
  closingShare: 0.6,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Shortest signed rotation from `from` to `to`, in (-PI, PI]. */
function angleDiff(to, from) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function normaliseAngle(angle) {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a < 0) a += twoPi;
  return a;
}

/**
 * The station of escort `index` in the captain's own frame: x is along her keel
 * (negative astern), y is across it (positive to starboard on screen).
 *
 * The first escort rides astern on the centreline, then they alternate beams and
 * fall back one column at a time, so a big fleet makes two trailing columns instead
 * of a wide wall that would foul the captain's broadsides.
 */
export function formationOffset(index) {
  const i = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  const rank = Math.floor((i + 1) / 2); // 0 for the first, then 1, 1, 2, 2...
  const side = i % 2 === 0 ? -1 : 1; // even indices to port, odd to starboard
  return {
    x: -(ESCORT.stationM + rank * ESCORT.stationM * 0.8),
    y: i === 0 ? 0 : side * (ESCORT.columnM + rank * 20),
  };
}

/** The station in world coordinates for a captain at `captain` with heading `heading`. */
export function escortStation(captain, index) {
  const base = {
    x: Number.isFinite(captain?.x) ? captain.x : 0,
    y: Number.isFinite(captain?.y) ? captain.y : 0,
    heading: Number.isFinite(captain?.heading) ? captain.heading : 0,
  };
  const offset = formationOffset(index);
  const cos = Math.cos(base.heading);
  const sin = Math.sin(base.heading);
  return {
    x: base.x + offset.x * cos - offset.y * sin,
    y: base.y + offset.x * sin + offset.y * cos,
  };
}

/** The stations a fleet of `count` escorts needs, in order. */
export function stationsFor(count) {
  const total = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return Array.from({ length: total }, (_, index) => formationOffset(index));
}

/**
 * A fresh escort, already on its station: a fleet that puts to sea is in formation
 * from the first frame, not strung out while it sorts itself out. `spec` carries the
 * hull facts the world needs (`id`, `speedKn`); anything missing falls back to a sane
 * default so a broken fleet entry still sails instead of throwing.
 */
export function createEscort(spec = {}, captain = {}, index = 0) {
  const speedKn = Number.isFinite(spec.speedKn) && spec.speedKn > 0 ? spec.speedKn : 5;
  const station = escortStation(captain, index);
  return {
    id: typeof spec.id === "string" ? spec.id : "escort",
    x: station.x,
    y: station.y,
    heading: Number.isFinite(captain.heading) ? captain.heading : 0,
    currentSpeedKn: 0,
    speedKn,
    // The hull's share of the base turn rate (S48); omitted when the caller has none.
    ...(Number.isFinite(spec.turnFactor) && spec.turnFactor > 0 ? { turnFactor: spec.turnFactor } : {}),
  };
}

/**
 * The escort a hull becomes when she joins the squadron mid-voyage (S139).
 *
 * The sea builds its escort list once, when the screen loads, so a prize captured at sea
 * used to be saved to the fleet and never drawn: she appeared only after sailing back to a
 * yard and reloading the sea. This returns the escort entry that puts her in the formation
 * right now, or null when she is already in the line or the data is not enough to place her.
 */
export function prizeJoiningSquadron(line, captain, prize, index = 0) {
  if (!Array.isArray(line) || !captain || typeof captain.x !== "number" || typeof captain.y !== "number") return null;
  if (!prize || typeof prize.id !== "string" || prize.id.length === 0) return null;
  if (line.some((escort) => escort?.id === prize.id)) return null;
  const escort = createEscort(
    { id: prize.id, speedKn: prize.speedKn, turnFactor: prize.turnFactor },
    captain,
    Number.isFinite(index) ? index : line.length,
  );
  return { ...escort, name: prize.name ?? prize.id };
}

/**
 * Advance one escort towards its station. It turns towards the bearing of the
 * station at the same rudder authority as the captain's ship, and accelerates
 * towards the speed that closes the gap, capped by its own hull speed (times the
 * catch-up factor when it has fallen behind).
 */
export function stepEscort(escort, station, input = {}, dt = 0) {
  const time = Number.isFinite(dt) && dt > 0 ? dt : 0;
  const ship = {
    x: Number.isFinite(escort?.x) ? escort.x : 0,
    y: Number.isFinite(escort?.y) ? escort.y : 0,
    heading: Number.isFinite(escort?.heading) ? escort.heading : 0,
    currentSpeedKn: Number.isFinite(escort?.currentSpeedKn) ? escort.currentSpeedKn : 0,
    speedKn: Number.isFinite(escort?.speedKn) && escort.speedKn > 0 ? escort.speedKn : 5,
  };
  const target = {
    x: Number.isFinite(station?.x) ? station.x : ship.x,
    y: Number.isFinite(station?.y) ? station.y : ship.y,
  };

  const dx = target.x - ship.x;
  const dy = target.y - ship.y;
  const distance = Math.hypot(dx, dy);

  // On station (S96): the escort stops *hunting* the point but keeps steering and keeps
  // matching the captain's speed. It used to coast to a stop and freeze its heading, which
  // is what made a hull pointed the wrong way sail out of the line and come back — the
  // weaving the player sees. The dead band lives in the speed target below, not here.
  const onStation = distance <= ESCORT.stationToleranceM;

  const bearing = Math.atan2(dy, dx);
  // Inside the tolerance the escort still points at its station, just gently: a hard
  // rudder there would make it pivot around a point it already holds.
  const turn = clamp(angleDiff(bearing, ship.heading) / Math.max(time, 1e-6), -1, 1) * (onStation ? 0.5 : 1);
  // Each escort turns at its own hull's rate (S48): a heavy one swings wide.
  const turnFactor = Number.isFinite(escort?.turnFactor) && escort.turnFactor > 0 ? escort.turnFactor : 1;
  // A crew at the oars sharpens her helm exactly as her captain's (S159-F).
  const oarTurn = oarTurnFactor(input.oars ?? null);
  const heading = normaliseAngle(ship.heading + turn * WORLD.maxTurnRate * turnFactor * oarTurn * time);

  // Station keeping is relative to the captain: an escort matches her speed and adds
  // a margin to close the gap, instead of aiming at a fraction of its own speed (which
  // would leave it forever trailing a faster flagship).
  const wind = input.wind ? windEffect(input.wind, heading).speedFactor : 1;
  // Her own oar speed is a reserve, not an addition (S159-A): the greater of the two, and
  // the catch-up margin is applied on top of whichever wins.
  const oarKn = Number(input.oars?.speedKn) > 0 ? Number(input.oars.speedKn) : 0;
  const hullKn = speedUnderOars(ship.speedKn * wind, oarKn);
  const ceiling = hullKn * ESCORT.catchUpSpeed;
  const captainSpeed = Number.isFinite(input.captainSpeedKn) ? input.captainSpeedKn : 0;
  // Dead band (S96). The target used to be `captain + closing`, and `closing` fell to
  // zero inside the tolerance — so the target dropped *below* the captain's speed and the
  // escort braked, fell astern, lunged, and braked again. Measured: a 1.05 kn saw on a
  // captain holding a steady 6.00 kn. Now the closing term is measured from the edge of
  // the tolerance and the escort never targets less than the captain's own speed.
  const gap = Math.max(0, distance - ESCORT.stationToleranceM);
  const closing = clamp(gap / ESCORT.stationM, 0, 1) * ship.speedKn * ESCORT.closingShare;
  const targetSpeed = Math.min(captainSpeed + closing, ceiling);
  const step = ship.speedKn * WORLD.accelerationRate * time;
  const currentSpeedKn =
    ship.currentSpeedKn < targetSpeed
      ? Math.min(targetSpeed, ship.currentSpeedKn + step)
      : Math.max(targetSpeed, ship.currentSpeedKn - step);

  const travelled = currentSpeedKn * KN_TO_MS * WORLD.arcadeScale * time;
  let x = ship.x + Math.cos(heading) * travelled;
  let y = ship.y + Math.sin(heading) * travelled;

  const radius = Math.hypot(x, y);
  if (radius > WORLD.radiusM) {
    const scale = WORLD.radiusM / radius;
    x *= scale;
    y *= scale;
  }

  return { ...escort, x, y, heading, currentSpeedKn };
}
