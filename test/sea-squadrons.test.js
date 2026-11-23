import test from "node:test";
import assert from "node:assert/strict";
import {
  afloatSquadrons,
  createWorld,
  deserializeWorld,
  nearestSquadron,
  serializeWorld,
  updateWorld,
  withActiveSquadron,
} from "../src/model/world.js";
import { seaSquadrons } from "../src/model/fleet.js";

/**
 * S155-C/D/E: several squadrons afloat at the same time.
 *
 * The player asked to see every captain at sea, pick one with the mouse and give her the
 * orders (verbatim): "las podremos ver en el mar, con el raton podremos seleccionar una y
 * moverla". So the sea stops being one captain and becomes a list, and the chosen one is
 * the squadron the helm, the keys and the HUD talk to.
 *
 * The list is `world.squadrons`, and the active squadron is the one already stored in
 * `world.ship`/`world.escorts`: switching is a swap, so a hull is never held twice and a
 * save written before this rule opens with exactly the sea it always had.
 */

const hull = (id, extra = {}) => ({
  id,
  name: id,
  hullId: "galeon-pequeno",
  speedKn: 8,
  capacityKg: 112500,
  days: 45,
  condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
  crewAlive: { marino: 34 },
  yardId: null,
  ...extra,
});

/** A fleet with two captains afloat, each with one hull under her command. */
const twoCaptainsAtSea = () => ({
  captainId: "a",
  ships: [
    hull("a", { commandId: "a" }),
    hull("a-escort", { commandId: "a" }),
    hull("b", { commandId: "b" }),
    hull("b-escort", { commandId: "b" }),
  ],
});

test("S155-C: the fleet names every squadron that is afloat, and only those", () => {
  const fleet = {
    captainId: "a",
    ships: [
      hull("a", { commandId: "a" }),
      hull("a-escort", { commandId: "a" }),
      hull("b", { commandId: "b" }),
      hull("moored", { commandId: "b", yardId: "puerto-casa" }),
    ],
  };

  const afloat = seaSquadrons(fleet);

  assert.deepEqual(afloat.map((squadron) => squadron.captain.id), ["a", "b"]);
  assert.deepEqual(afloat[0].ships.map((ship) => ship.id), ["a", "a-escort"]);
  // A hull moored at a yard does not sail with her captain.
  assert.deepEqual(afloat[1].ships.map((ship) => ship.id), ["b"]);
});

test("S155-C: a world opens with every squadron afloat, the fleet captain in command", () => {
  const world = createWorld(11, { speedKn: 8 }, 0, twoCaptainsAtSea());

  const afloat = afloatSquadrons(world);
  assert.deepEqual(afloat.map((squadron) => squadron.id), ["a", "b"]);
  assert.equal(world.activeId, "a", "the fleet's captain is the one the sea opens on");
  // The active squadron keeps the shape the rest of the game already reads.
  assert.equal(world.ship.speedKn, 8);
  assert.deepEqual(world.escorts.map((escort) => escort.id), ["a-escort"]);
  // Every squadron carries her own captain hull and her own escorts.
  const other = afloat.find((squadron) => squadron.id === "b");
  assert.deepEqual(other.escorts.map((escort) => escort.id), ["b-escort"]);
  assert.ok(Number.isFinite(other.ship.x) && Number.isFinite(other.ship.y), "the other squadron is somewhere on the sea");
});

test("S155-D: choosing another squadron moves nothing and changes no condition", () => {
  let world = createWorld(11, { speedKn: 8 }, 0, twoCaptainsAtSea());
  world = updateWorld(world, { throttle: 1 }, 0.1);
  const before = afloatSquadrons(world);
  const other = before.find((squadron) => squadron.id === "b");

  const switched = withActiveSquadron(world, "b");

  assert.equal(switched.activeId, "b");
  // The hull that took the orders is now the one the sea talks to, exactly where she was.
  assert.deepEqual({ x: switched.ship.x, y: switched.ship.y }, { x: other.ship.x, y: other.ship.y });
  assert.deepEqual(switched.escorts.map((escort) => escort.id), ["b-escort"]);
  // And the squadron that lost the helm is still afloat, untouched, with her own orders.
  const after = afloatSquadrons(switched);
  const handedOver = after.find((squadron) => squadron.id === "a");
  const wasActive = before.find((squadron) => squadron.id === "a");
  assert.deepEqual(
    { x: handedOver.ship.x, y: handedOver.ship.y, heading: handedOver.ship.heading },
    { x: wasActive.ship.x, y: wasActive.ship.y, heading: wasActive.ship.heading },
  );
  assert.equal(handedOver.throttle, wasActive.throttle, "the squadron keeps the sail she had");
  // A hull is never held twice: switching is a swap, not a copy.
  assert.equal(after.length, 2);
});

test("S155-D: an unknown squadron id changes nothing", () => {
  const world = createWorld(11, { speedKn: 8 }, 0, twoCaptainsAtSea());
  for (const id of ["nope", "", null, undefined, 42]) {
    const same = withActiveSquadron(world, id);
    assert.equal(same.activeId, world.activeId);
    assert.deepEqual(same.ship, world.ship);
  }
});

test("S155-C: every squadron sails on her own orders, not on the active one's", () => {
  let world = createWorld(11, { speedKn: 8 }, 0, twoCaptainsAtSea());
  // The active squadron is given full sail; the other one was left hove to.
  for (let i = 0; i < 40; i += 1) world = updateWorld(world, { throttle: 1 }, 0.1);

  const afloat = afloatSquadrons(world);
  const active = afloat.find((squadron) => squadron.id === "a");
  const other = afloat.find((squadron) => squadron.id === "b");

  assert.ok(active.ship.currentSpeedKn > 1, "the squadron under orders made way");
  assert.ok(other.ship.currentSpeedKn < 0.5, "the squadron left hove to did not sail on her own");
});

test("S155-E: the nearest captain is the one a click selects", () => {
  const world = createWorld(11, { speedKn: 8 }, 0, twoCaptainsAtSea());
  const afloat = afloatSquadrons(world);
  const a = afloat.find((squadron) => squadron.id === "a");
  const b = afloat.find((squadron) => squadron.id === "b");

  assert.equal(nearestSquadron(world, { x: a.ship.x + 10, y: a.ship.y })?.id, "a");
  assert.equal(nearestSquadron(world, { x: b.ship.x + 10, y: b.ship.y })?.id, "b");
  // Empty water selects nobody, however close it is to a captain.
  assert.equal(nearestSquadron(world, { x: 0, y: 0 }, 20), null);
  // A click on a hull that is not a captain selects nobody: the mouse picks captains.
  assert.equal(nearestSquadron(world, { x: b.escorts[0].x, y: b.escorts[0].y }, 20), null);
});

test("S155-C: the squadrons and their orders survive the autosave", () => {
  let world = createWorld(11, { speedKn: 8 }, 0, twoCaptainsAtSea());
  world = withActiveSquadron(world, "b");
  for (let i = 0; i < 10; i += 1) world = updateWorld(world, { throttle: 1 }, 0.1);

  const back = deserializeWorld(serializeWorld(world));

  assert.equal(back.activeId, "b");
  const afloat = afloatSquadrons(back);
  // The active squadron always comes first, so the sea draws and steers it the same way
  // before and after a reload.
  assert.deepEqual(afloat.map((squadron) => squadron.id), ["b", "a"]);
  const a = afloat.find((squadron) => squadron.id === "a");
  const original = afloatSquadrons(world).find((squadron) => squadron.id === "a");
  assert.ok(Math.abs(a.ship.x - original.ship.x) < 1e-6);
});

test("S155: a save written before squadrons existed opens with the one it had", () => {
  const world = createWorld(11, { speedKn: 8 }, 0, twoCaptainsAtSea());
  const old = JSON.parse(serializeWorld(world));
  delete old.squadrons;
  delete old.activeId;

  const back = deserializeWorld(JSON.stringify(old));

  // The squadron in `ship`/`escorts` is the whole sea, which is what that save was. Her id
  // is not in the record, so the sea screen binds it to the captain she boots with.
  assert.equal(back.squadrons.length, 0);
  assert.equal(afloatSquadrons(back).length, 1);
  assert.deepEqual(back.escorts.map((escort) => escort.id), ["a-escort"]);

  const bound = { ...back, activeId: "a" };
  assert.deepEqual(afloatSquadrons(bound).map((squadron) => squadron.id), ["a"]);
});

test("S155-C: a broken squadron list is ignored instead of throwing", () => {
  const world = createWorld(11, { speedKn: 8 }, 0, twoCaptainsAtSea());
  for (const broken of [null, "two", 42, [null, {}, { id: 3 }, { id: "b" }]]) {
    const patched = { ...world, squadrons: broken };
    assert.doesNotThrow(() => updateWorld(patched, { throttle: 1 }, 0.1));
    const afloat = afloatSquadrons(patched);
    assert.equal(afloat.filter((squadron) => squadron.id === "a").length, 1, "the active squadron is always there");
  }
});
