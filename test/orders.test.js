import test from "node:test";
import assert from "node:assert/strict";
import {
  ORDER,
  bearingTo,
  clearOrder,
  destinationOrder,
  orderDone,
  orderProgress,
  pickUpOrder,
  steerTowards,
} from "../src/model/orders.js";

/**
 * S155-F/G: the two orders a squadron can be given besides the helm.
 *
 * The player asked for both (verbatim): "tambien podremos una vez seleccionada con el raton y
 * clicando 2 veces sobre un sitio moverla a ese sitio", y después: "tambien una vez
 * seleccionada una capitana tendremos una tecla para que se mueva automaticamente llendo
 * hacia las bolas amarillas a recoger los doblones".
 *
 * The rules live here, pure: a bearing to sail and a helm to hold, the arrival radius, and
 * which golden buoy is next. The sea screen only reads them and moves the hull.
 */

const ship = (x, y, extra = {}) => ({ x, y, heading: 0, currentSpeedKn: 0, speedKn: 8, ...extra });

test("S155-F: a destination order names the point it is sailing to", () => {
  const order = destinationOrder({ x: 1200, y: -300 }, { x: 0, y: 0 });

  assert.equal(order.kind, ORDER.destination);
  assert.deepEqual({ x: order.x, y: order.y }, { x: 1200, y: -300 });
  assert.equal(order.arrived, false);
});

test("S155-F: a destination that is not a point is no order at all", () => {
  for (const broken of [null, undefined, {}, { x: "a" }, { x: 1 }, { x: NaN, y: 2 }]) {
    assert.equal(destinationOrder(broken, { x: 0, y: 0 }), null);
  }
});

test("S155-F: the helm points at the mark and full sail is set", () => {
  // Due east of the hull: the bearing is 0, and no helm is needed to hold it.
  const east = steerTowards(ship(0, 0), destinationOrder({ x: 1000, y: 0 }, { x: 0, y: 0 }));
  assert.equal(east.turn, 0, "a hull already pointing at her mark holds a straight helm");
  assert.equal(east.throttle, 1, "a destination is sailed at full sail");

  // Due south on screen: the hull has to bear a full starboard helm.
  const south = steerTowards(ship(0, 0), destinationOrder({ x: 0, y: 1000 }, { x: 0, y: 0 }));
  assert.equal(south.turn, 1);

  // Due north: the other full helm.
  const north = steerTowards(ship(0, 0), destinationOrder({ x: 0, y: -1000 }, { x: 0, y: 0 }));
  assert.equal(north.turn, -1);
});

test("S155-F: the order ends when the hull arrives, and the helm goes back to the player", () => {
  const order = destinationOrder({ x: 500, y: 0 }, { x: 0, y: 0 });
  assert.equal(orderDone(ship(0, 0), order), false);
  assert.equal(orderDone(ship(490, 0), order), true, "the arrival radius counts from the mark");
  // A hull that drifts inside the radius of a mark she already reached is done too.
  assert.equal(orderDone(ship(500, 5), order), true);
  // An order that is not a destination is never "arrived".
  assert.equal(orderDone(ship(0, 0), null), false);
  assert.equal(orderDone(ship(0, 0), pickUpOrder({ x: 900, y: 900 })), false);
});

test("S155-F: the helm cancels the order, because taking the wheel ends it", () => {
  const order = destinationOrder({ x: 900, y: 0 }, { x: 0, y: 0 });
  assert.equal(clearOrder(order), null);
  // A steering input while an order is live cancels it: the player is sailing now.
  assert.equal(orderDone(ship(0, 0), order, { cancelled: true }), true);
});

test("S155-G: the pick-up order chases the nearest golden buoy", () => {
  const buoys = [
    { id: 1, type: "treasure", x: 400, y: 0 },
    { id: 2, type: "treasure", x: 120, y: 0 },
    { id: 3, type: "enemy", x: 10, y: 0 },
    { id: 4, type: "wreck", x: 30, y: 0 },
  ];

  const order = pickUpOrder({ x: 0, y: 0 }, buoys);
  assert.equal(order.kind, ORDER.pickUp);
  assert.equal(order.targetId, 2, "the nearest treasure, not the nearest thing on the sea");
  assert.deepEqual({ x: order.x, y: order.y }, { x: 120, y: 0 });
});

test("S155-G: a pick-up with nothing to pick up is no order", () => {
  assert.equal(pickUpOrder({ x: 0, y: 0 }, []), null);
  assert.equal(pickUpOrder({ x: 0, y: 0 }, null), null);
  assert.equal(pickUpOrder({ x: 0, y: 0 }, [{ id: 1, type: "enemy", x: 5, y: 5 }]), null);
});

test("S155-G: the pick-up order moves to the next buoy as the sea is cleared", () => {
  const buoys = [
    { id: 1, type: "treasure", x: 400, y: 0 },
    { id: 2, type: "treasure", x: 120, y: 0 },
  ];
  const first = pickUpOrder({ x: 0, y: 0 }, buoys);
  // The first one is taken: the order has to look again, or the captain would sit on the
  // spot where the buoy was.
  const next = orderProgress(ship(120, 0), first, buoys.filter((buoy) => buoy.id !== 2));
  assert.equal(next.targetId, 1);
  // With nothing left the order is over, and the helm goes back to the player.
  assert.equal(orderProgress(ship(400, 0), next, []), null);
});

test("S155-G: a pick-up in progress keeps her target while it is still there", () => {
  const buoys = [
    { id: 1, type: "treasure", x: 400, y: 0 },
    { id: 2, type: "treasure", x: 120, y: 0 },
  ];
  const order = pickUpOrder({ x: 0, y: 0 }, buoys);
  const still = orderProgress(ship(60, 0), order, buoys);
  assert.equal(still.targetId, 2, "the captain does not change her mind halfway there");
});

test("S155-F: the bearing is measured the way the sea measures a heading", () => {
  assert.equal(bearingTo({ x: 0, y: 0 }, { x: 100, y: 0 }), 0);
  assert.ok(Math.abs(bearingTo({ x: 0, y: 0 }, { x: 0, y: 100 }) - Math.PI / 2) < 1e-9);
});

test("S155: a broken order or a broken hull is a straight helm, never a crash", () => {
  for (const broken of [null, undefined, {}, { kind: "nope" }]) {
    assert.doesNotThrow(() => steerTowards(ship(0, 0), broken));
    assert.deepEqual(steerTowards(ship(0, 0), broken), { turn: 0, throttle: 0 });
  }
  for (const broken of [null, {}, { x: "a", y: "b" }]) {
    assert.doesNotThrow(() => steerTowards(broken, destinationOrder({ x: 10, y: 10 }, { x: 0, y: 0 })));
  }
});

/* ------------------------------------------------------------------ S158 */

test("S158: a pick-up does not chase a buoy the sea keeps re-seeding", () => {
  // The sea tops its treasures back up to the zone's quota on every tick (S150 kept that
  // rule), so "no golden buoy left" never becomes true and the order never ends. Measured
  // before the fix: 900 ticks of an order that had collected six buoys was still chasing
  // the seventh. The order is a round, not a life sentence: it ends when the buoys it set
  // out for are collected.
  const buoys = [
    { id: 1, type: "treasure", x: 200, y: 0 },
    { id: 2, type: "treasure", x: 0, y: 200 },
    { id: 3, type: "treasure", x: -200, y: 0 },
  ];
  const order = pickUpOrder({ x: 0, y: 0 }, buoys);

  assert.equal(order.kind, ORDER.pickUp);
  assert.equal(order.remaining, 3, "the order must remember how many buoys it set out for");

  // Collecting them one by one counts down.
  let current = orderProgress({ x: 200, y: 0 }, order, buoys.filter((b) => b.id !== 1));
  assert.equal(current.remaining, 2);
  current = orderProgress({ x: 0, y: 200 }, current, buoys.filter((b) => b.id > 2));
  assert.equal(current.remaining, 1);
  // The last one ends the order, even though the sea has already seeded fresh buoys.
  const reseeded = [{ id: 90, type: "treasure", x: 500, y: 500 }];
  assert.equal(orderProgress({ x: -200, y: 0 }, current, reseeded), null);
});

test("S158: a pick-up ends when the buoys it was chasing are all gone", () => {
  const buoys = [{ id: 7, type: "treasure", x: 120, y: 0 }];
  const order = pickUpOrder({ x: 0, y: 0 }, buoys);
  assert.equal(order.remaining, 1);
  // The buoy was collected and the sea has not seeded a replacement yet.
  assert.equal(orderProgress({ x: 120, y: 0 }, order, []), null);
});

test("S158: a pick-up still moves to a new buoy when the one it chased vanished uncollected", () => {
  const buoys = [
    { id: 1, type: "treasure", x: 400, y: 0 },
    { id: 2, type: "treasure", x: 120, y: 0 },
  ];
  const order = pickUpOrder({ x: 0, y: 0 }, buoys);
  assert.equal(order.remaining, 2);
  // The target is gone without being collected: the round owes one less, but it is not over,
  // so the captain looks again instead of sitting on the spot where the buoy was.
  const next = orderProgress({ x: 60, y: 0 }, order, buoys.filter((b) => b.id !== 2));
  assert.equal(next.targetId, 1);
  assert.equal(next.remaining, 1, "a vanished buoy is one the round can no longer collect");
});

test("S158: reaching a buoy does not end the round, it moves to the next one", () => {
  // The bug the player reported (verbatim): "cuando le das a la tecla G recogida de doblones,
  // entra en un ciclo, seleccion de destello, ir a destello recoger doblones, y empieza otra
  // vez". After the fix of the endless round it stopped after the FIRST buoy instead: the
  // arrival check was answering for a pick-up as if it were a destination, so the sea cleared
  // the order the moment the captain reached the buoy she was chasing.
  const buoys = [
    { id: 1, type: "treasure", x: 200, y: 0 },
    { id: 2, type: "treasure", x: 0, y: 200 },
  ];
  const order = pickUpOrder({ x: 0, y: 0 }, buoys);
  // She is right on top of the buoy she was chasing: a pick-up is not "arrived" and over.
  assert.equal(orderDone({ x: 200, y: 0 }, order), false, "a pick-up has no destination to arrive at");

  // The round continues to the next buoy.
  const next = orderProgress({ x: 200, y: 0 }, order, buoys.filter((buoy) => buoy.id !== 1));
  assert.equal(next.targetId, 2);
  assert.equal(next.remaining, 1);
});

test("S158: a destination is still over when the hull arrives", () => {
  // The rule S155-F keeps, so the fix above does not swallow it.
  const order = destinationOrder({ x: 500, y: 0 }, { x: 0, y: 0 });
  assert.equal(orderDone({ x: 500, y: 0 }, order), true);
  assert.equal(orderDone({ x: 0, y: 0 }, order), false);
});
