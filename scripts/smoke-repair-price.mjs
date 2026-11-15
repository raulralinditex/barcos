import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { repairCost } from "../src/model/repair.js";

/**
 * Browser smoke (S45): with a short purse, the price every repair offer shows is the
 * purse, never the full price. Needs the local server on 8765.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
    },
    12000,
  ),
  { name: "Captain" },
);
ship.condition = { hull: 20, rigging: 40, crew: 100, morale: 100 };
const FULL = repairCost(ship);
const PURSE = 37;
assert.ok(FULL > PURSE * 4, `the scenario needs a price well above the purse (${FULL})`);

const fleet = { v: 1, captainId: ship.id, ships: [ship] };
const world = {
  v: 1, seed: 2, rngState: 2, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [], encounters: [],
};

const browser = await chromium.launch();
const failures = [];
const errors = [];

async function open(path, inbound = false) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ([fleetJson, gameJson]) => {
      if (sessionStorage.getItem("smoke:repair-price:seeded")) return;
      sessionStorage.setItem("smoke:repair-price:seeded", "1");
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", gameJson);
    },
    [JSON.stringify(fleet), JSON.stringify({ gold: PURSE, world: JSON.stringify(inbound
      ? { ...world, ship: { ...world.ship, x: 115, heading: Math.PI } }
      : world) })],
  );
  await page.goto(`http://localhost:8765/${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  return page;
}

const numbers = (text) => (text.match(/\d[\d.]*/g) ?? []).map((n) => Number(n.replaceAll(".", "")));
const shows = (text, value) => numbers(text).includes(value);

// 1. The shipyard fleet button offers the amount actually affordable.
let page = await open("index.html");
assert.equal(await page.locator("#dock-dialog").isHidden(), true);
// The flota room owns this control now (S105).
await page.click('.screen-tab[data-screen="flota"]').catch(() => {});

await page.locator(`.fleet-item[data-ship-id="${ship.id}"] [data-refit]`).click();
const yard = await page.locator("#fleet-repair-btn").textContent();
if (!shows(yard, PURSE)) failures.push(`fleet repair button: should show ${PURSE}, got "${yard.trim()}"`);
if (shows(yard, FULL)) failures.push(`fleet repair button: shows the full price ${FULL}: "${yard.trim()}"`);
await page.close();

// 2. The captain's port quote remains capped when opening inside the port.
page = await open("sea.html");
const quote = await page.locator("#port-cost").textContent();
if (!shows(quote, PURSE)) failures.push(`port quote: should show ${PURSE}, got "${quote.trim()}"`);
if (shows(quote, FULL)) failures.push(`port quote: shows the full price ${FULL}: "${quote.trim()}"`);
await page.close();

// 3. Arrival spends nothing; the button quotes and spends the capped price once.
page = await open("sea.html", true);
for (let i = 0; i < 4; i++) await page.keyboard.press("w");
await page.waitForURL("**/index.html*", { timeout: 15000 });
await page.waitForLoadState("networkidle");
// Arriving opens the buy room (S109); the fleet list lives in hers (S105).
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(200);
const snapshot = () => page.evaluate(() => ({
  game: JSON.parse(localStorage.getItem("barcos:game:v1")),
  fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
}));
const arrival = await snapshot();
assert.equal(arrival.game.gold, PURSE, "arrival must not spend the purse");
assert.deepEqual(arrival.fleet.ships[0].condition, ship.condition, "arrival must not repair the ship");
assert.equal((await page.locator("#purchase-notice").textContent()).trim(), "");
// The flota room owns the fleet strip now (S105).
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(150);
await page.locator(`.fleet-item[data-ship-id="${ship.id}"] [data-refit]`).click();
const button = page.locator("#fleet-repair-btn");
const arrivalQuote = await button.textContent();
if (!shows(arrivalQuote, PURSE) || shows(arrivalQuote, FULL)) failures.push(`arrival fleet quote has wrong price: "${arrivalQuote.trim()}"`);
await button.click();
const repaired = await snapshot();
const expectedHull = ship.condition.hull + (100 - ship.condition.hull) * PURSE / FULL;
assert.equal(repaired.game.gold, 0, "partial repair spends the quoted purse");
assert.ok(Math.abs(repaired.fleet.ships[0].condition.hull - expectedHull) < 1e-9, "the quote buys proportional hull repair");
await button.click();
const afterRetry = await snapshot();
assert.equal(afterRetry.game.gold, 0, "an empty purse is not charged");
assert.deepEqual(afterRetry.fleet.ships[0].condition, repaired.fleet.ships[0].condition, "an empty purse cannot buy more repair");
await page.close();

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
assert.deepEqual(failures, [], failures.join("\n"));
console.log(`SMOKE OK: with ${PURSE} doblones both repair offers show ${PURSE}, not ${FULL}; arrival is free and manual repair spends the quote`);
