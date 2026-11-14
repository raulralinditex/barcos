/**
 * S62-S64: selling a hull, capturing a beaten enemy, and selling the prize.
 *
 * These tests pin the money and the fleet, which is the part that must never lie: a
 * sale that pays the wrong amount or a capture that loses the player's own ships is
 * exactly the kind of bug the canvas cannot show.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  SALES,
  canSellShip,
  captureableShip,
  capturedShip,
  salePrice,
  sellShip,
  withPrize,
} from "../src/model/sale.js";
import { COMBAT, createEnemyCombatant } from "../src/model/combat.js";
import { SETTINGS_FIELDS, applySettings, fieldId, resetSettings } from "../src/model/settings.js";
import { captainShip } from "../src/model/fleet.js";
import { shipValue } from "../src/model/repair.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { hullById } from "../src/data/naval-data.js";

const withDefaults = (body) => {
  try {
    body();
  } finally {
    resetSettings();
  }
};

const build = (hullId, name) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries: [
          { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 6000,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      12000,
    ),
    { name },
  );

const captain = build("zabra", "Capitana");
const escort = { ...build("galeon-pequeno", "Escolta"), id: `${captain.id}-escort` };
const fleet = { ships: [captain, escort], captainId: captain.id };

/* ---------------------------------------------------------------- selling (S62) */

test("S62: a hull sells for half her value", () => {
  assert.equal(SALES.share, 0.5);
  assert.equal(salePrice({ paidGold: 4000 }), 2000);
  assert.equal(salePrice({ paidGold: 4001 }), 2000, "the price is whole doblones, rounded down");
});

test("S62: the share is a setting, so the screen and the sale cannot disagree", () => {
  const fields = SETTINGS_FIELDS.filter((field) => fieldId(field) === "sales.share");
  assert.equal(fields.length, 1, "there should be exactly one share field");
  assert.equal(fields[0].group, "sales");
  withDefaults(() => {
    applySettings({ "sales.share": 0.25 });
    assert.equal(salePrice({ paidGold: 4000 }), 1000);
    applySettings({ "sales.share": 0 });
    assert.equal(salePrice({ paidGold: 4000 }), 0, "a zero share is allowed, and pays nothing");
  });
});

test("S62: a hull with no value sells for nothing instead of throwing", () => {
  for (const broken of [{}, { paidGold: NaN }, { paidGold: -5 }, { hullId: "no-existe" }, null]) {
    assert.equal(salePrice(broken), 0, `value ${JSON.stringify(broken)}`);
  }
});

test("S62: selling pays the price and takes the hull out of the fleet", () => {
  const result = sellShip(fleet, escort.id, 1000);
  assert.ok(result, "the sale should be allowed");
  assert.equal(result.price, salePrice(escort));
  assert.equal(result.gold, 1000 + salePrice(escort));
  assert.deepEqual(result.fleet.ships.map((s) => s.id), [captain.id]);
});

test("S62: the captain can be sold and the fleet passes to the next hull", () => {
  const result = sellShip(fleet, captain.id, 0);
  assert.equal(result.fleet.ships.length, 1);
  assert.equal(result.fleet.captainId, escort.id);
  assert.equal(captainShip(result.fleet).id, escort.id);
});

test("S62: the last hull cannot be sold", () => {
  const alone = { ships: [captain], captainId: captain.id };
  assert.equal(canSellShip(alone, captain.id), false);
  assert.equal(sellShip(alone, captain.id, 0), null);
  assert.equal(alone.ships.length, 1, "the refused sale must not touch the fleet");
});

test("S62: an unknown hull sells nothing and pays nothing", () => {
  assert.equal(canSellShip(fleet, "no-existe"), false);
  assert.equal(sellShip(fleet, "no-existe", 500), null);
});

test("S62: the purse never goes backwards or becomes NaN", () => {
  assert.equal(sellShip(fleet, escort.id, -50).gold, salePrice(escort), "a negative purse is read as zero");
  assert.equal(sellShip(fleet, escort.id, NaN).gold, salePrice(escort));
});

/* ---------------------------------------------------------------- capture (S63) */

const surrendered = (hullId = "galeon-guerra") => {
  const encounter = {
    id: 7,
    type: "enemy",
    hullId,
    x: 0,
    y: 0,
    combat: createEnemyCombatant({ id: 7, hullId, zoneId: "abierto" }, { id: "abierto" }, 12345),
  };
  encounter.combat.condition.crew = COMBAT.surrenderCrewPct - 5;
  encounter.combat.status = "surrendered";
  return encounter;
};

test("S63: a surrendered enemy can be taken", () => {
  const prize = captureableShip(surrendered());
  assert.ok(prize, "a struck enemy should be captureable");
  assert.equal(prize.hullId, "galeon-guerra");
  assert.equal(prize.captured, true);
});

test("S63: a sunk enemy is a wreck, not a capture", () => {
  const sunk = surrendered();
  sunk.combat.status = "sunk";
  sunk.combat.condition.hull = 0;
  assert.equal(captureableShip(sunk), null);
});

test("S63: an enemy still fighting cannot be taken", () => {
  const fighting = surrendered();
  fighting.combat.status = "fighting";
  fighting.combat.condition.crew = 90;
  assert.equal(captureableShip(fighting), null);
});

test("S63: a prize keeps the hull, her guns and what is left of her", () => {
  const encounter = surrendered();
  encounter.combat.condition.hull = 42;
  const prize = captureableShip(encounter);

  const guns = prize.batteries.reduce((sum, battery) => sum + battery.qty, 0);
  assert.equal(guns, encounter.combat.pieces.length, "every gun she carried comes across");
  assert.equal(prize.condition.hull, 42, "she comes across as damaged as she was");
  assert.equal(prize.paidGold, hullById("galeon-guerra").priceGold, "nothing was paid for her");
  assert.ok(prize.speedKn > 0, "a captured hull must be able to sail");
  assert.deepEqual(prize.crewAlive, prize.crew, "her surviving crew comes across");
});

test("S63: a prize joins the fleet without displacing the captain", () => {
  const prize = captureableShip(surrendered());
  const grown = withPrize(fleet, prize);
  assert.equal(grown.ships.length, 3);
  assert.equal(grown.captainId, captain.id, "the captain keeps the fleet");
  assert.equal(grown.ships.at(-1).id, prize.id);
});

test("S63: a prize is the captain when there is nobody left to sail", () => {
  const prize = captureableShip(surrendered());
  const empty = { ships: [], captainId: null };
  const grown = withPrize(empty, prize);
  assert.equal(grown.ships.length, 1);
  assert.equal(grown.captainId, prize.id);
  assert.equal(captainShip(grown).id, prize.id);
});

test("S63: a capture with no hull or no combat is refused instead of crashing", () => {
  assert.equal(capturedShip({ hullId: "no-existe", combat: {} }), null);
  assert.equal(capturedShip({ hullId: "patache" }), null);
  assert.equal(capturedShip(null), null);
});

/* ---------------------------------------------------------------- selling the prize (S64) */

test("S64: a captured hull can be sold like any other", () => {
  const prize = captureableShip(surrendered());
  const grown = withPrize(fleet, prize);
  assert.equal(canSellShip(grown, prize.id), true);
  const result = sellShip(grown, prize.id, 0);
  assert.ok(result, "the prize should be sellable");
  assert.equal(result.price, salePrice(prize));
  assert.ok(result.price > 0, "a ship of the line is worth selling");
  assert.deepEqual(result.fleet.ships.map((s) => s.id), [captain.id, escort.id]);
});

test("S64: a prize is worth her catalogue hull, not what the guns cost", () => {
  const prize = captureableShip(surrendered("patache"));
  assert.equal(shipValue(prize), hullById("patache").priceGold);
  assert.equal(salePrice(prize), Math.floor(hullById("patache").priceGold * SALES.share));
});
