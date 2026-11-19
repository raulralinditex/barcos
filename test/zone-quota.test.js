/**
 * S150: a level caps the enemies of every zone, replaces the ones you beat in the water
 * where you beat them, and advances on victories instead of on an empty sea.
 *
 * The player's words (verbatim): "los barcos enemigos siguen apareciendo con el tiempo sin
 * ningun limite", "en cada nivel habra un maximo de enemigos por zona, y se crearan los
 * enemigos de la misma zona que hayan sido undidos o capturados". His decisions (verbatim):
 * "Por cantidad de victorias" to advance, and "ok" to reusing the 3, 5, 7, 10 curve for both
 * the cap per zone and the victories a level asks for.
 *
 * The bug this closes is measured here too: before S150 the level advanced when the level's
 * sails vanished from `encounters`, and a sail that merely drifted past `despawnRadiusM`
 * vanished. So a captain who never fired a shot climbed levels and the sea kept filling.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { enemiesForLevel, enemiesPerZone, victoriesForLevel } from "../src/model/levels.js";
import {
  ZONE_BANDS,
  createWorld,
  deserializeWorld,
  recordVictory,
  seedLevel,
  serializeWorld,
  updateWorld,
  zoneAtRadius,
} from "../src/model/world.js";

const ship = { speedKn: 6 };
const enemiesOf = (world) => world.encounters.filter((entry) => entry.type === "enemy");
const inZone = (world, zoneId) => enemiesOf(world).filter((entry) => entry.zoneId === zoneId);

/** Beat a sail the way the sea does: take her out of `encounters` and record the victory. */
const beat = (world, id) => {
  const encounter = world.encounters.find((entry) => entry.id === id);
  const dropped = { ...world, encounters: world.encounters.filter((entry) => entry.id !== id) };
  return recordVictory(dropped, encounter);
};

/** Sail in place for `seconds`, in steps of a tenth of a second. */
const sail = (world, seconds) => {
  let sailed = world;
  for (let i = 0; i < Math.round(seconds * 10); i += 1) sailed = updateWorld(sailed, {}, 0.1);
  return sailed;
};

/** Move the captain (and everything afloat with her) to the abyss band. */
const toTheAbyss = (world) => {
  const dx = 5000 - world.ship.x;
  return {
    ...world,
    ship: { ...world.ship, x: 5000, y: 0 },
    encounters: world.encounters.map((entry) => ({ ...entry, x: entry.x + dx, y: entry.y })),
  };
};

test("S150: a level caps the enemies of a zone with the same curve as the quota", () => {
  for (const level of [1, 2, 3, 4, 6]) {
    assert.equal(enemiesPerZone(level), enemiesForLevel(level));
    assert.equal(victoriesForLevel(level), enemiesForLevel(level));
  }
  assert.equal(enemiesPerZone(1), 3);
  assert.equal(enemiesPerZone(2), 5);
  // Junk is level 1, never a broken cap.
  for (const junk of [undefined, null, NaN, "tres", -4, {}]) {
    assert.equal(enemiesPerZone(junk), 3, `enemiesPerZone(${String(junk)}) must be the level 1 cap`);
  }
});

test("S150: a fresh sea fills the water the captain is in, and no other water", () => {
  const world = createWorld(11, ship);
  const here = zoneAtRadius(Math.hypot(world.ship.x, world.ship.y));
  assert.equal(here.id, "costera");
  assert.equal(inZone(world, "costera").length, enemiesPerZone(1));
  for (const band of ZONE_BANDS) {
    if (band.id === "costera") continue;
    assert.equal(inZone(world, band.id).length, 0, `the ${band.id} was filled without the captain there`);
  }
});

test("S150: a beaten sail is replaced by one of her own zone, up to the cap", () => {
  let world = createWorld(11, ship);
  const first = inZone(world, "costera")[0];
  world = beat(world, first.id);
  assert.equal(inZone(world, "costera").length, 2, "beating her must leave two afloat");

  world = updateWorld(world, {}, 0.1);
  assert.equal(inZone(world, "costera").length, 3, "the loss was not replaced");
  assert.ok(!world.encounters.some((entry) => entry.id === first.id), "the beaten sail came back herself");
  assert.ok(enemiesOf(world).every((entry) => entry.zoneId === "costera"), "a replacement came from another water");

  // Beat them one at a time, over and over: the water never grows past the cap.
  for (let round = 0; round < 12; round += 1) {
    const victim = inZone(world, "costera")[0];
    world = beat(world, victim.id);
    world = updateWorld(world, {}, 0.1);
    assert.ok(
      inZone(world, "costera").length <= enemiesPerZone(world.level),
      `the costera grew to ${inZone(world, "costera").length} on round ${round}`,
    );
  }
  assert.equal(inZone(world, "costera").length, enemiesPerZone(world.level));
});

test("S150: a water the captain left is not refilled behind her back", () => {
  let world = createWorld(11, ship);
  world = beat(world, inZone(world, "costera")[0].id);
  assert.equal(inZone(world, "costera").length, 2, "beating her must leave two afloat");

  // Sail to the abyss before the sea can tick in the costera: her loss is not replaced,
  // because the costera is not the water the captain is in any more.
  world = sail(toTheAbyss(world), 1);
  assert.equal(inZone(world, "costera").length, 2, "a water the captain left replaced her losses");

  // And coming back fills the costera to its cap like any water she is in: one sail, not
  // the whole debt of the water she left.
  const back = { ...world, ship: { ...world.ship, x: 210, y: 70 } };
  const returned = sail(back, 1);
  assert.equal(inZone(returned, "costera").length, enemiesPerZone(returned.level));
});

test("S150: the level advances on victories, not on an empty sea", () => {
  let world = createWorld(11, ship);
  const target = victoriesForLevel(world.level);
  assert.equal(world.levelVictories, 0);

  // One short of the target: the level holds.
  world = { ...world, levelVictories: target - 1 };
  world = updateWorld(world, {}, 0.1);
  assert.equal(world.level, 1, "the level advanced one victory early");

  world = beat(world, inZone(world, "costera")[0].id);
  assert.equal(world.levelVictories, target, "a victory was not counted");
  world = updateWorld(world, {}, 0.1);
  assert.equal(world.level, 2, "reaching the victory target did not advance the level");
  assert.equal(world.levelVictories, 0, "the new level inherited the victories of the old one");
  assert.equal(inZone(world, "costera").length, enemiesPerZone(2), "the new level was not seeded");
});

test("S150: a captain who never fires a shot never advances, and the sea never grows", () => {
  let world = createWorld(11, ship);
  // The reported bug: 677 one-second updates climbed from level 1 to level 2 with nobody
  // beaten. Sails drift past `despawnRadiusM`, the level reads empty, and it advanced.
  world = sail(world, 700);
  assert.equal(world.level, 1, "the level advanced with no victories");
  assert.ok(
    enemiesOf(world).length <= enemiesPerZone(world.level),
    `the sea grew to ${enemiesOf(world).length} sails without a single fight`,
  );
});

test("S150: the victories survive the save, and an old save opens at zero", () => {
  let world = createWorld(11, ship);
  world = beat(world, inZone(world, "costera")[0].id);
  const back = deserializeWorld(serializeWorld(world));
  assert.equal(back.levelVictories, 1, "the victories did not survive the save");

  // A save written before S150 knows no victories.
  const old = JSON.parse(serializeWorld(createWorld(11, ship)));
  delete old.levelVictories;
  const reopened = deserializeWorld(JSON.stringify(old));
  assert.equal(reopened.levelVictories, 0, "an old save must open with no victories");
  assert.equal(sail(reopened, 1).level, 1);

  // A broken count is not a licence to advance: it reads as none.
  const broken = JSON.parse(serializeWorld(world));
  broken.levelVictories = -3;
  assert.equal(deserializeWorld(JSON.stringify(broken)).levelVictories, 0);
  broken.levelVictories = "muchas";
  assert.equal(deserializeWorld(JSON.stringify(broken)).levelVictories, 0);
});

test("S150: seeding a level starts its victory count clean", () => {
  const world = { ...createWorld(11, ship), levelVictories: 9 };
  const seeded = seedLevel(world, 3);
  assert.equal(seeded.level, 3);
  assert.equal(seeded.levelVictories, 0, "the new level inherited the victories of the old one");
  assert.equal(inZone(seeded, "costera").length, enemiesPerZone(3));
});

test("S150: a replacement never takes an id the sea is already using", () => {
  // A save can carry a `nextId` that sits behind a sail still afloat (a hand-written save, an
  // older writer). Handing that id to a replacement put two sails under one name, and the
  // panel and the combat pass read the wrong one.
  const world = createWorld(11, ship);
  const afloat = inZone(world, "costera");
  const lowest = Math.min(...afloat.map((entry) => entry.id));
  const stale = { ...world, nextId: lowest };
  const sailed = updateWorld(stale, {}, 0.1);
  const ids = enemiesOf(sailed).map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, `two sails answer to one id: ${ids.join(", ")}`);
  assert.equal(ids.length, enemiesPerZone(sailed.level));
});

/* ------------------------------------------------------------------ S162 */

test("S162: seeding a new level does not erase a prize that struck", () => {
  // The bug: `seedLevel` dropped every sail of the previous level, including one that had
  // already struck her colours and was waiting to be boarded. Measured on the real screen:
  // the enemy went from `hull 95` to gone in one tick, was never recorded as defeated, and
  // the capture the player had earned simply vanished.
  const world = createWorld(4, { speedKn: 6 }, 0);
  const struck = {
    id: 501,
    type: "enemy",
    x: 260,
    y: 80,
    hullId: "patache",
    zoneId: "costera",
    level: 1,
    engaged: true,
    heading: 0,
    currentSpeedKn: 0,
    drift: { heading: 0, speedKn: 1 },
    combat: {
      status: "surrendered",
      condition: { hull: 51, rigging: 95, crew: 30, morale: 100 },
      crew: { marino: 14, artillero: 2, soldado: 4 },
      initialCrew: 20,
      crewMin: 6,
      pieces: [],
      hullToughness: 1,
    },
  };
  const withPrize = { ...world, encounters: [struck] };

  const next = seedLevel(withPrize, 2);

  const survivor = next.encounters.find((entry) => entry.id === 501);
  assert.ok(survivor, "a prize that struck her colours must survive the new level");
  assert.equal(survivor.combat?.status, "surrendered", "she must still be a prize");
});

test("S162: a sail still in the fight is not erased by the new level either", () => {
  const world = createWorld(4, { speedKn: 6 }, 0);
  const fighting = {
    id: 502,
    type: "enemy",
    x: 260,
    y: 80,
    hullId: "patache",
    zoneId: "costera",
    level: 1,
    engaged: true,
    heading: 0,
    currentSpeedKn: 0,
    drift: { heading: 0, speedKn: 1 },
    combat: {
      status: "fighting",
      condition: { hull: 80, rigging: 90, crew: 90, morale: 100 },
      crew: { marino: 14, artillero: 2, soldado: 4 },
      initialCrew: 20,
      crewMin: 6,
      pieces: [],
      hullToughness: 1,
    },
  };
  const next = seedLevel({ ...world, encounters: [fighting] }, 2);
  assert.ok(
    next.encounters.some((entry) => entry.id === 502),
    "a hull mid-fight must not be erased under the player's guns",
  );
});

test("S162: a sail of the previous level that is still drifting is still cleared", () => {
  // The rule the old filter was for: the level owns its quota, so a sail from the level just
  // finished does not linger on the new one. Only the ones still in play are kept.
  const world = createWorld(4, { speedKn: 6 }, 0);
  const drifting = {
    id: 503,
    type: "enemy",
    x: 2000,
    y: 0,
    hullId: "patache",
    zoneId: "costera",
    level: 1,
    heading: 0,
    currentSpeedKn: 0,
    drift: { heading: 0, speedKn: 1 },
  };
  const next = seedLevel({ ...world, encounters: [drifting] }, 2);
  assert.equal(
    next.encounters.some((entry) => entry.id === 503),
    false,
    "an untouched sail of the old level must not carry over",
  );
  assert.equal(next.level, 2);
});
