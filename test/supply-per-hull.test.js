/**
 * S132: every hull at sea carries her own crew supply.
 *
 * The player's decision (verbatim): "Uno por nave (Recomendada)" — every hull that sails
 * burns her own reserve, and "cuando llegue a 0 se avisara que hay que volver al
 * astillero". Wages stay whole-fleet (verbatim): "Toda la flota paga (como hoy)".
 */
import test from "node:test";
import assert from "node:assert/strict";

import { GAME_TIME, supplySeconds } from "../src/model/game-time.js";
import { voyageClock } from "../src/model/voyage-clock.js";
import {
  buildReserves,
  burnReserves,
  dryHulls,
  squadronSupply,
  wagesFor,
} from "../src/model/supply.js";

const hulls = [
  { id: "capitana", days: 45 },
  { id: "escolta-1", days: 20 },
  { id: "escolta-2", days: 7 },
];

test("S-A: every hull seeds her own reserve from her own provision days", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  const reserves = buildReserves(hulls);
  assert.equal(reserves.capitana, supplySeconds(45));
  assert.equal(reserves["escolta-1"], supplySeconds(20));
  assert.equal(reserves["escolta-2"], supplySeconds(7));
  // A hull bought with no provisions carries none, not the captain's.
  assert.equal(buildReserves([...hulls, { id: "vacia", days: 0 }]).vacia, 0);
});

test("S-B: every hull burns only her own reserve, and a moored hull burns nothing", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  // The map holds only the hulls that sailed; a hull left in the yard is not in it.
  const step = burnReserves({ capitana: supplySeconds(45), "escolta-1": supplySeconds(20) }, 100);
  assert.equal(step.reserves.capitana, supplySeconds(44));
  assert.equal(step.reserves["escolta-1"], supplySeconds(19));
  assert.deepEqual(Object.keys(step.reserves).sort(), ["capitana", "escolta-1"]);
  // A step with no sea time, or no clock at all, burns nothing.
  const still = burnReserves(step.reserves, 0);
  assert.deepEqual(still.reserves, step.reserves);
  assert.deepEqual(still.dried, []);
  // A long step spends what is left and no more, per hull.
  const long = burnReserves({ capitana: supplySeconds(45), "escolta-1": 50 }, 10_000);
  assert.equal(long.reserves.capitana, 0);
  assert.equal(long.reserves["escolta-1"], 0);
});

test("S-C: a hull going dry is named once, and a hull already dry is never named", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  const first = burnReserves({ capitana: 50, "escolta-1": 0 }, 60);
  assert.deepEqual(first.dried, ["capitana"]);
  // The next step must not fire again for the same hull.
  assert.deepEqual(burnReserves(first.reserves, 60).dried, []);
  // A hull that was already dry at boot is dry, but has nothing to warn about.
  assert.deepEqual(dryHulls({ capitana: 0, "escolta-1": 20 }), ["capitana"]);
  assert.deepEqual(burnReserves({ capitana: 0, "escolta-1": 20 }, 10).dried, []);
  // A step that empties two hulls names both of them.
  assert.deepEqual(burnReserves({ capitana: 10, "escolta-1": 10 }, 100).dried.sort(), [
    "capitana",
    "escolta-1",
  ]);
});

test("S-D: the panel reads the worst hull of the squadron, the one the sea charges next", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  const squadron = squadronSupply(buildReserves(hulls));
  assert.equal(squadron.worstId, "escolta-2");
  assert.equal(squadron.worstSeconds, supplySeconds(7));
  assert.equal(squadron.dryCount, 0);
  assert.equal(squadron.hullCount, 3);
  // The number the panel shows is the same number the sea charges: same clock, same hull.
  assert.equal(voyageClock({ supplyLeftS: squadron.worstSeconds, upkeep: 10, gold: 100 }).daysLeft, 7);

  const withDry = squadronSupply({ capitana: supplySeconds(45), "escolta-1": 0 });
  assert.equal(withDry.worstId, "escolta-1");
  assert.equal(withDry.worstSeconds, 0);
  assert.equal(withDry.dryCount, 1);
  assert.equal(withDry.hullCount, 2);
  // No hull at sea is a broken report, not a crash.
  const empty = squadronSupply(null);
  assert.equal(empty.worstSeconds, 0);
  assert.equal(empty.hullCount, 0);
  assert.equal(empty.dryCount, 0);
});

test("S-E: the sea save keeps a per-hull map, and an old single reserve seeds the captain", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  // The per-hull map wins, and a hull missing from it is seeded from her own days.
  const saved = buildReserves(hulls, { byHull: { capitana: 1234 }, legacy: 999 });
  assert.equal(saved.capitana, 1234);
  assert.equal(saved["escolta-1"], supplySeconds(20));

  // An old save with the single reserve loads it onto the captain, and every escort
  // starts from her own days.
  const legacy = buildReserves(hulls, { legacy: 4321 });
  assert.equal(legacy.capitana, 4321);
  assert.equal(legacy["escolta-1"], supplySeconds(20));
  assert.equal(legacy["escolta-2"], supplySeconds(7));

  // No save at all, or a broken one, seeds everybody from her own days.
  assert.equal(buildReserves(hulls).capitana, supplySeconds(45));
  assert.equal(buildReserves(hulls, { legacy: "x" }).capitana, supplySeconds(45));
  assert.equal(buildReserves(hulls, { byHull: null, legacy: -1 }).capitana, supplySeconds(45));
});

test("S-F: wages stay whole-fleet, charged per day crossed by the captain's clock", () => {
  GAME_TIME.gameSecondsPerDay = 100;
  const step = burnReserves({ capitana: supplySeconds(45), "escolta-1": supplySeconds(20) }, 200);
  assert.equal(step.daysSpent.capitana, 2);
  assert.equal(step.daysSpent["escolta-1"], 2);
  const upkeep = 120; // the whole fleet's daily upkeep, moored hulls included
  // Two days crossed, charged once for the whole fleet: not split, not doubled per hull.
  assert.equal(wagesFor(step.daysSpent, "capitana", upkeep), 2 * upkeep);
  // A hull that crossed more days than the captain does not multiply the charge.
  assert.equal(wagesFor({ capitana: 1, "escolta-1": 9 }, "capitana", upkeep), upkeep);
  // A captain that crossed no day owes nothing.
  assert.equal(wagesFor({ "escolta-1": 9 }, "capitana", upkeep), 0);
  assert.equal(wagesFor(null, "capitana", upkeep), 0);
});
