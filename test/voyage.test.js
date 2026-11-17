/**
 * S133-D: the automatic voyage between two shipyards.
 *
 * Player's decisions (verbatim): "1-> solo mirar astillero, pero nos sale un boton
 * 3-> iniciar viaje automatico con los gastos normales".
 *
 * The voyage is a pure model: the straight line between the two yards (the shortest
 * honest route), the game days it takes at the captain's speed on the world's arcade
 * scale, the supply days and the gold of wages for those days. Applying it moves the
 * captain — and only her — and spends exactly what the quote said.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { GAME_TIME } from "../src/model/game-time.js";
import { KN_TO_MS, WORLD } from "../src/model/world.js";
import { arriveAt, voyageQuote } from "../src/model/voyage.js";

const home = "puerto-casa";
const anchorage = "ensenada-abierta";
const abyss = "cala-del-abismo";

/** The days a voyage takes, computed independently of the model under test. */
function expectedDays(distanceM, speedKn) {
  GAME_TIME.gameSecondsPerDay = 100;
  const seconds = distanceM / (speedKn * KN_TO_MS * WORLD.arcadeScale);
  return Math.max(1, Math.ceil(seconds / GAME_TIME.gameSecondsPerDay));
}

const captain = (overrides = {}) => ({
  id: "captain",
  name: "Capitana",
  hullId: "galeon-pequeno",
  hullName: "Galeón pequeño",
  speedKn: 6,
  upkeep: 120,
  days: 45,
  yardId: home,
  ...overrides,
});

const spare = () => captain({ id: "spare", name: "Queda", speedKn: 5, yardId: home });

const quoteFor = (to, overrides = {}) =>
  voyageQuote(home, to, {
    speedKn: 6,
    supplyDays: 45,
    gold: 50000,
    upkeep: 120,
    ...overrides,
  });

/* ---------------------------------------------------------------- S133-D: the quote */

test("S133-D: the distance is the straight line between the two yards", () => {
  assert.equal(quoteFor(abyss).distanceM, 4600);
  assert.equal(quoteFor(anchorage).distanceM, 2400);
});

test("S133-D: the days are the captain's speed on the world's arcade scale", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  const quote = quoteFor(abyss);
  assert.equal(quote.days, expectedDays(4600, 6));
  assert.ok(quote.days > 0, "a voyage to another yard always costs at least one day");
  // A faster captain arrives sooner; the day is never zero for a real distance.
  assert.ok(quoteFor(abyss, { speedKn: 12 }).days < quote.days);
});

test("S133-D: supply and gold are what those days cost", () => {
  const quote = quoteFor(abyss);
  assert.equal(quote.supplyDays, quote.days);
  assert.equal(quote.gold, quote.days * 120);
  // No crew upkeep, no wages: the voyage costs only the days it spends.
  assert.equal(quoteFor(abyss, { upkeep: 0 }).gold, 0);
});

test("S133-D: a voyage is refused when the supply is short, and says by how much", () => {
  const days = quoteFor(abyss).days;
  const short = quoteFor(abyss, { supplyDays: days - 1 });
  assert.equal(short.canMake, false);
  assert.equal(short.supplyShort, 1);
  assert.equal(short.goldShort, 0);
});

test("S133-D: a voyage is refused when the purse is short, and says by how much", () => {
  const gold = quoteFor(abyss).gold;
  const short = quoteFor(abyss, { gold: gold - 1 });
  assert.equal(short.canMake, false);
  assert.equal(short.goldShort, 1);
  assert.equal(short.supplyShort, 0);
});

test("S133-D: unknown yards or a hull that cannot sail have no voyage at all", () => {
  assert.equal(voyageQuote(home, "no-existe", { speedKn: 6, supplyDays: 45, gold: 50000, upkeep: 120 }), null);
  assert.equal(voyageQuote("no-existe", home, { speedKn: 6, supplyDays: 45, gold: 50000, upkeep: 120 }), null);
  assert.equal(quoteFor(abyss, { speedKn: 0 }).canMake, false);
});

test("S133-D: a voyage to the yard she is already in costs nothing", () => {
  const quote = quoteFor(home);
  assert.equal(quote.distanceM, 0);
  assert.equal(quote.days, 0);
  assert.equal(quote.supplyDays, 0);
  assert.equal(quote.gold, 0);
  assert.equal(quote.canMake, true);
});

/* ---------------------------------------------------------------- S133-D: applying it */

test("S133-D: arriving moves the captain and only her", () => {
  const fleet = { ships: [captain(), spare()], captainId: "captain" };
  const quote = quoteFor(abyss);
  const result = arriveAt(fleet, abyss, quote);
  assert.ok(result);
  assert.equal(result.fleet.ships.find((ship) => ship.id === "captain").yardId, abyss);
  assert.equal(result.fleet.ships.find((ship) => ship.id === "spare").yardId, home);
  assert.equal(result.fleet.captainId, "captain");
  // What the caller has to charge is exactly what the quote said.
  assert.equal(result.goldSpent, quote.gold);
  assert.equal(result.supplyDaysSpent, quote.supplyDays);
});

test("S133-D: a refused voyage changes nothing", () => {
  const fleet = { ships: [captain(), spare()], captainId: "captain" };
  const before = JSON.parse(JSON.stringify(fleet));
  const days = quoteFor(abyss).days;
  assert.equal(arriveAt(fleet, abyss, quoteFor(abyss, { supplyDays: days - 1 })), null);
  assert.equal(arriveAt(fleet, abyss, quoteFor(abyss, { gold: 0 })), null);
  assert.equal(arriveAt(fleet, "no-existe", quoteFor(abyss)), null);
  assert.deepEqual(fleet, before);
});

test("S133-D: a fleet without a captain cannot arrive anywhere", () => {
  assert.equal(arriveAt({ ships: [], captainId: null }, abyss, quoteFor(abyss)), null);
});
