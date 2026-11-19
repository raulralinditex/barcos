/**
 * S140: the level owns the enemy quota.
 *
 * User decisions (verbatim): "Sin reposición, el nivel manda (Recomendada)" and "Crece
 * 1,5× por nivel". S139 already made a defeated enemy stay defeated; this is the other
 * half: the zone's density is no longer a licence to spawn enemies at all.
 *
 * S150 superseded two of these rules and the player approved updating them: the level now
 * caps each zone and refills the water it is in, and it advances on victories instead of on
 * an empty sea. What S140 still owns, and what is still proven here, is the curve itself and
 * the fact that a seeded quota is exactly the level's.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { enemiesForLevel, enemiesPerZone, victoriesForLevel } from "../src/model/levels.js";
import {
  ZONE_BANDS,
  createWorld,
  defeatedEnemyIds,
  deserializeWorld,
  levelRemaining,
  markDefeated,
  recordVictory,
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

test("S140/S150: the zone's density no longer tops the enemies up, the level's cap does", () => {
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
  // S150: the abyss fills to the level's cap and stops there. The zone's own share is not
  // the number of hostiles; the level is.
  const inAbyss = sailed.encounters.filter((e) => e.type === "enemy" && e.zoneId === "abismo");
  assert.equal(inAbyss.length, enemiesPerZone(sailed.level), "the level's cap did not hold");
  assert.equal(sailed.level, 1, "the level advanced without a single victory");
});

test("S140/S150: a beaten enemy is replaced by one of her own water, up to the cap", () => {
  let world = createWorld(11, ship);
  const first = world.levelEnemies[0];
  world = recordVictory({ ...world, encounters: world.encounters.filter((e) => e.id !== first) }, { type: "enemy" });
  world = markDefeated(world, first);
  for (let i = 0; i < 120; i += 1) world = updateWorld(world, {}, 0.1);
  // S150: the water she was in is topped back up, but never with her own id and never
  // past the cap.
  const afloat = world.encounters.filter((e) => e.type === "enemy");
  assert.ok(!afloat.some((e) => e.id === first), "the beaten sail came back herself");
  assert.equal(afloat.length, enemiesPerZone(world.level), "the cap was not filled");
  assert.equal(world.level, 1, "one victory of three advanced the level");
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

test("S140/S150: the victories the level asks for advance it, once, and seed the next quota", () => {
  let world = createWorld(11, ship);
  const target = victoriesForLevel(1);
  // Win the fights the level asks for, one at a time, the way the sea counts them.
  for (let i = 0; i < target; i += 1) {
    const victim = world.encounters.find((e) => e.type === "enemy");
    world = recordVictory({ ...world, encounters: world.encounters.filter((e) => e.id !== victim.id) }, victim);
    world = markDefeated(world, victim.id);
  }
  assert.equal(world.levelVictories, target);

  const cleared = updateWorld(world, {}, 0);
  assert.equal(cleared.level, 2, "reaching the victories did not advance the level");
  assert.equal(cleared.levelVictories, 0, "the new level inherited the victories of the old one");
  assert.equal(cleared.levelEnemies.length, enemiesPerZone(2));
  assert.equal(enemiesOf(cleared).length, enemiesPerZone(2), "the next level was not seeded");

  // Many more ticks: the level advances once per target, never twice.
  let later = cleared;
  for (let i = 0; i < 120; i += 1) later = updateWorld(later, {}, 0.1);
  assert.equal(later.level, 2, "the level advanced twice for one clear");
  assert.ok(enemiesOf(later).length <= enemiesPerZone(2));
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

test("S140/S150: the level survives the save, and an old or broken save opens at level 1", () => {
  let world = createWorld(11, ship);
  world = { ...world, level: 2, levelVictories: 3, levelEnemies: [] };
  world = seedLevel(world, 2);
  world = { ...world, levelVictories: 2 };

  const back = deserializeWorld(serializeWorld(world));
  assert.equal(back.level, 2, "the level did not survive the save");
  assert.equal(back.levelVictories, 2, "the victories did not survive the save");
  assert.deepEqual(back.levelEnemies, world.levelEnemies);

  // A save written before levels existed: no level, no record. It opens at level 1 with
  // the sails it already had, and the sea does not seed a second quota on top of them.
  const fresh = createWorld(11, ship);
  const old = JSON.parse(serializeWorld(fresh));
  delete old.level;
  delete old.levelEnemies;
  delete old.levelVictories;
  const reopened = deserializeWorld(JSON.stringify(old));
  assert.equal(reopened.level, 1, "an old save did not open at level 1");
  assert.equal(reopened.levelVictories, 0, "an old save must open with no victories");
  assert.deepEqual(reopened.levelEnemies, []);
  const ticked = updateWorld(reopened, {}, 0);
  assert.equal(ticked.level, 1);
  assert.equal(enemiesOf(ticked).length, 3, "an old save was seeded a second quota");
  assert.equal(levelRemaining(ticked), 3, "the sails of an old save are not part of its level");

  const broken = JSON.parse(serializeWorld(world));
  broken.level = "tres";
  broken.levelEnemies = "nada";
  broken.levelVictories = "muchas";
  const repaired = deserializeWorld(JSON.stringify(broken));
  assert.equal(repaired.level, 1, "a broken level did not open at level 1");
  assert.equal(repaired.levelVictories, 0, "a broken count did not open at zero");
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
