import test from "node:test";
import assert from "node:assert/strict";

import { ammoById, hullById, pieceById } from "../src/data/naval-data.js";
import { garrisonSurrenderPct } from "../src/model/boarding.js";
import {
  COMBAT,
  accuracyModifier,
  aiStep,
  angleDiff,
  applyDamage,
  bearingTo,
  createEnemyCombatant,
  createPlayerCombatant,
  damageRoll,
  firingPieces,
  fireBroadside,
  hitProbability,
  maneuverFactor,
  preferredRange,
  reloadFactor,
  sideForBearing,
  speedFactor,
  tickCombatant,
  wreckPrize,
} from "../src/model/combat.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { mulberry32 } from "../src/model/world.js";

const seededRnd = (seed) => {
  let state = seed >>> 0;
  return () => {
    const r = mulberry32(state);
    state = r.state;
    return r.value;
  };
};

const starterRuntimeShip = () => {
  const ship = buildShip(
    {
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
    },
    12000,
  );
  return toRuntimeShip(ship, { name: "Golden Hind" });
};

/* ---------------------------------------------------------------- geometry */

test("S4: a target on the beam bears on the matching side only", () => {
  // ship faces east (heading 0); starboard is south (+90°), port is north (-90°)
  assert.equal(sideForBearing(0, Math.PI / 2), "estribor");
  assert.equal(sideForBearing(0, -Math.PI / 2), "babor");
});

test("S4: a target dead ahead or astern bears on no side", () => {
  assert.equal(sideForBearing(0, 0), null);
  assert.equal(sideForBearing(0, Math.PI), null);
  assert.equal(sideForBearing(0, -Math.PI), null);
});

test("S4: the arc wraps correctly around the ±180° line", () => {
  // ship faces west; a target 30° south of the west line lies on its port side
  assert.equal(sideForBearing(Math.PI, Math.PI - Math.PI / 3), "babor");
  // and 30° north of the west line lies on its starboard side
  assert.equal(sideForBearing(Math.PI, -Math.PI + Math.PI / 3), "estribor");
});

test("angleDiff is the signed smallest rotation", () => {
  assert.ok(Math.abs(angleDiff(0.1, -0.1) - 0.2) < 1e-9);
  assert.ok(Math.abs(angleDiff(-Math.PI + 0.1, Math.PI - 0.1) - 0.2) < 1e-9);
});

test("bearingTo and distanceBetween agree with the axes", () => {
  assert.equal(bearingTo({ x: 0, y: 0 }, { x: 10, y: 0 }), 0);
  assert.equal(bearingTo({ x: 0, y: 0 }, { x: 0, y: 10 }), Math.PI / 2);
});

/* ---------------------------------------------------------------- combatants */

test("S4: the player combatant expands one instance per gun, per side", () => {
  const combatant = createPlayerCombatant(starterRuntimeShip());
  assert.equal(combatant.pieces.length, 10);
  assert.equal(combatant.pieces.filter((p) => p.side === "babor").length, 5);
  assert.equal(combatant.pieces.filter((p) => p.side === "estribor").length, 5);
  assert.equal(combatant.condition.hull, 100);
  assert.equal(combatant.initialCrew, 70);
});

test("S4: enemy generation is deterministic and respects the hull's gun limit", () => {
  const encounter = { id: 7, hullId: "patache", type: "enemy" };
  const a = createEnemyCombatant(encounter, { danger: 1 }, 42);
  const b = createEnemyCombatant(encounter, { danger: 1 }, 42);
  assert.deepEqual(a, b);
  assert.ok(a.pieces.length <= hullById("patache").maxPiecesPerSide * 2);
  assert.ok(a.pieces.some((p) => p.side === "babor"));
  assert.ok(a.pieces.some((p) => p.side === "estribor"));
});

test("S6: the same hull carries more and heavier guns in deeper water", () => {
  const encounter = { id: 9, hullId: "galeon-guerra", type: "enemy" };
  const coastal = createEnemyCombatant(encounter, { id: "costera", danger: 1 }, 5);
  const abyss = createEnemyCombatant(encounter, { id: "abismo", danger: 4 }, 5);
  assert.ok(abyss.pieces.length > coastal.pieces.length);

  const weightOf = (combatant) =>
    combatant.pieces.reduce((sum, p) => sum + pieceById(p.pieceId).shotKg, 0) /
    combatant.pieces.length;
  assert.ok(weightOf(abyss) > weightOf(coastal));
});

test("S6: coastal water is the safe zone, so its corsairs carry light guns", () => {
  // Regression guard: the coastal pool must never field heavy ordnance, or a
  // starter ship cannot survive the band the spec calls safe.
  const heavy = ["media-culebrina-9", "culebrina-18", "medio-canon-32", "canon-40"];
  for (const hullId of ["patache", "zabra", "fluyt", "galeon-pequeno"]) {
    const enemy = createEnemyCombatant(
      { id: 11, hullId, type: "enemy", zoneId: "costera" },
      { id: "costera", danger: 1 },
      7,
    );
    for (const piece of enemy.pieces) {
      assert.ok(
        !heavy.includes(piece.pieceId),
        `${hullId} in coastal water mounted ${piece.pieceId}`,
      );
    }
  }
});

/* ---------------------------------------------------------------- gunnery */

test("S4: only the facing side, loaded, in range and with rounds can fire", () => {
  const combatant = createPlayerCombatant(starterRuntimeShip());
  // The falcons are loaded with hailshot, which does not carry as far as iron (S68): at
  // 300 m only the three iron minions reach the target.
  const ready = firingPieces(combatant, "babor", 300);
  assert.equal(ready.length, 3);
  assert.ok(ready.every((p) => p.pieceId === "minion"));
  // Inside the hailshot range the whole beam answers, falcons included.
  assert.equal(firingPieces(combatant, "babor", 100).length, 5);
  // Beyond the minions' own reach nothing does.
  assert.equal(firingPieces(combatant, "babor", 400).length, 0);
  assert.equal(firingPieces(combatant, "estribor", 100).length, 5);
});

test("S4: a broadside spends one round per gun and starts its reload clock", () => {
  const combatant = createPlayerCombatant(starterRuntimeShip());
  // Inside the hailshot range, so the whole beam fires (S68).
  const { volley } = fireBroadside(combatant, "babor", 100, seededRnd(1));
  assert.equal(volley.length, 5);
  for (const p of combatant.pieces.filter((x) => x.side === "babor")) {
    const piece = pieceById(p.pieceId);
    const expected = piece.reloadS / 1.3 / COMBAT.timeScale; // surplus crew reaches the cap
    assert.ok(Math.abs(p.reloadTimer - expected) < 1e-9);
    assert.equal(p.shotsLeft, p.pieceId === "minion" ? 24 : 29);
  }
  // estribor untouched
  for (const p of combatant.pieces.filter((x) => x.side === "estribor")) {
    assert.equal(p.reloadTimer, 0);
    assert.equal(p.shotsLeft, p.pieceId === "minion" ? 25 : 30);
  }
});

test("S4: while the reload clock runs the guns stay silent", () => {
  const combatant = createPlayerCombatant(starterRuntimeShip());
  fireBroadside(combatant, "babor", 200, seededRnd(1));
  const { volley } = fireBroadside(combatant, "babor", 200, seededRnd(1));
  assert.equal(volley.length, 0);
  tickCombatant(combatant, 30);
  const { volley: after } = fireBroadside(combatant, "babor", 200, seededRnd(1));
  assert.ok(after.length > 0);
});

test("S4: hit probability falls with distance and is zero beyond range", () => {
  const minion = pieceById("minion");
  assert.equal(hitProbability(minion, minion.rangeM + 1), 0);
  assert.ok(hitProbability(minion, 10) > hitProbability(minion, minion.rangeM * 0.8));
  assert.ok(hitProbability(minion, 10) <= COMBAT.baseAccuracy);
});

test("S53: fewer gunners remove guns rather than slow them; none silence the guns", () => {
  const combatant = createPlayerCombatant(starterRuntimeShip());
  // Ten gunners for a ten-gun battery that asks five: spare crew, so the cap applies
  // whether or not any clock is running (S56).
  assert.equal(reloadFactor(combatant), 1 / 1.3);
  combatant.crew.artillero = 2;
  assert.equal(firingPieces(combatant, "babor", 100).length, 2);
  assert.equal(firingPieces(combatant, "estribor", 100).length, 2);
  fireBroadside(combatant, "babor", 100, () => 0);
  // Firing one beam does not shrink the denominator: with the just complement there is
  // no acceleration (S56). Spare gunners would give up to x1.3, as test/gunnery covers.
  assert.equal(reloadFactor(combatant), 1);
  combatant.crew.artillero = 0;
  assert.equal(reloadFactor(combatant), Infinity);
  assert.equal(firingPieces(combatant, "babor", 100).length, 0);
});

/* ---------------------------------------------------------------- damage (S5) */

test("S5: each ammunition splits its damage budget as declared", () => {
  const minion = pieceById("minion");
  for (const ammoId of ["bala-hierro", "cadena", "metralla"]) {
    const ammo = ammoById(ammoId);
    const damage = damageRoll(minion, ammo, 1);
    const total = minion.shotKg * ammo.massFactor * COMBAT.damageScale;
    assert.ok(Math.abs(damage.hull + damage.rigging + damage.crew - total) < 1e-9);
  }
  const iron = damageRoll(minion, ammoById("bala-hierro"), 1);
  const chain = damageRoll(minion, ammoById("cadena"), 1);
  const shot = damageRoll(minion, ammoById("metralla"), 1);
  assert.ok(iron.hull > chain.hull);
  assert.ok(chain.rigging > iron.rigging);
  assert.ok(shot.crew > iron.crew);
});

test("S5: hull damage clamps at zero and sinks the ship", () => {
  const combatant = createPlayerCombatant(starterRuntimeShip());
  const toughness = combatant.hullToughness;
  applyDamage(combatant, { hull: 60 * toughness, rigging: 0, crew: 0 });
  assert.equal(combatant.condition.hull, 40);
  assert.equal(combatant.status, "fighting");
  applyDamage(combatant, { hull: 999, rigging: 0, crew: 0 });
  assert.equal(combatant.condition.hull, 0);
  assert.equal(combatant.status, "sunk");
  // a sunk ship takes no further damage and fires no guns
  const result = applyDamage(combatant, { hull: 10, rigging: 10, crew: 10 });
  assert.equal(result.casualties, 0);
  assert.equal(firingPieces(combatant, "babor", 100).length, 0);
});

test("S6: a heavier hull absorbs the same shot better than a light one", () => {
  const light = createEnemyCombatant({ id: 7, hullId: "patache" }, { danger: 1 }, 1);
  const heavy = createEnemyCombatant({ id: 8, hullId: "gran-buque-real" }, { danger: 1 }, 1);
  assert.ok(heavy.hullToughness > light.hullToughness);

  const packet = { hull: 20, rigging: 0, crew: 0 };
  applyDamage(light, packet);
  applyDamage(heavy, packet);
  assert.ok(heavy.condition.hull > light.condition.hull);
});

test("S4: a fight can actually be finished with the rounds a loadout carries", () => {
  // Regression guard for the calibration: with the damage scale as declared, a
  // mid-sized gun deck must sink a coastal hull in a handful of broadsides.
  const player = createPlayerCombatant(starterRuntimeShip());
  const target = createEnemyCombatant({ id: 901, hullId: "zabra" }, { danger: 1 }, 424242);
  const rnd = seededRnd(9);
  let volleys = 0;
  while (target.status === "fighting" && volleys < 400) {
    const { volley } = fireBroadside(player, "estribor", 250, rnd);
    if (volley.length === 0) break;
    volleys += 1;
    for (const shot of volley) if (shot.hit) applyDamage(target, shot.damage);
    for (const piece of player.pieces) piece.reloadTimer = 0;
  }
  assert.equal(target.status, "sunk");
  assert.ok(volleys <= 15, `took ${volleys} broadsides, the scale drifted too weak`);
});

test("S5: rigging damage slows the ship; crew damage kills crew", () => {
  const combatant = createPlayerCombatant(starterRuntimeShip());
  assert.equal(speedFactor(combatant), 1);
  applyDamage(combatant, { hull: 0, rigging: 50, crew: 0 });
  assert.ok(Math.abs(speedFactor(combatant) - (0.3 + 0.35)) < 1e-9);

  const before = combatant.crew.marino + combatant.crew.artillero + combatant.crew.soldado;
  const { casualties } = applyDamage(combatant, {
    hull: 0,
    rigging: 0,
    crew: COMBAT.casualtyPoints * 6,
  });
  assert.equal(casualties, 6);
  const after = combatant.crew.marino + combatant.crew.artillero + combatant.crew.soldado;
  assert.equal(before - after, 6);
  assert.equal(combatant.condition.crew, Math.round((100 * after) / combatant.initialCrew));
});

test("S5: losing the crew below the surrender threshold strikes the colours", () => {
  // S160-D moved this rule: the threshold is not the constant any more, it is what the
  // soldiers holding the deck leave of it. A hull with no soldiers keeps exactly the
  // threshold the game always had, which is the case this test now pins.
  const combatant = createPlayerCombatant(starterRuntimeShip());
  combatant.crew.soldado = 0;
  const total = combatant.initialCrew;
  const threshold = garrisonSurrenderPct(combatant);
  assert.equal(threshold, COMBAT.surrenderCrewPct, "a hull with no soldiers breaks where it always did");
  const toKill = Math.ceil(total * (1 - threshold / 100));
  applyDamage(combatant, { hull: 0, rigging: 0, crew: toKill * COMBAT.casualtyPoints + 1 });
  assert.ok(combatant.condition.crew <= threshold);
  assert.equal(combatant.status, "surrendered");
});

test("S160-D: soldiers holding the deck make the hull harder to break", () => {
  // The same hull, with her soldiers aboard: she has to be beaten further before she strikes.
  const bare = createPlayerCombatant(starterRuntimeShip());
  bare.crew.soldado = 0;
  const defended = createPlayerCombatant(starterRuntimeShip());
  assert.ok(defended.crew.soldado > 0, "the starter hull must carry soldiers, or this test proves nothing");

  const barePct = garrisonSurrenderPct(bare);
  const defendedPct = garrisonSurrenderPct(defended);
  assert.ok(
    defendedPct < barePct,
    `soldiers must lower the threshold (${defendedPct} vs ${barePct})`,
  );

  // The rule, read where it is decided. The crew is set by hand and the status asked for,
  // because applying damage would kill soldiers and move the threshold under the test: the
  // garrison weakens as it dies, which is the behaviour, not a defect.
  const between = (barePct + defendedPct) / 2;
  bare.condition.crew = between;
  defended.condition.crew = between;
  assert.equal(bare.condition.crew <= garrisonSurrenderPct(bare), true, "a bare hull strikes here");
  assert.equal(
    defended.condition.crew <= garrisonSurrenderPct(defended),
    false,
    "a defended hull holds at the very crew level a bare one strikes at",
  );
});

test("S160-D: the garrison weakens as it dies, so the threshold follows the men alive", () => {
  // A hull that loses her soldiers ends up breaking where a bare hull does: the defence is
  // the men on the deck, not a permanent bonus.
  const combatant = createPlayerCombatant(starterRuntimeShip());
  const withSoldiers = garrisonSurrenderPct(combatant);
  combatant.crew.soldado = 0;
  assert.equal(garrisonSurrenderPct(combatant), COMBAT.surrenderCrewPct);
  assert.ok(withSoldiers < COMBAT.surrenderCrewPct);
});

test("S5: losing sailors below the hull's minimum hurts the helm", () => {
  const combatant = createPlayerCombatant(starterRuntimeShip());
  assert.equal(maneuverFactor(combatant), 1);
  combatant.crew.marino = combatant.crewMin - 1;
  combatant.condition.crew = 50;
  assert.equal(maneuverFactor(combatant), 0.5);
});

test("S5: a wounded crew shoots worse", () => {
  const combatant = createPlayerCombatant(starterRuntimeShip());
  assert.equal(accuracyModifier(combatant), 1);
  combatant.condition.crew = 50;
  assert.ok(Math.abs(accuracyModifier(combatant) - 0.85) < 1e-9);
});

/* ---------------------------------------------------------------- AI */

test("S4: the AI closes in when the player is far", () => {
  const encounter = { id: 3, hullId: "patache", type: "enemy" };
  const combat = createEnemyCombatant(encounter, { danger: 1 }, 1);
  let enemy = { x: 0, y: 0, heading: Math.PI, currentSpeedKn: 0, combat };
  const player = { x: preferredRange(enemy) * 3, y: 0 };
  const initialDistance = player.x - enemy.x;
  // the enemy starts facing away: give it time to come about and close in
  for (let i = 0; i < 20; i += 1) {
    enemy = aiStep(enemy, player, 0.5, seededRnd(i)).enemy;
  }
  const finalDistance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  assert.ok(finalDistance < initialDistance, `enemy should close in (${initialDistance} -> ${finalDistance})`);
});

test("S4: the AI swings a broadside onto the player once in the band", () => {
  const encounter = { id: 4, hullId: "patache", type: "enemy" };
  const combat = createEnemyCombatant(encounter, { danger: 1 }, 1);
  let enemy = { x: 0, y: 0, heading: 0, currentSpeedKn: 4, combat };
  const player = { x: preferredRange(enemy), y: -30 };
  // let it steer for a while
  for (let i = 0; i < 40; i += 1) {
    enemy = aiStep(enemy, player, 0.5, seededRnd(i)).enemy;
  }
  const rel = angleDiff(bearingTo(enemy, player), enemy.heading);
  const abs = Math.abs(rel);
  assert.ok(
    abs > Math.PI / 2 - COMBAT.arcHalf && abs < Math.PI / 2 + COMBAT.arcHalf,
    `player should end in a broadside arc, got rel=${rel.toFixed(2)}`,
  );
});

test("S4: the AI fires its broadside when loaded and in arc", () => {
  const encounter = { id: 5, hullId: "patache", type: "enemy" };
  const combat = createEnemyCombatant(encounter, { danger: 1 }, 1);
  combat.pieces.forEach((p) => (p.reloadTimer = 0));
  // put the player right on the enemy's starboard beam, in range
  let enemy = { x: 0, y: 0, heading: 0, currentSpeedKn: 0, combat };
  const range = Math.min(...combat.pieces.map((p) => pieceById(p.pieceId).rangeM));
  const player = { x: 0, y: range * 0.5 };
  const result = aiStep(enemy, player, 0.1, seededRnd(9));
  assert.ok(result.volley.length > 0, "expected a volley");
  assert.ok(result.volley.every((shot) => shot.side === "estribor"));
});

test("S4: a beaten enemy turns tail and flees", () => {
  const encounter = { id: 6, hullId: "patache", type: "enemy" };
  const combat = createEnemyCombatant(encounter, { danger: 1 }, 1);
  combat.condition.hull = COMBAT.fleeHullPct - 1;
  let enemy = { x: 0, y: 0, heading: 0, currentSpeedKn: 4, combat };
  const player = { x: 100, y: 0 };
  for (let i = 0; i < 30; i += 1) {
    enemy = aiStep(enemy, player, 0.5, seededRnd(i)).enemy;
  }
  const rel = angleDiff(bearingTo(player, enemy), enemy.heading);
  assert.ok(Math.abs(rel) < Math.PI / 4, `enemy should head away from the player, got ${rel}`);
});

/* ---------------------------------------------------------------- wreck */

test("S9: a defeated enemy leaves a lootable prize scaled by hull and zone", () => {
  const cheap = wreckPrize({ hullId: "patache" }, { lootFactor: 1 });
  const rich = wreckPrize({ hullId: "gran-galeon" }, { lootFactor: 5 });
  assert.ok(cheap > 0);
  assert.ok(rich > cheap);
});
