/**
 * The tramo of a bar that was just lost (S52).
 *
 * A condition bar shows what a ship has left. When it drops, the part it lost stays in
 * view behind the new fill, whole for a moment and then draining away, so that a hit is
 * seen even when the bar is short or the hit is small. Pure and UI-free: the sea screen
 * keeps one small state per bar, steps it with the world clock and draws its span.
 */

export const TRAIL = {
  /** Seconds the lost tramo stays whole after a hit. */
  holdS: 0.5,
  /** Seconds it then takes to drain away. */
  drainS: 1.2,
  /** The narrowest a lost tramo is drawn, in screen pixels, however small the loss. */
  minPx: 3,
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** A bar's share, read safely: anything that is not a finite number counts as full. */
function readShare(value) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp01(number) : 1;
}

/** How much of the lost tramo is still shown, 1 whole to 0 gone, `age` seconds after the hit. */
function fade(age) {
  if (age <= TRAIL.holdS) return 1;
  return Math.max(0, 1 - (age - TRAIL.holdS) / TRAIL.drainS);
}

/** The state of a bar that has lost nothing: its fill is `share`. */
export function createTrail(share = 1) {
  const fill = readShare(share);
  return { last: fill, top: fill, age: Infinity };
}

/**
 * Where the lost tramo stands now: `from` is the fill, `to` the top of what was lost.
 * `to` equals `from` when there is nothing to show.
 */
export function trailSpan(state) {
  const from = readShare(state?.last);
  const top = readShare(state?.top);
  if (top <= from) return { from, to: from };
  const age = Number.isFinite(state?.age) ? state.age : Infinity;
  return { from, to: from + (top - from) * fade(age) };
}

/**
 * Advance one bar by `dt` seconds of world time, now filled to `share`. A drop starts
 * (or extends) the tramo and restarts its hold; a rise or no change leaves none.
 */
export function stepTrail(state, share, dt = 0) {
  const fill = readShare(share);
  const step = Number.isFinite(Number(dt)) && Number(dt) > 0 ? Math.min(Number(dt), 60) : 0;
  const previous = state ?? createTrail(fill);
  const last = readShare(previous.last);

  if (fill < last - 1e-9) {
    // A hit: the tramo's top is the highest of what it still showed and what the bar was.
    const stillShown = trailSpan(previous).to;
    return { last: fill, top: Math.max(stillShown, last), age: step };
  }
  if (fill > last + 1e-9) return { last: fill, top: fill, age: Infinity };

  const age = Number.isFinite(previous.age) ? previous.age + step : Infinity;
  return { last: fill, top: readShare(previous.top), age };
}

/**
 * The width, in screen pixels, of the tramo on a bar `barWidthPx` wide: its real width,
 * but never under `TRAIL.minPx` while there is anything lost to show, and 0 otherwise.
 */
export function trailWidthPx(state, barWidthPx) {
  const { from, to } = trailSpan(state);
  if (to - from <= 1e-6) return 0;
  const width = Number(barWidthPx);
  const real = Number.isFinite(width) && width > 0 ? (to - from) * width : 0;
  return Math.max(TRAIL.minPx, real);
}
