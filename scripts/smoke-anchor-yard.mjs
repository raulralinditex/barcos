import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { repairCost } from "../src/model/repair.js";
import { createEnemyCombatant } from "../src/model/combat.js";
import { zoneAtRadius } from "../src/model/world.js";

const ship = toRuntimeShip(buildShip({ hullId: "galeon-pequeno", batteries: [],
  crew: { marino: 34, artillero: 10, soldado: 26 }, days: 45, cargoKg: 6000,
  ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500 }, 12000), { name: "Captain" });
ship.condition = { hull: 42, rigging: 61, crew: 100, morale: 70 };
const world = { v: 1, seed: 424242, rngState: 424242, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 115, y: 0, heading: Math.PI, currentSpeedKn: 0, speedKn: ship.speedKn }, encounters: [] };
const browser = await chromium.launch();
try {
  for (const lang of ["es", "en"]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(({ ship, world, lang }) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("barcos:lang:v1", lang);
      localStorage.setItem("barcos:autofire:v1", "0");
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: JSON.stringify(world) }));
    }, { ship, world, lang });
    await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
    assert.equal(await page.locator('a[href="./index.html"]').count(), 0);
    assert.equal(await page.locator("#gameover-back").count(), 1);
    for (let i = 0; i < 4; i++) await page.keyboard.press("w");
    await page.waitForURL("**/index.html", { timeout: 15000 });
    const saved = await page.evaluate(() => ({
      game: JSON.parse(localStorage.getItem("barcos:game:v1")),
      fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
      pending: localStorage.getItem("barcos:arrival:v1"),
      notice: document.querySelector("#purchase-notice").textContent,
    }));
    assert.equal(saved.game.gold, 5000, "arrival must not spend gold");
    assert.deepEqual(saved.fleet.ships[0].condition, ship.condition, "arrival must not repair damage");
    assert.deepEqual(saved.game.combat.player.condition, ship.condition);
    assert.ok(Math.hypot(JSON.parse(saved.game.world).ship.x, JSON.parse(saved.game.world).ship.y) <= 110);
    assert.equal(saved.notice, "");
    assert.equal(saved.pending, null);
    assert.equal(await page.locator("#dock-dialog").isHidden(), true);
// The flota room owns this control now (S105).
await page.click('.screen-tab[data-screen="flota"]').catch(() => {});

    await page.locator(`.fleet-item[data-ship-id="${ship.id}"] [data-repair]`).click();
    const repaired = await page.evaluate(() => ({
      game: JSON.parse(localStorage.getItem("barcos:game:v1")),
      fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    }));
    assert.equal(repaired.game.gold, 5000 - repairCost(ship));
    assert.equal(repaired.fleet.ships[0].condition.hull, 100);
    assert.equal(repaired.game.combat.player.condition.hull, 100);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("#purchase-notice").textContent(), "");
    await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    assert.match(page.url(), /\/sea\.html$/);
    assert.deepEqual(errors, []);
    await page.close();
  }
  // A fighting enemy is no barrier, and its combat entity survives the trip.
  const enemy = { id: 901, type: "enemy", x: 500, y: 0, hullId: "zabra", heading: 0,
    currentSpeedKn: 0, engaged: true, drift: { heading: 0, speedKn: 0 } };
  enemy.combat = createEnemyCombatant(enemy, zoneAtRadius(115), world.seed);
  enemy.combat.condition.hull = 73;
  enemy.combat.pieces = [];
  const fight = await browser.newPage();
  await fight.addInitScript(({ ship, world, enemy }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:autofire:v1", "0");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: JSON.stringify({ ...world, encounters: [enemy] }) }));
  }, { ship, world, enemy });
  await fight.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  for (let i = 0; i < 4; i++) await fight.keyboard.press("w");
  await fight.waitForURL("**/index.html", { timeout: 15000 });
  let savedEnemy = await fight.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world).encounters.find(e => e.id === 901));
  assert.equal(savedEnemy.combat.status, "fighting");
  assert.equal(savedEnemy.combat.condition.hull, 73);
  await fight.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await fight.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
  savedEnemy = await fight.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world).encounters.find(e => e.id === 901));
  assert.equal(savedEnemy.combat.status, "fighting");
  assert.equal(savedEnemy.combat.condition.hull, 73);
  await fight.close();

  const over = await browser.newPage();
  await over.addInitScript(({ ship, world }) => {
    const sunk = { ...ship, condition: { ...ship.condition, hull: 0 } };
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [sunk], captainId: sunk.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: JSON.stringify({ ...world, ship: { ...world.ship, x: 111, currentSpeedKn: 10 } }) }));
  }, { ship, world });
  await over.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await over.locator("#gameover-back").waitFor({ state: "visible", timeout: 5000 });
  await over.waitForTimeout(1000);
  assert.match(over.url(), /\/sea\.html$/);
  await over.close();

  const corrupt = await browser.newPage();
  await corrupt.addInitScript(() => localStorage.setItem("barcos:arrival:v1", "{bad"));
  await corrupt.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  assert.equal(await corrupt.locator("#purchase-notice").textContent(), "");
  assert.equal(await corrupt.evaluate(() => localStorage.getItem("barcos:arrival:v1")), null);
  await corrupt.close();
  console.log("SMOKE OK: uncharged arrival and manual repair in both languages, combat persistence, game-over guard and corrupt notice");
} finally {
  await browser.close();
}
