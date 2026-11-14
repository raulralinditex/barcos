import test from "node:test";
import assert from "node:assert/strict";

import { TRAIL, createTrail, stepTrail, trailSpan, trailWidthPx } from "../src/model/damage-trail.js";

/* S52 — the part of a bar that was just lost stays in view for a moment. */

const near = (a, b) => Math.abs(a - b) < 1e-9;
const run = (state, share, seconds, step = 0.05) => {
  let s = state;
  for (let t = 0; t < seconds - 1e-9; t += step) s = stepTrail(s, share, step);
  return s;
};

test("S52: a fresh bar has no lost tramo", () => {
  const span = trailSpan(createTrail(1));
  assert.ok(near(span.from, 1) && near(span.to, 1));
  assert.equal(trailWidthPx(createTrail(1), 100), 0);
});

test("S52: a hit leaves the lost tramo behind the new fill", () => {
  const hit = stepTrail(createTrail(1), 0.7, 0);
  const span = trailSpan(hit);
  assert.ok(near(span.from, 0.7) && near(span.to, 1), `${span.from}..${span.to}`);
});

test("S52: the tramo stays whole during the hold, then shrinks to nothing", () => {
  let state = stepTrail(createTrail(1), 0.6, 0);
  state = run(state, 0.6, TRAIL.holdS - 0.1);
  assert.ok(near(trailSpan(state).to, 1), "still whole inside the hold");

  const mid = run(state, 0.6, 0.1 + TRAIL.drainS / 2);
  const to = trailSpan(mid).to;
  assert.ok(to > 0.6 && to < 1, `half way, got ${to}`);

  const done = run(state, 0.6, 0.1 + TRAIL.drainS + 0.1);
  assert.ok(near(trailSpan(done).to, 0.6), "gone after the hold and the drain");
});

test("S52: the tramo never goes below the fill", () => {
  let state = stepTrail(createTrail(1), 0.5, 0);
  for (let i = 0; i < 80; i += 1) {
    state = stepTrail(state, 0.5, 0.05);
    const span = trailSpan(state);
    assert.ok(span.to >= span.from - 1e-9 && span.from === 0.5);
  }
});

test("S52: a second hit while it drains extends it and restarts the hold", () => {
  let state = stepTrail(createTrail(1), 0.8, 0);
  state = run(state, 0.8, TRAIL.holdS + 0.4); // draining now
  const draining = trailSpan(state).to;
  assert.ok(draining < 1);

  state = stepTrail(state, 0.55, 0);
  const span = trailSpan(state);
  assert.ok(near(span.from, 0.55));
  assert.ok(span.to >= draining - 1e-9, "the top of the tramo does not fall back");
  const later = run(state, 0.55, TRAIL.holdS - 0.05);
  assert.ok(near(trailSpan(later).to, span.to), "the hold restarted");
});

test("S52: raising the bar (a repair) leaves no tramo", () => {
  let state = stepTrail(createTrail(0.4), 0.9, 0.05);
  const span = trailSpan(state);
  assert.ok(near(span.from, 0.9) && near(span.to, 0.9));
  assert.equal(trailWidthPx(state, 100), 0);
});

test("S52: an unchanged bar leaves no tramo, however long it runs", () => {
  const state = run(createTrail(0.7), 0.7, 5);
  assert.equal(trailWidthPx(state, 100), 0);
});

test("S52: a lost tramo is always drawn at least TRAIL.minPx wide", () => {
  const tiny = stepTrail(createTrail(1), 0.992, 0); // 0.8 % of a 100 px bar is under 1 px
  assert.equal(TRAIL.minPx, 3);
  assert.equal(trailWidthPx(tiny, 38), TRAIL.minPx);
  const big = stepTrail(createTrail(1), 0.5, 0);
  assert.ok(near(trailWidthPx(big, 100), 50), "a big loss keeps its real width");
});

test("S52: the tramo is gone from the screen once it has drained", () => {
  let state = stepTrail(createTrail(1), 0.9, 0);
  state = run(state, 0.9, TRAIL.holdS + TRAIL.drainS + 0.2);
  assert.equal(trailWidthPx(state, 108), 0);
});

test("S52: a bar that drops to empty keeps its tramo", () => {
  const dead = stepTrail(createTrail(0.3), 0, 0);
  const span = trailSpan(dead);
  assert.ok(near(span.from, 0) && near(span.to, 0.3));
  assert.ok(trailWidthPx(dead, 38) >= TRAIL.minPx);
});

test("S52: shares outside 0..1 and broken numbers never throw or escape the bar", () => {
  for (const share of [NaN, undefined, null, -5, 7, "x"]) {
    const state = stepTrail(createTrail(1), share, 0.1);
    const span = trailSpan(state);
    assert.ok(span.from >= 0 && span.to <= 1 && span.from <= span.to, `share ${String(share)}`);
  }
  for (const dt of [NaN, undefined, -1, Infinity]) {
    const state = stepTrail(stepTrail(createTrail(1), 0.5, 0), 0.5, dt);
    const span = trailSpan(state);
    assert.ok(Number.isFinite(span.from) && Number.isFinite(span.to), `dt ${String(dt)}`);
  }
  assert.ok(Number.isFinite(trailWidthPx(createTrail(1), NaN)));
});
