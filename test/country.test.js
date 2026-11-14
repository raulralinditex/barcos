/**
 * Country catalogue (S26, S27, S28, S29): every hull and every piece declares the
 * countries that may buy it, and the pure lookups return exactly that set.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  HULLS,
  PIECES,
  STARTING_GOLD,
} from "../src/data/naval-data.js";
import {
  availableHulls,
  availablePieces,
  isCountryId,
  normaliseCountry,
} from "../src/model/country.js";
import { minimumShipPrice } from "../src/model/economy.js";
import { buildShip } from "../src/model/shipyard.js";

const ids = (list) => list.map((entry) => entry.id);
const hullIds = (country) => ids(availableHulls(country));
const pieceIds = (country) => ids(availablePieces(country));

/** A cheap, feasible loadout for a hull: one small gun per side. */
const cheapLoadout = (hull) => ({
  hullId: hull.id,
  batteries: [
    { pieceId: "falconete", qty: 1, side: "babor", shotsPerPiece: 10, ammoId: "bala-hierro" },
    { pieceId: "falconete", qty: 1, side: "estribor", shotsPerPiece: 10, ammoId: "bala-hierro" },
  ],
  crew: { marino: hull.crewMin, artillero: 2, soldado: 4 },
  days: 30,
});

/* ---------------------------------------------------------------- the declared ids */

test("S27/S29: every hull declares a non-empty list of known country ids", () => {
  for (const hull of HULLS) {
    assert.ok(Array.isArray(hull.countries), `${hull.id} needs a countries list`);
    assert.ok(hull.countries.length > 0, `${hull.id} must belong to some country`);
    for (const country of hull.countries) {
      assert.ok(isCountryId(country), `${hull.id} declares unknown country ${country}`);
    }
  }
});

test("S29: every piece declares a non-empty list of known country ids", () => {
  for (const piece of PIECES) {
    assert.ok(Array.isArray(piece.countries), `${piece.id} needs a countries list`);
    assert.ok(piece.countries.length > 0, `${piece.id} must belong to some country`);
    for (const country of piece.countries) {
      assert.ok(isCountryId(country), `${piece.id} declares unknown country ${country}`);
    }
  }
});

test("S26: the default country is England", () => {
  assert.equal(DEFAULT_COUNTRY, "inglaterra");
  assert.deepEqual(COUNTRIES, ["inglaterra", "espana", "portugal", "paises-bajos"]);
  assert.equal(normaliseCountry(undefined), "inglaterra");
});

/* ---------------------------------------------------------------- hull catalogues (S27) */

test("S27: England has six hulls", () => {
  assert.deepEqual(hullIds("inglaterra"), [
    "galeon-pequeno",
    "galeon-guerra",
    "gran-buque-real",
    "barca-costera",
    "pinaza",
    "bark-armado",
  ]);
});

test("S27: Spain has five hulls, including the galleass", () => {
  assert.deepEqual(hullIds("espana"), [
    "patache",
    "zabra",
    "nao-armada",
    "galeaza",
    "gran-galeon",
  ]);
});

test("S27: Portugal has two hulls", () => {
  assert.deepEqual(hullIds("portugal"), ["carabela-latina", "gran-galeon"]);
});

test("S27: the Netherlands has three hulls", () => {
  assert.deepEqual(hullIds("paises-bajos"), ["jacht", "fluyt", "gran-mercante"]);
});

test("S27: the galleass is Spanish only and the great galleon is Spanish and Portuguese", () => {
  const galleass = HULLS.find((hull) => hull.id === "galeaza");
  assert.deepEqual(galleass.countries, ["espana"]);
  const greatGalleon = HULLS.find((hull) => hull.id === "gran-galeon");
  assert.deepEqual(greatGalleon.countries, ["espana", "portugal"]);
});

test("S27: the lookups return the data entries in data order", () => {
  const hulls = availableHulls("espana");
  assert.equal(hulls[0], HULLS.find((hull) => hull.id === "patache"));
  assert.deepEqual(ids(hulls), ids(HULLS.filter((hull) => hull.countries.includes("espana"))));
});

/* ---------------------------------------------------------------- piece catalogues (S29) */

test("S29: the minion is English and Dutch only", () => {
  assert.deepEqual(pieceIds("inglaterra").includes("minion"), true);
  assert.deepEqual(pieceIds("paises-bajos").includes("minion"), true);
  assert.equal(pieceIds("espana").includes("minion"), false);
  assert.equal(pieceIds("portugal").includes("minion"), false);
});

test("S29: the 60-pounder and the sacre are not Dutch", () => {
  assert.equal(pieceIds("paises-bajos").includes("canon-60"), false);
  assert.equal(pieceIds("paises-bajos").includes("sacre"), false);
  assert.equal(pieceIds("inglaterra").includes("canon-60"), true);
  assert.equal(pieceIds("espana").includes("canon-60"), true);
  assert.equal(pieceIds("portugal").includes("canon-60"), true);
});

test("S29: the 40-pounder and the rest are available everywhere", () => {
  const shared = [
    "canon-40",
    "medio-canon-32",
    "culebrina-18",
    "media-culebrina-9",
    "falcon",
    "falconete",
    "pedrero",
    "verso",
  ];
  for (const country of COUNTRIES) {
    for (const piece of shared) {
      assert.ok(pieceIds(country).includes(piece), `${country} is missing ${piece}`);
    }
  }
});

/* ---------------------------------------------------------------- unknown countries */

test("S26: an unknown or missing country falls back to the default and never throws", () => {
  assert.deepEqual(hullIds("atlantida"), hullIds(DEFAULT_COUNTRY));
  assert.deepEqual(pieceIds(undefined), pieceIds(DEFAULT_COUNTRY));
  assert.deepEqual(hullIds(null), hullIds(DEFAULT_COUNTRY));
  assert.deepEqual(hullIds(""), hullIds(DEFAULT_COUNTRY));
  assert.equal(normaliseCountry("atlantida"), DEFAULT_COUNTRY);
  assert.equal(isCountryId("atlantida"), false);
  assert.equal(isCountryId("espana"), true);
});

/* ---------------------------------------------------------------- the new English hulls (S28) */

test("S28: the three new English hulls exist and are English only", () => {
  for (const id of ["barca-costera", "pinaza", "bark-armado"]) {
    const hull = HULLS.find((entry) => entry.id === id);
    assert.ok(hull, `${id} is missing`);
    assert.deepEqual(hull.countries, ["inglaterra"]);
    assert.equal(hull.draftSource, "derived");
    assert.ok(hull.provenance.includes("convenci"), `${id} must declare its convention`);
    assert.ok(hull.priceGold > 0);
  }
});

test("S28: each new English hull builds into a feasible ship with a cheap loadout", () => {
  for (const id of ["barca-costera", "pinaza", "bark-armado"]) {
    const hull = HULLS.find((entry) => entry.id === id);
    const ship = buildShip(cheapLoadout(hull), STARTING_GOLD);
    assert.ok(ship, `${id} must build`);
    assert.deepEqual(ship.errors, [], `${id} must be feasible`);
    assert.ok(ship.affordable, `${id} must be affordable with ${STARTING_GOLD} gold`);
  }
});

test("S28: the coastal bark is the cheapest hull in the game", () => {
  const cheapest = Math.min(...HULLS.map((hull) => hull.priceGold));
  const bark = HULLS.find((hull) => hull.id === "barca-costera");
  assert.equal(bark.priceGold, cheapest);
  assert.equal(
    HULLS.filter((hull) => hull.priceGold === cheapest).length,
    1,
    "the coastal bark must be strictly cheaper than every other hull",
  );
  assert.ok(minimumShipPrice("barca-costera") < minimumShipPrice("jacht"));
});

/* ---------------------------------------------------------------- every country is playable */

test("S26: every country can build at least one feasible ship within the starting gold", () => {
  for (const country of COUNTRIES) {
    const playable = availableHulls(country).filter((hull) => {
      const ship = buildShip(cheapLoadout(hull), STARTING_GOLD);
      return ship && ship.feasible && ship.affordable;
    });
    assert.ok(playable.length > 0, `${country} cannot build any ship with ${STARTING_GOLD}`);
  }
});

test("S26: every country has at least one affordable piece", () => {
  for (const country of COUNTRIES) {
    assert.ok(availablePieces(country).length > 0, `${country} has no ordnance`);
  }
});
