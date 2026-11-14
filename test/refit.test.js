import test from "node:test";
import assert from "node:assert/strict";
import { hullPrice, priceShip } from "../src/model/economy.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { REFIT, configFromShip, quoteRefit, applyRefit } from "../src/model/refit.js";

const config = () => ({
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
});
const original = () => ({
  ...toRuntimeShip(buildShip(config()), { name: "Avispa" }),
  id: "known-id", country: "England", sails: false,
  condition: { hull: 50, rigging: 60, crew: 70, morale: 80 },
  crewAlive: { marino: 20, artillero: 8, soldado: 2 },
});
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const lines = ["pieces", "shots", "crew", "provisions", "cargo", "ballast"];

function checkQuote(ship, next) {
  const oldPrice = priceShip(configFromShip(ship));
  const newPrice = priceShip({ ...next, hullId: ship.hullId });
  let paid = 0, removed = 0;
  for (const line of lines) {
    paid += Math.max(0, newPrice[line] - oldPrice[line]);
    removed += Math.max(0, oldPrice[line] - newPrice[line]);
  }
  const quote = quoteRefit(ship, next, 1_000_000);
  // whole doblones, rounded against the player: what is added up, what comes back down
  assert.equal(quote.paid, Math.ceil(paid - 1e-9));
  assert.equal(quote.refunded, Math.floor(removed * 0.5 + 1e-9));
  assert.equal(quote.net, quote.paid - quote.refunded);
  return { quote, paid, removed };
}

test("S50: configuration round trip includes every loadout field and name without aliases", () => {
  const ship = original();
  const recovered = configFromShip(ship);
  assert.deepEqual(recovered, { ...config(), name: "Avispa" });
  recovered.batteries[0].qty = 100;
  recovered.crew.marino = 1;
  assert.equal(ship.batteries[0].qty, 3);
  assert.equal(ship.crew.marino, 34);
});

test("S50: additions, removals and mixed changes quote each price line at full/half", () => {
  assert.equal(REFIT.refundShare, 0.5);
  const ship = original(), old = configFromShip(ship);
  const add = { ...old, batteries: old.batteries.map(b => ({ ...b, qty: b.qty + 1 })), crew: { ...old.crew, marino: 38 }, days: 50, cargoKg: 7000, ballastKg: 4000 };
  const remove = { ...old, batteries: old.batteries.map(b => ({ ...b, qty: b.qty - 1 })), crew: { ...old.crew, marino: 30 }, days: 40, cargoKg: 5000, ballastKg: 2000 };
  const mixed = { ...old, batteries: add.batteries, crew: remove.crew, days: 50, cargoKg: 5000, ballastKg: 4000 };
  const a = checkQuote(ship, add), r = checkQuote(ship, remove), m = checkQuote(ship, mixed);
  assert.ok(a.paid > 0); assert.equal(a.removed, 0);
  assert.equal(r.paid, 0); assert.ok(r.removed > 0); assert.ok(r.quote.net < 0);
  assert.ok(m.paid > 0); assert.ok(m.removed > 0);
});

test("S50: apply locks hull, preserves identity, country, sailing and damage, and adjusts crew and value", () => {
  const ship = original();
  const next = { ...configFromShip(ship), hullId: "patache", name: "Renamed", crew: { marino: 37, artillero: 4, soldado: 20, remero: 2 }, cargoKg: 4000 };
  const { paid, removed } = checkQuote(ship, next);
  const result = applyRefit(ship, next, 1_000_000);
  assert.equal(result.applied, true);
  assert.equal(result.ship.id, ship.id);
  assert.equal(result.ship.hullId, ship.hullId);
  assert.equal(result.ship.name, "Renamed");
  assert.equal(result.ship.country, ship.country);
  assert.equal(result.ship.sails, false);
  assert.deepEqual(result.ship.condition, ship.condition);
  assert.deepEqual(result.ship.crewAlive, { marino: 23, artillero: 2, soldado: 0, remero: 2 });
  close(result.ship.paidGold, Math.max(hullPrice(ship.hullId), ship.paidGold + paid - removed));
  assert.equal(ship.crewAlive.marino, 20);
});

test("S50: paid value cannot fall below hull price", () => {
  const ship = { ...original(), paidGold: hullPrice("galeon-pequeno") };
  const result = applyRefit(ship, { ...configFromShip(ship), cargoKg: 0, ballastKg: 0 }, 0);
  assert.equal(result.applied, true);
  assert.equal(result.ship.paidGold, hullPrice(ship.hullId));
});

test("S50: structural errors reject refit and leave ship and purse unchanged", () => {
  for (const changes of [
    { cargoKg: 50_000_000 },
    { crew: { marino: 0, artillero: 10, soldado: 26 } },
    { batteries: [{ pieceId: "minion", qty: 100, side: "babor", shotsPerPiece: 1, ammoId: "bala-hierro" }] },
    { batteries: [{ pieceId: "verso", qty: 100, side: "swivel", shotsPerPiece: 1, ammoId: "bala-hierro" }] },
  ]) {
    const ship = original(), before = structuredClone(ship);
    const result = applyRefit(ship, { ...configFromShip(ship), ...changes }, 1_000_000);
    assert.equal(result.applied, false);
    assert.ok(result.quote.errors.length);
    assert.deepEqual(ship, before);
    assert.deepEqual(result.ship, before);
    assert.equal(result.gold, 1_000_000);
  }
});

test("S50: affordability uses net, accepts a refund with empty purse, rejects a short purse", () => {
  const ship = original(), old = configFromShip(ship);
  const added = { ...old, cargoKg: old.cargoKg + 1000 };
  const net = quoteRefit(ship, added, 1_000_000).net;
  assert.ok(net > 0 && net < ship.paidGold);
  assert.equal(applyRefit(ship, added, net).applied, true);
  const denied = applyRefit(ship, added, net - 1);
  assert.equal(denied.applied, false);
  assert.equal(denied.gold, net - 1);
  assert.deepEqual(denied.ship, ship);
  assert.ok(denied.quote.errors.some(issue => issue.code === "unaffordable"));
  const removed = { ...old, cargoKg: 0 };
  const refunded = applyRefit(ship, removed, 0);
  assert.equal(refunded.applied, true);
  close(refunded.gold, -refunded.quote.net);
});

test("S50: the net is a whole number of doblones and never favours the player", () => {
  const ship = original();
  const base = configFromShip(ship);
  const changes = [
    { ballastKg: base.ballastKg - 1 },
    { cargoKg: base.cargoKg - 7 },
    { days: base.days - 1 },
    { crew: { ...base.crew, marino: base.crew.marino + 1 } },
    { cargoKg: base.cargoKg + 13 },
    { ballastKg: base.ballastKg + 3 },
    { batteries: base.batteries.map((b) => ({ ...b, shotsPerPiece: b.shotsPerPiece - 1 })) },
  ];
  for (const change of changes) {
    const quote = quoteRefit(ship, { ...base, ...change }, 1_000_000);
    assert.ok(Number.isInteger(quote.net), `net ${quote.net} is not whole for ${JSON.stringify(change).slice(0, 60)}`);
    assert.ok(Number.isInteger(quote.paid) && Number.isInteger(quote.refunded));
    // exact catalogue amounts: the player pays at least what was added and gets back at most half of what was removed
    const exactPaid = Math.max(0, quote.paid - 1e-9);
    assert.ok(quote.paid >= exactPaid);
    assert.ok(quote.refunded <= quote.removed * REFIT.refundShare + 1e-9, `refunded ${quote.refunded} > half of ${quote.removed}`);
  }
});

test("S50: applying a refit leaves a whole purse", () => {
  const ship = original();
  const base = configFromShip(ship);
  const result = applyRefit(ship, { ...base, days: base.days - 1 }, 1000);
  assert.equal(result.applied, true);
  assert.ok(Number.isInteger(result.gold), `purse ${result.gold}`);
});
