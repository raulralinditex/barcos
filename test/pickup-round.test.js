/**
 * S181: a pick-up round ends on the buoys it named, not on the sea's supply.
 *
 * The player reported it (verbatim, S158): "cuando le das a la tecla G recogida de doblones,
 * entra en un ciclo, seleccion de destello, ir a destello recoger doblones, y empieza otra
 * vez". The sea tops its treasures back up to the zone's quota on every tick, so a round that
 * counted the buoys *in the water* could never run out: the count went down by one and the
 * sea put one back.
 *
 * Measured: a sea holding three buoys of 60 doblones each, with the order running, paid 258
 * doblones — four buoys and a fraction — and the "round finished" banner never appeared at
 * all. The order chased the replacement buoys the sea had just seeded.
 *
 * The rule: a round names its buoys when it starts, and it ends when those are gone. What the
 * sea seeds afterwards is a different round, started by the player when she asks for one.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { pickUpOrder, orderProgress, ORDER } from "../src/model/orders.js";

const buoy = (id, x, y) => ({ id, type: "treasure", x, y, gold: 60, zoneId: "costera" });
const ship = { x: 0, y: 0 };

test("S181: a round names the buoys it set out for, and carries their ids", () => {
  const order = pickUpOrder(ship, [buoy(901, 320, 90), buoy(902, 200, 260), buoy(903, 150, -120)]);
  assert.equal(order.kind, ORDER.pickUp);
  assert.equal(order.remaining, 3);
  // The ids are the round. Counting the water instead is what made it endless.
  assert.deepEqual([...(order.ids ?? [])].sort(), [901, 902, 903]);
});

test("S181: collecting the named buoys ends the round, even while the sea seeds more", () => {
  let encounters = [buoy(901, 320, 90), buoy(902, 200, 260), buoy(903, 150, -120)];
  let order = pickUpOrder(ship, encounters);
  const collected = [];

  // Collect each named buoy in turn. After every one, the sea tops its quota back up with a
  // fresh buoy — exactly what happens in the game, and what made the old round endless.
  for (let i = 0; i < 6 && order; i += 1) {
    const targetId = order.targetId;
    collected.push(targetId);
    encounters = encounters.filter((entry) => entry.id !== targetId);
    encounters.push(buoy(910 + i, 900 + i * 10, 900));
    order = orderProgress(ship, order, encounters);
  }

  assert.equal(order, null, "the round must end once its three buoys are collected");
  // Only the three named buoys were collected: the replacements were not chased. The order
  // they come in is the order's business (it picks the nearest), so the claim is the set.
  assert.equal(collected.length, 3, `the round collected ${collected.length} buoys: ${collected}`);
  assert.deepEqual([...collected].sort(), [901, 902, 903]);
  // And not one of the ids the sea seeded afterwards.
  assert.ok(collected.every((id) => id < 910), `the round chased a replacement: ${collected}`);
});

test("S181: a buoy that drifts away still counts against the round", () => {
  // A named buoy that is no longer in the water is gone for this round: collected or drifted
  // out, the round owes one less either way.
  let encounters = [buoy(901, 320, 90), buoy(902, 200, 260)];
  let order = pickUpOrder(ship, encounters);
  // The one being chased disappears (collected), and the other drifted out of the sea.
  encounters = [];
  order = orderProgress(ship, order, encounters);
  assert.equal(order, null, "both named buoys are gone, so the round is over");
});

test("S181: a new round after the first one names the buoys the sea has now", () => {
  // The player asks again: that is a new round, with the buoys currently in the water.
  const seeded = [buoy(910, 900, 900), buoy(911, 800, 800)];
  const order = pickUpOrder(ship, seeded);
  assert.equal(order.remaining, 2);
  assert.deepEqual([...(order.ids ?? [])].sort(), [910, 911]);
});

test("S181: a sea with no treasure starts no round", () => {
  assert.equal(pickUpOrder(ship, []), null);
  assert.equal(pickUpOrder(ship, [buoy(1, 10, 10)].filter((e) => e.type !== "treasure")), null);
});
