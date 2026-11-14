/**
 * Wind model: direction and strength that drift smoothly and deterministically.
 *
 * Why deterministic: the HUD promises the wind it will be 10 seconds from now (S18).
 * A prediction is only honest if the future is a pure function of (seed, time), so
 * `windAt(seed, t)` computes any moment of a voyage, past or future, without state.
 *
 * Shape of the curve: the wind is a smooth interpolation between control points
 * spaced `SEGMENT_S` apart. Both the angle (shortest way round) and the strength
 * are interpolated with a smoothstep, so the needle glides instead of snapping
 * (S16). Control points come from a hash of (seed, segment), so the same sea always
 * blows the same way.
 *
 * Angles follow the world convention: 0 points east, growing clockwise on screen.
 * `direction` is where the wind blows TOWARDS (the way the arrow points).
 */

export const WIND = {
  /** Seconds between control points. */
  segmentS: 12,
  /** Wind never dies completely and never becomes a hurricane. */
  minStrengthKn: 3,
  maxStrengthKn: 22,
  /** How far the second indicator looks ahead (S18). */
  forecastS: 10,
  /** Strongest bonus a following wind can give to speed (S17). */
  maxSpeedBonus: 0.6,
  /** Strongest penalty a head wind can give to speed (S17). */
  maxSpeedPenalty: 0.6,
  /** How hard the wind pushes the hull sideways, as a fraction of its speed (S17). */
  driftFactor: 0.35,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Shortest signed rotation from `from` to `to`, in (-PI, PI]. */
function angleDiff(to, from) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Smoothstep: 0 -> 0, 1 -> 1, with zero slope at both ends. */
const smoothstep = (t) => t * t * (3 - 2 * t);

/**
 * Deterministic hash of (seed, index) to [0, 1). Two different indices of the same
 * seed give unrelated values, which is what makes the wind wander.
 */
function hash01(seed, index) {
  let h = (seed >>> 0) ^ Math.imul(index | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Control point for one segment: a heading and a strength. */
function controlPoint(seed, index) {
  return {
    angle: hash01(seed, index * 2) * Math.PI * 2,
    strengthKn:
      WIND.minStrengthKn + hash01(seed, index * 2 + 1) * (WIND.maxStrengthKn - WIND.minStrengthKn),
  };
}

/**
 * The wind at `timeS` seconds into a voyage. Pure: same inputs, same wind.
 * Returns the angle it blows towards, its strength in knots, and a 0..1 factor
 * the UI can use to size the arrow.
 */
export function windAt(seed, timeS) {
  const t = Number.isFinite(timeS) ? timeS : 0;
  const position = t / WIND.segmentS;
  const index = Math.floor(position);
  const frac = smoothstep(position - index);

  const from = controlPoint(seed, index);
  const to = controlPoint(seed, index + 1);

  // Angles interpolate the short way round so the needle never spins 350 degrees.
  const direction = from.angle + angleDiff(to.angle, from.angle) * frac;
  const strengthKn = from.strengthKn + (to.strengthKn - from.strengthKn) * frac;

  return {
    direction: normalizeAngle(direction),
    strengthKn,
    /** 0 at the calmest wind, 1 at the strongest: what the arrow length shows. */
    strength: strengthFraction(strengthKn),
  };
}

/** Wind `forecastS` seconds ahead (S18). */
export function windForecast(seed, timeS) {
  return windAt(seed, timeS + WIND.forecastS);
}

/** The wind the ship feels right now, as a vector to push it. */
export function windVector(wind) {
  return {
    x: Math.cos(wind.direction) * wind.strengthKn,
    y: Math.sin(wind.direction) * wind.strengthKn,
  };
}

/**
 * How the wind treats a hull steering `heading` (S17).
 *
 * `alignment` is +1 with the wind dead astern (a following wind, the fastest
 * point of sail), 0 with the wind on the beam, and -1 with the wind dead ahead.
 * The speed factor scales between the penalty and the bonus; the drift factor
 * says how hard the hull is pushed sideways, which peaks on the beam.
 */
/**
 * Where `strengthKn` sits between the calmest and the strongest wind, as 0..1.
 *
 * A wind read from an older voyage can fall outside the current range, because the
 * settings screen may have moved it (S33). Deriving the fraction from the knots
 * instead of trusting the stored one keeps the effect honest and the division safe.
 */
export function strengthFraction(strengthKn) {
  const span = WIND.maxStrengthKn - WIND.minStrengthKn;
  if (!(span > 0)) return 0;
  return clamp((strengthKn - WIND.minStrengthKn) / span, 0, 1);
}

export function windEffect(wind, heading) {
  // Wind blows towards `direction`; a ship sailing the same way has it astern.
  const alignment = Math.cos(angleDiff(heading, wind.direction));
  const strength = strengthFraction(
    Number.isFinite(wind.strengthKn) ? wind.strengthKn : wind.strength,
  );

  const speedFactor =
    alignment >= 0
      ? 1 + WIND.maxSpeedBonus * strength * alignment
      : 1 + WIND.maxSpeedPenalty * strength * alignment;

  // Sideways push peaks when the wind is on the beam, and grows with strength.
  const beam = Math.abs(Math.sin(angleDiff(heading, wind.direction)));
  const driftFactor = WIND.driftFactor * strength * beam;

  return { alignment, speedFactor, driftFactor };
}

/** Normalise an angle into [0, 2PI). */
export function normalizeAngle(angle) {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a < 0) a += twoPi;
  return a;
}

/** Compass label for an angle, so the HUD can say "NE" instead of a number. */
export function compassPoint(angle) {
  const names = ["E", "SE", "S", "SO", "O", "NO", "N", "NE"];
  const normalized = normalizeAngle(angle);
  const index = Math.round(normalized / (Math.PI / 4)) % 8;
  return names[index];
}
