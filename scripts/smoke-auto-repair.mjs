import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { repairCost } from "../src/model/repair.js";

const ship = toRuntimeShip(buildShip({
  hullId: "galeon-pequeno", batteries: [],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
}, 12000), { name: "Captain" });
ship.condition = { hull: 42, rigging: 61, crew: 100, morale: 70 };
const world = { v: 1, seed: 424242, rngState: 424242, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 115, y: 0, heading: Math.PI, currentSpeedKn: 0, speedKn: ship.speedKn }, encounters: [] };
const browser = await chromium.launch();
const page = await browser.newPage();
try {
  await page.addInitScript(({ ship, world }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: JSON.stringify(world) }));
  }, { ship, world });
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  for (let i = 0; i < 4; i++) await page.keyboard.press("w");
  await page.waitForURL("**/index.html", { timeout: 15000 });
  const saved = await page.evaluate(() => ({
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    game: JSON.parse(localStorage.getItem("barcos:game:v1")),
    banner: document.querySelector("#purchase-notice").textContent,
  }));
  assert.equal(saved.game.gold, 5000, "arrival must not charge the purse");
  assert.deepEqual(saved.fleet.ships[0].condition, ship.condition, "arrival must not repair the captain");
  assert.deepEqual(saved.game.combat.player.condition, ship.condition);
  assert.equal(saved.banner, "");
  assert.equal(await page.locator("#dock-dialog").isHidden(), true);
  // The flota room owns this control now (S105).
  await page.click('.screen-tab[data-screen="flota"]');
  await page.waitForTimeout(150);
  await page.locator(`.fleet-item[data-ship-id="${ship.id}"] [data-repair]`).click();
  const repaired = await page.evaluate(() => ({
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    game: JSON.parse(localStorage.getItem("barcos:game:v1")),
  }));
  assert.equal(repaired.fleet.ships[0].condition.hull, 100);
  assert.equal(repaired.game.gold, 5000 - repairCost(ship));
  // Live combat damage wins over stale fleet sheets for sailing hulls; ashore
  // damage also remains unchanged until its own repair button is pressed.
  const livePage = await browser.newPage();
  const staleCaptain = { ...ship, condition: { ...ship.condition, hull: 80 } };
  const escort = { ...staleCaptain, id: "live-escort", name: "Escort" };
  const ashore = { ...ship, id: "ashore", name: "Ashore", sails: false };
  const liveCaptain = { ...ship.condition, hull: 40 };
  const liveEscort = { ...ship.condition, hull: 30 };
  await livePage.addInitScript(({ staleCaptain, escort, ashore, liveCaptain, liveEscort, world }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "en");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [staleCaptain, escort, ashore], captainId: staleCaptain.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 10000, world: JSON.stringify(world), combat: {
      player: { condition: liveCaptain, crew: staleCaptain.crew, pieces: [] },
      escorts: { [escort.id]: { condition: liveEscort, crew: escort.crew } },
    } }));
  }, { staleCaptain, escort, ashore, liveCaptain, liveEscort, world });
  await livePage.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  for (let i = 0; i < 4; i++) await livePage.keyboard.press("w");
  await livePage.waitForURL("**/index.html", { timeout: 15000 });
  const liveSaved = await livePage.evaluate(() => ({
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    game: JSON.parse(localStorage.getItem("barcos:game:v1")),
    banner: document.querySelector("#purchase-notice").textContent,
  }));
  assert.equal(liveSaved.game.gold, 10000);
  assert.deepEqual(liveSaved.fleet.ships.map((entry) => entry.condition.hull), [40, 30, 42]);
  assert.deepEqual(liveSaved.game.combat.player.condition, liveCaptain);
  assert.deepEqual(liveSaved.game.combat.escorts[escort.id].condition, liveEscort);
  assert.equal(liveSaved.banner, "");
  // The flota room owns this control now (S105).
  await livePage.click('.screen-tab[data-screen="flota"]');
  await livePage.waitForTimeout(150);
  await livePage.locator(`.fleet-item[data-ship-id="${escort.id}"] [data-repair]`).click();
  const picked = await livePage.evaluate(() => ({
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    game: JSON.parse(localStorage.getItem("barcos:game:v1")),
  }));
  assert.deepEqual(picked.fleet.ships.map((entry) => entry.condition.hull), [40, 100, 42]);
  assert.equal(picked.game.gold, 10000 - repairCost({ ...escort, condition: liveEscort }));
  assert.equal(picked.game.combat.escorts[escort.id].condition.hull, 100);
  assert.deepEqual(picked.game.combat.player.condition, liveCaptain);
  await livePage.close();

  const emptyPage = await browser.newPage();
  await emptyPage.addInitScript(({ ship, world }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "en");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 0, world: JSON.stringify(world) }));
  }, { ship, world });
  await emptyPage.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  for (let i = 0; i < 4; i++) await emptyPage.keyboard.press("w");
  await emptyPage.waitForURL("**/index.html", { timeout: 15000 });
  const empty = await emptyPage.evaluate(() => ({
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    game: JSON.parse(localStorage.getItem("barcos:game:v1")),
    banner: document.querySelector("#purchase-notice").textContent,
  }));
  assert.equal(empty.fleet.ships[0].condition.hull, 42);
  assert.equal(empty.game.gold, 0);
  assert.deepEqual(empty.fleet.ships[0].condition, ship.condition);
  assert.equal(empty.banner, "");
  // The flota room owns this control now (S105).
  await emptyPage.click('.screen-tab[data-screen="flota"]');
  await emptyPage.waitForTimeout(150);
  await emptyPage.locator(`.fleet-item[data-ship-id="${ship.id}"] [data-repair]`).click();
  const afterEmptyClick = await emptyPage.evaluate(() => ({
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    game: JSON.parse(localStorage.getItem("barcos:game:v1")),
  }));
  assert.deepEqual(afterEmptyClick.fleet.ships[0].condition, ship.condition);
  assert.equal(afterEmptyClick.game.gold, 0);
  await emptyPage.close();
  console.log("SMOKE OK: arrival preserves live and ashore damage and gold; manual repair targets one hull");
} finally {
  await browser.close();
}
