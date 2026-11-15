/**
 * Fort reinforcement (S100, S102): the yard's own repairs and bought guns, both priced and
 * capped, both living in the fort state the sea already saves.
 *
 * Pure model tests: no browser, no sea loop.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FORT,
  FORT_UPGRADE,
  createFortCombatant,
  fortRepairQuote,
  fortRepair,
  fortBoughtGuns,
  fortGunCost,
  fortGunHeadroom,
  buyFortGun,
} from "../src/model/fort.js";
import { SETTINGS_FIELDS, SETTINGS_BLOCKS, applySettings } from "../src/model/settings.js";
import { normaliseGold } from "../src/model/economy.js";

test("a sound fort costs nothing to repair and quotes no job", () => {
  const fort = { condition: { hull: 100, crew: 100, rigging: 100, morale: 100 }, status: "fighting" };
  const quote = fortRepairQuote(fort);
  assert.equal(quote.cost, 0);
  assert.equal(quote.repairable, false);
});

test("a battered fort repairs hull and garrison for a share of her pinch", () => {
  const fort = { condition: { hull: 40, crew: 30, rigging: 100, morale: 100 }, status: "fighting" };
  const quote = fortRepairQuote(fort);
  // Worse segment decides, like a ship: 70 % damaged.
  assert.equal(quote.damageShare, 0.7);
  assert.ok(quote.cost > 0);
  assert.equal(quote.repairable, true);
});

test("repairing the fort restores her and charges the purse once", () => {
  const fort = { condition: { hull: 40, crew: 30, rigging: 100, morale: 100 }, status: "fighting" };
  const quote = fortRepairQuote(fort);
  const purse = 50_000;
  const result = fortRepair(fort, purse);
  assert.equal(result.fort.condition.hull, 100);
  assert.equal(result.fort.condition.crew, 100);
  assert.equal(result.gold, purse - quote.cost);
  assert.equal(result.applied, true);
});

test("a purse too small refuses the repair and leaves the fort untouched", () => {
  const fort = { condition: { hull: 40, crew: 30, rigging: 100, morale: 100 }, status: "fighting" };
  const quote = fortRepairQuote(fort);
  const result = fortRepair(fort, Math.max(0, quote.cost - 1));
  assert.equal(result.applied, false);
  assert.equal(result.fort.condition.hull, 40);
  assert.equal(result.fort.condition.crew, 30);
  assert.equal(result.gold, Math.max(0, quote.cost - 1));
});

test("a taken fort cannot be repaired (the port is closed, S74)", () => {
  const fort = { condition: { hull: 40, crew: 30, rigging: 100, morale: 100 }, status: "surrendered" };
  const quote = fortRepairQuote(fort);
  assert.equal(quote.repairable, false);
  const result = fortRepair(fort, 100_000);
  assert.equal(result.applied, false);
  assert.equal(result.fort.condition.hull, 40);
});

test("bought guns start empty, cost 400 each and cap at six per side", () => {
  assert.equal(FORT_UPGRADE.gunCost, 400);
  assert.equal(FORT_UPGRADE.maxPerSide, 6);
  const fort = { boughtGuns: 0 };
  assert.equal(fortBoughtGuns(fort), 0);
  // The cap is per side, so one purchase arms both sides and the max purchase is 6.
  assert.equal(fortGunHeadroom(fort), 6);
  assert.equal(fortGunCost(fort), 400);
});

test("buying one gun adds it to every side at the next combatant build", () => {
  const fort = { boughtGuns: 2, status: "fighting" };
  const combatant = createFortCombatant({ victories: 0, boughtGuns: 2 });
  // Base 3 + 2 bought, per side.
  const babor = combatant.pieces.filter((p) => p.side === "babor").length;
  const estribor = combatant.pieces.filter((p) => p.side === "estribor").length;
  assert.equal(babor, 5);
  assert.equal(estribor, 5);
  // Bought guns carry the yard's own rounds, like the base battery.
  const boughtPiece = combatant.pieces[4];
  assert.equal(boughtPiece.shotsLeft, FORT.shotsPerGun);
});

test("buying another gun charges the purse and writes it to the fort", () => {
  const fort = { boughtGuns: 0 };
  const purse = 1_000;
  const result = buyFortGun(fort, purse);
  assert.equal(result.applied, true);
  assert.equal(result.gold, 600);
  assert.equal(result.fort.boughtGuns, 1);
});

test("the cap refuses the purchase at six guns bought (S100)", () => {
  const fort = { boughtGuns: 6 };
  const purse = 5_000;
  const result = buyFortGun(fort, purse);
  assert.equal(result.applied, false);
  assert.equal(result.gold, 5_000);
  assert.equal(result.fort.boughtGuns, 6);
});

test("a purse too small refuses a gun and the fort stays as it was", () => {
  const fort = { boughtGuns: 0 };
  const result = buyFortGun(fort, 399);
  assert.equal(result.applied, false);
  assert.equal(result.fort.boughtGuns, 0);
  assert.equal(result.gold, 399);
});

test("bought guns count into the panel total next to the victories' bonus", () => {
  const fort = { boughtGuns: 3 };
  const combatant = createFortCombatant({ victories: 5, boughtGuns: 3 });
  const babor = combatant.pieces.filter((p) => p.side === "babor").length;
  // 3 base + 1 from five victories + 3 bought.
  assert.equal(babor, 7);
  // Headroom counts against the total per side: 3 base + 1 earned + 3 bought = 7,
  // under a cap of 10, so two sides of room — three guns — remain.
  const fortState = { boughtGuns: 3 };
  assert.equal(fortGunHeadroom(fortState, { victories: 5 }), 3);
});

test("the gun price is configurable from the settings screen (S102)", () => {
  // The two fields exist and write straight into FORT_UPGRADE.
  const fields = SETTINGS_FIELDS.filter((f) => f.group === "fortUpgrade");
  const labels = fields.map((f) => f.key);
  assert.ok(labels.includes("gunCost"), "settings must expose fortUpgrade.gunCost");
  assert.ok(labels.includes("maxPerSide"), "settings must expose fortUpgrade.maxPerSide");
  assert.ok(SETTINGS_BLOCKS.fortUpgrade === FORT_UPGRADE);

  applySettings({ "fortUpgrade.gunCost": 250, "fortUpgrade.maxPerSide": 4 });
  assert.equal(fortGunCost({}), 250);
  assert.equal(fortGunHeadroom({ boughtGuns: 3 }), 1);
  const result = buyFortGun({ boughtGuns: 3 }, 300);
  assert.equal(result.applied, true);
  assert.equal(result.gold, 50);
});

test("the fort repair price is configurable through her pinch (S102)", () => {
  const fields = SETTINGS_FIELDS.filter((f) => f.group === "fortUpgrade");
  assert.ok(fields.some((f) => f.key === "repairPinch"));
  applySettings({ "fortUpgrade.repairPinch": 400 });
  const fort = { condition: { hull: 50, crew: 50, rigging: 100, morale: 100 }, status: "fighting" };
  const quote = fortRepairQuote(fort);
  assert.equal(quote.cost, 200); // half her pinch: half damaged
});

