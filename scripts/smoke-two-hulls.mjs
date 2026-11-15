import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

// Needs the existing static server on 8765. Each scenario gets an isolated browser context.
const makeShip = (id, name, qty, cargoKg, marino, days, hull, rigging) => {
  const built = buildShip({
    hullId: "galeon-pequeno",
    batteries: ["babor", "estribor"].map((side) => ({
      pieceId: "minion", qty, side, shotsPerPiece: 25, ammoId: "bala-hierro",
    })),
    crew: { marino, artillero: 10, soldado: 26 },
    days, cargoKg, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
  });
  assert.ok(built.feasible, `fixture ${name} must be feasible`);
  return {
    ...toRuntimeShip(built, { name }), id,
    condition: { hull, rigging, crew: 100, morale: 100 },
  };
};
const a = makeShip("hull-a", "Alba", 2, 4000, 34, 40, 45, 58);
const b = makeShip("hull-b", "Brisa", 3, 6000, 38, 45, 83, 91);
const view = (ship) => ({
  id: ship.id, name: ship.name, batteries: ship.batteries, crew: ship.crew,
  crewAlive: ship.crewAlive, cargoKg: ship.cargoKg, days: ship.days, condition: ship.condition,
});
const before = [view(a), view(b)];
const world = {
  v: 1, seed: 424242, rngState: 424242, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 2200, y: 1200, heading: 0, currentSpeedKn: 0, speedKn: a.speedKn },
  escorts: [{ id: b.id, x: 2000, y: 1100, heading: 1.2, currentSpeedKn: 0, speedKn: b.speedKn }],
  encounters: [],
};
const initialGame = {
  gold: 100000, world: JSON.stringify(world),
  combat: {
    player: { condition: a.condition, crew: a.crewAlive, pieces: [{ pieceId: "minion", ammoId: "bala-hierro", shotsLeft: 7 }] },
    escorts: { [b.id]: { condition: b.condition, crew: b.crewAlive } },
  },
};
const browser = await chromium.launch();
const failures = [];
const check = (label, actual, expected) => {
  try { assert.deepEqual(actual, expected); }
  catch { failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
};
const snapshot = (page) => page.evaluate(() => ({
  fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
  game: JSON.parse(localStorage.getItem("barcos:game:v1")),
}));
const setup = async (game = initialGame) => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: "es-ES" });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`page error: ${error.message}`));
  await page.addInitScript(({ a, b, game }) => {
    if (sessionStorage.getItem("two-hulls-seeded")) return;
    sessionStorage.setItem("two-hulls-seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [a, b], captainId: a.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify(game));
    localStorage.setItem("barcos:config:v1", JSON.stringify({ ...b, shipName: b.name }));
  }, { a, b, game });
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  if (await page.locator("#dock-dialog").evaluate((el) => el.open)) await page.click("#dock-later");
  await page.click('.screen-tab[data-screen="flota"]');
  return { context, page };
};
const select = (page, id) => page.locator(`[data-refit="${id}"]`).click();
const change = async (page, selector, value) => {
  const input = page.locator(selector).first();
  await input.fill(String(value));
  await input.dispatchEvent("change");
};
const edit = async (page, { qty, cargoKg, marino, days, name }) => {
  await page.click('[data-tab="guns"]');
  await change(page, '.battery [data-field="qty"]', qty);
  await page.click('[data-tab="crew"]');
  await change(page, '[data-role="marino"]', marino);
  await page.click('[data-tab="supply"]');
  await change(page, '[data-supply="cargoKg"]', cargoKg);
  await change(page, '[data-supply="days"]', days);
  await page.fill("#ship-name", name);
};
const editA = { qty: 3, cargoKg: 4100, marino: 35, days: 41, name: "Alba reformada" };
const editB = { qty: 4, cargoKg: 6200, marino: 40, days: 46, name: "Brisa reformada" };
const expectedEdit = (ship, edit) => {
  const result = view(structuredClone(ship));
  result.batteries[0].qty = edit.qty;
  result.cargoKg = edit.cargoKg;
  result.crew.marino = edit.marino;
  result.crewAlive.marino = edit.marino;
  result.days = edit.days;
  result.name = edit.name;
  return result;
};
const printFleet = (label, fleet) => console.log(`${label}: ${JSON.stringify(fleet.ships.map(view))}`);

try {
  console.log(`BEFORE: ${JSON.stringify(before)}`);
  for (const sequence of ["save-both", "discard-a", "twice-a"]) {
    const { context, page } = await setup();
    try {
      check(`${sequence} boot ignores stale config`, await page.locator("#ship-name").inputValue(), a.name);
      await select(page, a.id);
      await edit(page, editA);
      if (sequence !== "discard-a") await page.click("#launch-btn");
      if (sequence === "twice-a") {
        await select(page, a.id);
        await edit(page, { ...editA, qty: 4, cargoKg: 4300, marino: 36, days: 42 });
      } else {
        await select(page, b.id);
        await edit(page, editB);
      }
      await page.click("#launch-btn");
      const { fleet } = await snapshot(page);
      const expectedA = sequence === "discard-a" ? view(a) : expectedEdit(a,
        sequence === "twice-a" ? { ...editA, qty: 4, cargoKg: 4300, marino: 36, days: 42 } : editA);
      const expectedB = sequence === "twice-a" ? view(b) : expectedEdit(b, editB);
      check(`${sequence} fleet`, fleet.ships.map(view), [expectedA, expectedB]);
      printFleet(`AFTER ${sequence}`, fleet);
    } finally { await context.close(); }
  }

  // A real voyage left A's combat in player and B's under her id. Promote B in the
  // yard, refit her, then sail: neither stale player combat nor A's guns belong to B.
  for (const refit of [false, true]) {
    const { context, page } = await setup();
    try {
      await page.locator(`[data-captain="${b.id}"]`).click();
      const promoted = await snapshot(page);
      check(`promotion refit=${refit} player before sailing`, promoted.game.combat.player, initialGame.combat.escorts[b.id]);
      check(`promotion refit=${refit} old captain before sailing`, promoted.game.combat.escorts[a.id], initialGame.combat.player);
      check(`promotion refit=${refit} promoted escort removed`, promoted.game.combat.escorts[b.id], undefined);
      if (refit) {
        await select(page, b.id);
        await edit(page, editB);
        await page.click("#launch-btn");
      }
      await Promise.all([page.waitForURL("**/sea.html"), page.click("#set-sail-btn")]);
      await page.waitForTimeout(3300);
      const { fleet, game } = await snapshot(page);
      const savedA = fleet.ships.find((ship) => ship.id === a.id);
      const savedB = fleet.ships.find((ship) => ship.id === b.id);
      check(`promotion refit=${refit} captain`, fleet.captainId, b.id);
      check(`promotion refit=${refit} A condition`, savedA.condition, a.condition);
      check(`promotion refit=${refit} A crew`, savedA.crewAlive, a.crewAlive);
      check(`promotion refit=${refit} B condition`, savedB.condition, b.condition);
      check(`promotion refit=${refit} B crew`, savedB.crewAlive, refit ? expectedEdit(b, editB).crewAlive : b.crewAlive);
      check(`promotion refit=${refit} B combat`, game.combat.player.condition, b.condition);
      check(`promotion refit=${refit} B ammunition`, game.combat.player.pieces[0].shotsLeft, 25);
      printFleet(`AFTER promotion refit=${refit}`, fleet);
    } finally { await context.close(); }
  }

  // Switching back before sailing restores the old captain's own gun state. An escort
  // without a saved combatant must start from her fleet sheet rather than inherit A's.
  {
    const { context, page } = await setup();
    try {
      await page.locator(`[data-captain="${b.id}"]`).click();
      await page.locator(`[data-captain="${a.id}"]`).click();
      const { fleet, game } = await snapshot(page);
      check("promotion back captain", fleet.captainId, a.id);
      check("promotion back player", game.combat.player, initialGame.combat.player);
      check("promotion back escort", game.combat.escorts[b.id], initialGame.combat.escorts[b.id]);
    } finally { await context.close(); }
  }
  {
    const game = structuredClone(initialGame);
    delete game.combat.escorts[b.id];
    const { context, page } = await setup(game);
    try {
      await page.locator(`[data-captain="${b.id}"]`).click();
      const promoted = await snapshot(page);
      check("promotion missing combat player", promoted.game.combat.player, undefined);
      await Promise.all([page.waitForURL("**/sea.html"), page.click("#set-sail-btn")]);
      await page.waitForTimeout(3300);
      const saved = await snapshot(page);
      check("promotion missing combat condition", saved.game.combat.player.condition, b.condition);
      check("promotion missing combat crew", saved.game.combat.player.crew, b.crewAlive);
    } finally { await context.close(); }
  }

  // At-sea handover is a separate path from voluntary promotion at the yard.
  const lostGame = structuredClone(initialGame);
  lostGame.combat.player.condition.hull = 0;
  const { context, page } = await setup(lostGame);
  try {
    await Promise.all([page.waitForURL("**/sea.html"), page.click("#set-sail-btn")]);
    const { fleet, game } = await snapshot(page);
    check("handover captain", fleet.captainId, b.id);
    check("handover survivor", fleet.ships.map(view), [view(b)]);
    check("handover combat", game.combat.player.condition, b.condition);
    printFleet("AFTER handover", fleet);
  } finally { await context.close(); }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log("SMOKE OK: same-hull refits, voluntary promotion and at-sea handover preserve identity");
} finally { await browser.close(); }
