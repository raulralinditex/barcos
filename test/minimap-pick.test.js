/**
 * S164: the minimap picks a captain.
 *
 * The player asked for it (verbatim): "al poder tener varias capitanas tendremos que poder ir
 * donde estan, para eso necesitamos que en el panel del mapa, si clicamos sobre el vayamos a
 * donde hemos clicado", and chose what the click does: "Elegir la capitana que está ahí".
 *
 * The chart draws the whole sea (WORLD.radiusM) into a 170 px canvas, so a click on the map
 * covers far more water than a click on the screen: the reach has to come from the chart's
 * own scale, not from the sea's 90 m captain pick. These tests pin the rule in world metres.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { WORLD, createWorld, squadronOnChart } from "../src/model/world.js";

/** The reach a click on the chart has, in world metres, for the chart the sea draws. */
const REACH_M = 600;

const twoCaptains = () => {
  const captain = { id: "a", name: "A", hullId: "galeon-pequeno", speedKn: 8, loadFraction: 0.1, crew: { marino: 20 } };
  return createWorld(
    11,
    captain,
    0,
    {
      captainId: "a",
      ships: [
        { ...captain, commandId: "a", yardId: null },
        { ...captain, id: "b", name: "B", commandId: "b", yardId: null },
      ],
    },
  );
};

test("S164-A: a click on a captain on the chart names her", () => {
  const world = twoCaptains();
  const other = world.squadrons[0];
  assert.ok(other, "the sea must hold a second command for this test to mean anything");
  const picked = squadronOnChart(world, { x: other.ship.x + 40, y: other.ship.y + 40 }, REACH_M);
  assert.equal(picked?.id, other.id, "a click near a captain on the chart must name her");
});

test("S164-D: a click on empty water names nobody", () => {
  const world = twoCaptains();
  // Far from every command: the chart is 5200 m across, so 4000 m out is empty water.
  assert.equal(squadronOnChart(world, { x: 4000, y: 4000 }, REACH_M), null);
});

test("S164-C: the reach is in world metres, so a chart click covers more sea than a screen click", () => {
  const world = twoCaptains();
  const other = world.squadrons[0];
  // Just inside the chart reach, far outside the sea's 90 m pick.
  const justInside = { x: other.ship.x + REACH_M - 20, y: other.ship.y };
  assert.ok(
    squadronOnChart(world, justInside, REACH_M),
    "a click within the chart's reach must still name the captain",
  );
  assert.equal(
    squadronOnChart(world, justInside, 90),
    null,
    "the same point must be out of reach for the sea's own 90 m pick",
  );
});

test("S164-C: the nearer captain wins when two are within the chart's reach", () => {
  const world = twoCaptains();
  const other = world.squadrons[0];
  const active = world.ship;
  // A point much nearer the second command than the one under the helm.
  const nearOther = { x: other.ship.x + 30, y: other.ship.y + 30 };
  const picked = squadronOnChart(world, nearOther, Number.MAX_SAFE_INTEGER);
  const dOther = Math.hypot(other.ship.x - nearOther.x, other.ship.y - nearOther.y);
  const dActive = Math.hypot(active.x - nearOther.x, active.y - nearOther.y);
  assert.ok(dOther < dActive, "the test point must be nearer the second command, or it proves nothing");
  assert.equal(picked?.id, other.id, "the nearest captain on the chart must win");
});

test("S164-D: a broken point or reach names nobody, and does not throw", () => {
  const world = twoCaptains();
  assert.equal(squadronOnChart(world, null, REACH_M), null);
  assert.equal(squadronOnChart(world, { x: NaN, y: 0 }, REACH_M), null);
  assert.equal(squadronOnChart(world, { x: 0, y: 0 }, 0), null);
  assert.equal(squadronOnChart(world, { x: 0, y: 0 }, NaN), null);
  assert.equal(squadronOnChart(null, { x: 0, y: 0 }, REACH_M), null);
});
