import test from "node:test";
import assert from "node:assert/strict";

import {
  CREW_ROLES,
  HULLS,
  PIECES,
  STARTING_GOLD,
  ammoById,
  hullById,
  pieceById,
} from "../src/data/naval-data.js";
import {
  ammoPrice,
  crewHirePrice,
  dailyUpkeep,
  minimumShipPrice,
  piecesPrice,
  priceShip,
  provisionsPrice,
  shotStockPrice,
} from "../src/model/economy.js";
import { buildShip, normaliseConfig, toRuntimeShip } from "../src/model/shipyard.js";

/** A starter ship the 12,000 gold budget actually buys. */
const starterConfig = () => ({
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "falcon", qty: 2, side: "babor", shotsPerPiece: 30, ammoId: "metralla" },
    { pieceId: "falcon", qty: 2, side: "estribor", shotsPerPiece: 30, ammoId: "metralla" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45,
  cargoKg: 6_000,
  ballastKg: 3_000,
  equipmentKg: 2_500,
  reserveKg: 1_500,
});

/** The same hull, loaded to its limit, for the affordability boundary. */
const midConfig = () => ({
  hullId: "galeon-guerra",
  batteries: [
    { pieceId: "medio-canon-32", qty: 8, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" },
    { pieceId: "medio-canon-32", qty: 8, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 4, side: "babor", shotsPerPiece: 30, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 4, side: "estribor", shotsPerPiece: 30, ammoId: "bala-hierro" },
  ],
  crew: { marino: 90, artillero: 40, soldado: 60 },
  days: 60,
  cargoKg: 40_000,
  ballastKg: 15_000,
  equipmentKg: 12_000,
  reserveKg: 8_000,
});

test("S1: every hull, piece and crew role has a positive gold price", () => {
  for (const hull of HULLS) assert.ok(hull.priceGold > 0, `${hull.id} needs a price`);
  for (const piece of PIECES) assert.ok(piece.priceGold > 0, `${piece.id} needs a price`);
  for (const role of CREW_ROLES) assert.ok(role.hireGold > 0, `${role.id} needs a hire price`);
});

test("S1: the price total is exactly the sum of its parts", () => {
  const price = priceShip(midConfig());
  const expected =
    price.hull + price.pieces + price.shots + price.crew + price.provisions + price.cargo + price.ballast;
  assert.equal(price.total, expected);
  assert.ok(price.total > 0);
});

test("S1: a flagship costs more than a patache", () => {
  assert.ok(hullById("gran-buque-real").priceGold > hullById("patache").priceGold);
});

test("S1: crew hire is per role, and roles are not interchangeable", () => {
  const sailors = crewHirePrice({ marino: 10 });
  const gunners = crewHirePrice({ artillero: 10 });
  assert.ok(gunners > sailors, "artilleros cost more to hire than marinos");
  assert.equal(crewHirePrice({}), 0);
  assert.equal(crewHirePrice({ marino: 10, artillero: 10 }), sailors + gunners);
});

test("S1: provisions scale with people and days", () => {
  assert.equal(provisionsPrice(100, 30), provisionsPrice(50, 60));
  assert.equal(provisionsPrice(0, 30), 0);
});

test("S1: a heavier shot stock costs more than a light one", () => {
  const heavy = shotStockPrice([
    { pieceId: "canon-60", qty: 10, shotsPerPiece: 20, ammoId: "bala-hierro" },
  ]);
  const light = shotStockPrice([
    { pieceId: "falconete", qty: 10, shotsPerPiece: 20, ammoId: "bala-hierro" },
  ]);
  assert.ok(heavy > light);
});

test("S1: an iron shot is dearer than a stone shot", () => {
  assert.ok(ammoPrice("bala-hierro") > ammoPrice("bala-piedra"));
});

test("S1: pieces price multiplies unit price by quantity", () => {
  const unit = pieceById("medio-canon-32").priceGold;
  assert.equal(piecesPrice([{ pieceId: "medio-canon-32", qty: 7 }]), unit * 7);
  assert.equal(piecesPrice([{ pieceId: "no-existe", qty: 7 }]), 0);
});

test("S1: upkeep grows with the crew and the hull", () => {
  const small = dailyUpkeep({ marino: 10 }, "patache");
  const large = dailyUpkeep({ marino: 100, soldado: 60 }, "gran-buque-real");
  assert.ok(large > small);
  assert.equal(dailyUpkeep({}, "patache") > 0, true, "a hull always needs maintenance");
});

test("S1: the starting gold buys a mid-sized armed ship", () => {
  const price = priceShip(starterConfig()).total;
  assert.ok(price <= STARTING_GOLD, `starter ship costs ${price}, budget is ${STARTING_GOLD}`);
  assert.ok(price > STARTING_GOLD * 0.4, "the starter should still be a real purchase");
});

test("S1: the starting gold does not buy a flagship", () => {
  const flagship = minimumShipPrice("gran-buque-real");
  assert.ok(flagship > STARTING_GOLD, `flagship minimum ${flagship} should exceed ${STARTING_GOLD}`);
});

test("S2: every hull can be turned into a priced, normalised configuration", () => {
  for (const hull of HULLS) {
    const ship = buildShip({
      hullId: hull.id,
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 10, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 10, ammoId: "bala-hierro" },
      ],
      crew: { marino: hull.crewMin, artillero: 4, soldado: 20 },
      days: 30,
    });
    assert.ok(ship, `${hull.id} must build`);
    assert.equal(ship.hull.id, hull.id);
    assert.ok(ship.price.total > 0);
  }
});

test("S2: an unknown hull yields no ship at all", () => {
  assert.equal(buildShip({ hullId: "no-existe", batteries: [], crew: {} }), null);
});

test("S2: unknown pieces are dropped instead of producing NaN mass", () => {
  const ship = buildShip({
    hullId: "patache",
    batteries: [{ pieceId: "arma-inventada", qty: 5, side: "babor", shotsPerPiece: 5 }],
    crew: { marino: 12 },
    days: 20,
  });
  assert.equal(ship.config.batteries.length, 0);
  assert.ok(Number.isFinite(ship.budget.realMassKg));
});

test("S2: ammunition outside a piece's allowed list falls back to its first round", () => {
  const clean = normaliseConfig({
    hullId: "patache",
    batteries: [{ pieceId: "canon-60", qty: 1, side: "babor", shotsPerPiece: 5, ammoId: "metralla" }],
  });
  assert.equal(clean.batteries[0].ammoId, "metralla");

  const clean2 = normaliseConfig({
    hullId: "patache",
    batteries: [{ pieceId: "canon-60", qty: 1, side: "babor", shotsPerPiece: 5, ammoId: "cadena" }],
  });
  assert.equal(clean2.batteries[0].ammoId, pieceById("canon-60").ammo[0]);
});

test("S2: negative and fractional quantities are clamped, not trusted", () => {
  const clean = normaliseConfig({
    hullId: "patache",
    batteries: [{ pieceId: "minion", qty: -3, side: "babor", shotsPerPiece: 4.9 }],
    crew: { marino: -5, soldado: 3.7 },
    days: -10,
    cargoKg: -100,
  });
  assert.equal(clean.batteries.length, 0);
  assert.deepEqual(clean.crew, { soldado: 3 });
  assert.equal(clean.days, 0);
  assert.equal(clean.cargoKg, 0);
});

test("S2: an unaffordable but seaworthy ship reports only the price problem", () => {
  const ship = buildShip(midConfig(), 100);
  assert.equal(ship.affordable, false);
  assert.equal(ship.feasible, false);
  assert.equal(ship.errors.length, 1);
  assert.equal(ship.errors[0].code, "unaffordable");
  assert.match(ship.errors[0].message, /Faltan \d+ doblones/);
});

test("S2: a seaworthy ship the player can afford is feasible with no errors", () => {
  const ship = buildShip(starterConfig(), STARTING_GOLD);
  assert.equal(ship.affordable, true);
  assert.equal(ship.feasible, true, JSON.stringify(ship.errors));
  assert.equal(ship.errors.length, 0);
});

test("S2: a ship that does not fit is not feasible even when it is affordable", () => {
  const ship = buildShip({ ...midConfig(), cargoKg: 5_000_000 }, 10_000_000);
  assert.equal(ship.affordable, true);
  assert.equal(ship.feasible, false);
  assert.ok(ship.errors.some((e) => e.code === "mass-exceeded"));
});

test("S2: the verdict exposes gun counts per side and the shot stock", () => {
  const ship = buildShip(midConfig());
  assert.equal(ship.guns.total, 24);
  assert.deepEqual(ship.guns.sides, { babor: 12, estribor: 12 });
  assert.equal(ship.shotStock.length, 4);
  const totalRounds = ship.shotStock.reduce((sum, s) => sum + s.rounds, 0);
  assert.equal(totalRounds, 8 * 20 * 2 + 4 * 30 * 2);
  assert.equal(ship.shotStock[0].ammoName, ammoById("bala-hierro").name);
});

test("S2: the runtime ship carries the numbers the sailing phase needs", () => {
  const ship = buildShip(starterConfig(), STARTING_GOLD);
  const runtime = toRuntimeShip(ship, { name: "Revenge" });

  assert.equal(runtime.name, "Revenge");
  assert.equal(runtime.hullId, "galeon-pequeno");
  assert.equal(runtime.maxDisplacementKg, hullById("galeon-pequeno").displacementKg);
  assert.equal(runtime.condition.hull, 100);
  assert.equal(runtime.condition.rigging, 100);
  assert.equal(runtime.people, ship.budget.people);
  assert.ok(runtime.speedKn > 0);
  assert.ok(runtime.draftM > 0);
  assert.equal(runtime.batteries.length, 4);
  assert.equal(runtime.guns.sides.babor, 5);
});

test("S2: the runtime ship is a deep copy, not a live view of the config", () => {
  const ship = buildShip(starterConfig(), STARTING_GOLD);
  const runtime = toRuntimeShip(ship);
  runtime.crew.marino = 1;
  runtime.batteries[0].qty = 999;
  assert.equal(ship.config.crew.marino, 34);
  assert.equal(ship.config.batteries[0].qty, 3);
});
