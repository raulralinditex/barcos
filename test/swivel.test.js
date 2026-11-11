import test from "node:test";
import assert from "node:assert/strict";

import { PIECES, hullById, pieceById } from "../src/data/naval-data.js";
import {
  createPlayerCombatant,
  firingPieces,
  fireBroadside,
  tickCombatant,
} from "../src/model/combat.js";
import * as shipModel from "../src/model/ship-model.js";
import { buildShip, normaliseConfig, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * S20: a swivel gun (the verso) is not bolted to one side. It answers for whichever
 * broadside the player fires, on its own reload clock, inside its own short range.
 */

const HULL = "galeon-pequeno";
const MAX_PER_SIDE = hullById(HULL).maxPiecesPerSide;

const cannon = (side, qty = 2) => ({
  pieceId: "minion",
  qty,
  side,
  shotsPerPiece: 20,
  ammoId: "bala-hierro",
});
const swivel = (qty = 2, side = "swivel") => ({
  pieceId: "verso",
  qty,
  side,
  shotsPerPiece: 20,
  ammoId: "metralla",
});

const config = (batteries) => ({
  hullId: HULL,
  batteries,
  crew: { marino: 34, artillero: 12, soldado: 26 },
  days: 45,
  cargoKg: 3_000,
  ballastKg: 3_000,
  equipmentKg: 2_500,
  reserveKg: 1_500,
});

const verdict = (batteries) => buildShip(config(batteries), 100_000);
const codes = (ship) => ship.issues.map((issue) => issue.code);

const combatantWith = (batteries) =>
  createPlayerCombatant(toRuntimeShip(verdict(batteries), { name: "Test" }));

/* ---------------------------------------------------------------- data */

test("S20: the verso is the only swivel piece in the dataset", () => {
  const swivels = PIECES.filter((piece) => piece.swivel === true).map((piece) => piece.id);
  assert.deepEqual(swivels, ["verso"]);
});

/* ---------------------------------------------------------------- configuration */

test("S20: a swivel entry is always mounted as a swivel, whatever side it was given", () => {
  for (const side of ["babor", "estribor", "swivel", undefined]) {
    const clean = normaliseConfig(config([swivel(2, side)]));
    assert.equal(clean.batteries[0].side, "swivel", `side ${side} must become swivel`);
  }
});

test("S20: a fixed gun can never be mounted as a swivel", () => {
  const clean = normaliseConfig(config([cannon("swivel")]));
  assert.equal(clean.batteries[0].side, "babor");
});

test("S20: fixed guns keep their chosen side", () => {
  const clean = normaliseConfig(config([cannon("babor"), cannon("estribor")]));
  assert.deepEqual(
    clean.batteries.map((entry) => entry.side),
    ["babor", "estribor"],
  );
});

/* ---------------------------------------------------------------- counting */

test("S20: swivels are counted apart from the two broadsides", () => {
  const sides = shipModel.piecesBySide([cannon("babor", 3), cannon("estribor", 2), swivel(4)]);
  assert.equal(sides.babor, 3);
  assert.equal(sides.estribor, 2);
  assert.equal(sides.swivel, 4);
});

test("S20: swivels count in the total number of guns", () => {
  assert.equal(shipModel.totalPieces([cannon("babor", 3), swivel(4)]), 7);
});

test("S20: swivels do not use up the gun ports of a broadside", () => {
  // a full broadside on each side plus swivels must not trip the per-side limit
  const ship = verdict([cannon("babor", MAX_PER_SIDE), cannon("estribor", MAX_PER_SIDE), swivel(2)]);
  assert.ok(!codes(ship).includes("too-many-pieces"), JSON.stringify(ship.issues));
});

test("S20: a hull carries a limited number of swivels", () => {
  const limit = shipModel.maxSwivels(hullById(HULL));
  assert.ok(Number.isInteger(limit) && limit > 0, "the limit must be a positive integer");

  const within = verdict([cannon("babor"), cannon("estribor"), swivel(limit)]);
  assert.ok(!codes(within).includes("too-many-swivels"));

  const over = verdict([cannon("babor"), cannon("estribor"), swivel(limit + 1)]);
  assert.ok(codes(over).includes("too-many-swivels"));
  assert.equal(over.feasible, false, "too many swivels is an error, not a warning");
  const issue = over.issues.find((entry) => entry.code === "too-many-swivels");
  assert.equal(issue.params.max, limit);
  assert.equal(issue.params.count, limit + 1);
});

test("S20: a lighter hull carries fewer swivels than a heavier one", () => {
  assert.ok(
    shipModel.maxSwivels(hullById("patache")) < shipModel.maxSwivels(hullById("gran-buque-real")),
  );
});

/* ---------------------------------------------------------------- one-sided warning */

test("S20: swivels cover the side that has no broadside, so no one-sided warning", () => {
  const ship = verdict([cannon("babor", 3), swivel(2)]);
  assert.ok(!codes(ship).includes("one-sided-battery.estribor"), JSON.stringify(ship.issues));
});

test("S20: without swivels a one-sided battery still warns (previous behaviour)", () => {
  const ship = verdict([cannon("babor", 3)]);
  assert.ok(codes(ship).includes("one-sided-battery.estribor"));
});

/* ---------------------------------------------------------------- combat */

test("S20: a swivel fires when the player fires either broadside", () => {
  for (const side of ["babor", "estribor"]) {
    const combatant = combatantWith([swivel(2)]);
    const ready = firingPieces(combatant, side, 100);
    assert.equal(ready.length, 2, `swivels must be ready on ${side}`);
    assert.ok(ready.every((piece) => piece.side === "swivel"));
  }
});

test("S20: firing one side spends the swivels, so the other side finds them reloading", () => {
  const combatant = combatantWith([swivel(2)]);
  const first = fireBroadside(combatant, "babor", 100, () => 0);
  assert.equal(first.volley.length, 2);
  assert.equal(firingPieces(combatant, "estribor", 100).length, 0, "one reload clock per gun");

  tickCombatant(combatant, 60);
  assert.equal(firingPieces(combatant, "estribor", 100).length, 2, "ready again after reloading");
});

test("S20: a swivel respects its own short range", () => {
  const combatant = combatantWith([swivel(2)]);
  const range = pieceById("verso").rangeM;
  assert.equal(firingPieces(combatant, "babor", range).length, 2);
  assert.equal(firingPieces(combatant, "babor", range + 1).length, 0);
});

test("S20: swivels join the broadside they answer for without changing fixed guns", () => {
  const combatant = combatantWith([cannon("babor", 2), cannon("estribor", 3), swivel(2)]);
  const babor = firingPieces(combatant, "babor", 100);
  const estribor = firingPieces(combatant, "estribor", 100);
  assert.equal(babor.filter((piece) => piece.side === "babor").length, 2);
  assert.equal(babor.filter((piece) => piece.side === "swivel").length, 2);
  assert.equal(estribor.filter((piece) => piece.side === "estribor").length, 3);
  // a fixed gun still never answers for the opposite side
  assert.ok(babor.every((piece) => piece.side !== "estribor"));
  assert.ok(estribor.every((piece) => piece.side !== "babor"));
});

test("S20: a swivel keeps its own ammunition and rounds", () => {
  const combatant = combatantWith([swivel(1)]);
  const gun = combatant.pieces.find((piece) => piece.side === "swivel");
  assert.equal(gun.ammoId, "metralla");
  assert.equal(gun.shotsLeft, 20);
  fireBroadside(combatant, "estribor", 100, () => 0);
  assert.equal(gun.shotsLeft, 19);
});

/* ---------------------------------------------------------------- language (S11) */

import { COLLECTION } from "../src/i18n/index.js";
import { LANGUAGES, createTranslator } from "../src/i18n/core.js";
import { familyLabel, issueMessage } from "../src/i18n/terms.js";

test("S20: the too-many-swivels message exists in both languages and names the numbers", () => {
  const issue = { code: "too-many-swivels", params: { count: 9, max: 6 } };
  for (const language of LANGUAGES) {
    const text = issueMessage(issue, createTranslator(COLLECTION, language).t);
    assert.ok(text.includes("9") && text.includes("6"), `${language}: ${text}`);
  }
});

test("S20: every gun family is translated in both languages", () => {
  for (const family of new Set(PIECES.map((piece) => piece.family))) {
    for (const language of LANGUAGES) {
      const t = createTranslator(COLLECTION, language).t;
      const label = familyLabel(family, t);
      assert.ok(label && !label.startsWith("shipyard.family."), `${language}/${family} -> ${label}`);
    }
  }
  const en = createTranslator(COLLECTION, "en").t;
  assert.equal(familyLabel("verso", en), "swivel gun");
  assert.equal(familyLabel("cañón", en), "cannon");
});

test("S20: an unknown family falls back to the dataset text, not to a key", () => {
  const bare = createTranslator({ es: {}, en: {} }, "es").t;
  assert.equal(familyLabel("cañón", bare), "cañón");
});

test("S20: the battery card and swivel labels exist in both languages", () => {
  const keys = [
    "shipyard.battery.side", "shipyard.battery.swivel", "shipyard.battery.qty",
    "shipyard.battery.shots", "shipyard.battery.ammo", "shipyard.battery.remove",
    "shipyard.battery.family", "shipyard.battery.meta", "shipyard.battery.rounds",
    "shipyard.swivels", "shipyard.canvasSwivel", "sail.gunsDetailSwivel", "sea.roundsSwivel",
  ];
  for (const key of keys) {
    for (const language of LANGUAGES) {
      assert.ok(Object.hasOwn(COLLECTION[language], key), `${language} is missing ${key}`);
    }
  }
});
