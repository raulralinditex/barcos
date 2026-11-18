/**
 * S140: the level owns the enemy quota.
 *
 * User decisions (verbatim): "Sin reposición, el nivel manda (Recomendada)" and "Crece
 * 1,5× por nivel". S139 already made a defeated enemy stay defeated; this is the other
 * half: the zone's density is no longer a licence to spawn enemies at all, and clearing
 * a level advances it exactly once.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { enemiesForLevel } from "../src/model/levels.js";
import {
  ZONE_BANDS,
  createWorld,
  defeatedEnemyIds,
  deserializeWorld,
  levelRemaining,
  markDefeated,
  seedLevel,
  serializeWorld,
  updateWorld,
  zoneAtRadius,
} from "../src/model/world.js";

const ship = { speedKn: 6 };
const enemiesOf = (world) => world.encounters.filter((entry) => entry.type === "enemy");

/** Defeat an enemy the way the sea does: drop her from the sea and remember her id. */
const defeat = (world, id) => {
  const dropped = { ...world, encounters: world.encounters.filter((entry) => entry.id !== id) };
  return markDefeated(dropped, id);
};

test("S140: a fresh sea seeds exactly the level's quota, and level 1 is three sails", () => {
  const world = createWorld(11, ship);
  assert.equal(world.level, 1);
  assert.equal(enemiesOf(world).length, 3);
  assert.equal(levelRemaining(world), 3);
  assert.equal(world.levelEnemies.length, enemiesForLevel(1));
  for (const enemy of enemiesOf(world)) assert.equal(enemy.level, 1, "a seeded enemy is not tagged with her level");
});

test("S140: seedLevel seeds exactly the quota of the level it is handed", () => {
  const seeded = seedLevel(createWorld(11, ship), 3);
  assert.equal(seeded.level, 3);
  assert.equal(seeded.levelEnemies.length, enemiesForLevel(3));
  assert.equal(seeded.levelEnemies.length, 7);
  assert.equal(levelRemaining(seeded), 7);
  for (const enemy of enemiesOf(seeded)) assert.equal(enemy.level, 3);
  // Seeding never hands out an id twice.
  assert.equal(new Set(seeded.levelEnemies).size, seeded.levelEnemies.length);
});

test("S140: the zone's density no longer tops the enemies up", () => {
  // Sail the whole sea into the abyss band, where the old density wanted 13 hostiles.
  const world = createWorld(11, ship);
  const moved = {
    ...world,
    ship: { ...world.ship, x: 5000, y: 0, currentSpeedKn: 0 },
    encounters: world.encounters.map((entry) => ({ ...entry, x: entry.x + 5000 })),
  };
  assert.equal(zoneAtRadius(5000).id, "abismo");
  assert.ok(
    Math.round(zoneAtRadius(5000).encounters * zoneAtRadius(5000).enemyShare) > 3,
    "the old zone density would have wanted more than three sails",
  );
  let sailed = moved;
  for (let i = 0; i < 120; i += 1) sailed = updateWorld(sailed, {}, 0.1);
  assert.equal(enemiesOf(sailed).length, 3, "the zone density brought sails back");
  assert.equal(levelRemaining(sailed), 3);
  assert.equal(sailed.level, 1);
});

test("S140: a defeated enemy is never replaced, so the quota shrinks as it is beaten", () => {
  let world = createWorld(11, ship);
  const first = world.levelEnemies[0];
  world = defeat(world, first);
  for (let i = 0; i < 120; i += 1) world = updateWorld(world, {}, 0.1);
  assert.equal(enemiesOf(world).length, 2, "the beaten sail came back");
  assert.equal(levelRemaining(world), 2);
  assert.equal(world.level, 1, "the level advanced with two sails still afloat");
});

test("S140: treasures keep their top-up", () => {
  const world = createWorld(11, ship);
  const zone = zoneAtRadius(Math.hypot(world.ship.x, world.ship.y));
  const want = Math.max(0, zone.encounters - enemiesForLevel(1));
  assert.equal(world.encounters.filter((entry) => entry.type === "treasure").length, want);
  // Loot them all, then tick: the sea restocks them, exactly as before.
  const looted = { ...world, encounters: enemiesOf(world) };
  const restocked = updateWorld(looted, {}, 0);
  assert.equal(restocked.encounters.filter((entry) => entry.type === "treasure").length, want);
});

test("S140: clearing the level advances once and seeds the next quota", () => {
  let world = createWorld(11, ship);
  for (const id of [...world.levelEnemies]) world = defeat(world, id);
  assert.equal(levelRemaining(world), 0);

  const cleared = updateWorld(world, {}, 0);
  assert.equal(cleared.level, 2, "clearing the level did not advance it");
  assert.equal(cleared.levelEnemies.length, 5);
  assert.equal(enemiesOf(cleared).length, 5, "the next quota was not seeded");
  assert.equal(levelRemaining(cleared), 5);

  // Many more ticks: the level advances once per clear, never twice.
  let later = cleared;
  for (let i = 0; i < 120; i += 1) later = updateWorld(later, {}, 0.1);
  assert.equal(later.level, 2, "the level advanced twice for one clear");
  assert.equal(enemiesOf(later).length, 5);
});

test("S140: levelRemaining counts the level's own enemies, and a defeated id counts as done", () => {
  let world = createWorld(11, ship);
  assert.equal(levelRemaining(world), 3);
  world = markDefeated(world, world.levelEnemies[0]);
  assert.equal(levelRemaining(world), 2, "a defeated id was not counted as done");
  world = defeat(world, world.levelEnemies[1]);
  assert.equal(levelRemaining(world), 1);
  assert.deepEqual([...defeatedEnemyIds(world)].length, 2);
  // A sea with no level record has nothing left to clear, it never throws.
  assert.equal(levelRemaining({}), 0);
  assert.equal(levelRemaining(null), 0);
});

test("S140: the level survives the save, and an old or broken save opens at level 1", () => {
  let world = createWorld(11, ship);
  for (const id of [...world.levelEnemies]) world = defeat(world, id);
  world = updateWorld(world, {}, 0);
  assert.equal(world.level, 2);

  const back = deserializeWorld(serializeWorld(world));
  assert.equal(back.level, 2, "the level did not survive the save");
  assert.deepEqual(back.levelEnemies, world.levelEnemies);

  // A save written before levels existed: no level, no record. It opens at level 1 with
  // the sails it already had, and the sea does not seed a second quota on top of them.
  const fresh = createWorld(11, ship);
  const old = JSON.parse(serializeWorld(fresh));
  delete old.level;
  delete old.levelEnemies;
  const reopened = deserializeWorld(JSON.stringify(old));
  assert.equal(reopened.level, 1, "an old save did not open at level 1");
  assert.deepEqual(reopened.levelEnemies, []);
  const ticked = updateWorld(reopened, {}, 0);
  assert.equal(ticked.level, 1);
  assert.equal(enemiesOf(ticked).length, 3, "an old save was seeded a second quota");
  assert.equal(levelRemaining(ticked), 3, "the sails of an old save are not part of its level");

  const broken = JSON.parse(serializeWorld(world));
  broken.level = "tres";
  broken.levelEnemies = "nada";
  const repaired = deserializeWorld(JSON.stringify(broken));
  assert.equal(repaired.level, 1, "a broken level did not open at level 1");
  assert.deepEqual(repaired.levelEnemies, []);
});

test("S140: the zone bands still describe the water, not the number of enemies", () => {
  // The band keeps its own encounter count (that is what the treasures follow), but the
  // enemy share is no longer a spawner: the level is.
  for (const band of ZONE_BANDS) {
    assert.ok(band.encounters > 0);
    assert.ok(band.enemyShare >= 0 && band.enemyShare <= 1);
  }
});
