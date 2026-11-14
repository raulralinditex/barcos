import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { serializeFleet } from "../src/model/fleet.js";

// Needs the local server on 8765. The captain is deliberately not the first ship.
const config = {
  hullId: "galeon-pequeno",
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
};
const makeShip = (id, name, pieceId, qty) => {
  const batteries = ["babor", "estribor"].map((side) => ({
    pieceId, qty, side, shotsPerPiece: 25, ammoId: "bala-hierro",
  }));
  return { ...toRuntimeShip(buildShip({ ...config, batteries }), { name }), id };
};
const escort = makeShip("smoke-escort", "Escolta", "minion", 1);
const captain = makeShip("smoke-captain", "Capitana", "falconete", 2);
assert.ok(Number.isFinite(captain.speedKn));
const fleetJson = serializeFleet({ ships: [escort, captain], captainId: captain.id });

const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-ES" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((fleet) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleet);
  }, fleetJson);
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });

  const rows = () => page.locator("#battery-list .battery").evaluateAll((cards) => cards.map((card) => ({
    name: card.querySelector(".battery-name").textContent.trim(),
    side: card.querySelector('[data-field="side"]').value,
    qty: Number(card.querySelector('[data-field="qty"]').value),
  })));
  const expectedCaptain = [
    { name: "Falconete", side: "babor", qty: 2 },
    { name: "Falconete", side: "estribor", qty: 2 },
  ];
  // Inspect the initial render before any click; report both symptoms on RED.
  const initialRows = await rows();
  const initialGuns = (await page.locator("#guns-total").textContent()).trim();
  const failures = [];
  if (JSON.stringify(initialRows) !== JSON.stringify(expectedCaptain)) {
    failures.push(`boot batteries: expected ${JSON.stringify(expectedCaptain)}, got ${JSON.stringify(initialRows)}`);
  }
  if (initialGuns !== "4") failures.push(`boot guns: expected 4, got ${initialGuns}`);
  if (failures.length) throw new Error(failures.join("\n"));
  assert.equal(await page.locator("#ship-name").inputValue(), captain.name);
  assert.equal(await page.locator("#refit-mode").textContent(), `Reformando: ${captain.name}`);
  assert.ok(await page.locator(`[data-ship-id="${captain.id}"]`).evaluate((el) => el.classList.contains("is-refitting")));
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem("barcos:fleet:v1"))), JSON.parse(fleetJson));

  // Existing explicit selection still copies the other ship's config.
  await page.locator(`[data-refit="${escort.id}"]`).click();
  assert.deepEqual(await rows(), [
    { name: "Minion de 4 libras", side: "babor", qty: 1 },
    { name: "Minion de 4 libras", side: "estribor", qty: 1 },
  ]);
  assert.equal((await page.locator("#guns-total").textContent()).trim(), "2");
  assert.equal(await page.locator("#ship-name").inputValue(), escort.name);
  assert.equal(await page.locator("#refit-mode").textContent(), `Reformando: ${escort.name}`);

  // A separate fresh browser context keeps the existing empty-fleet builder view.
  const empty = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-ES" });
  empty.on("pageerror", (error) => errors.push(error.message));
  await empty.addInitScript(() => localStorage.setItem("barcos:lang:v1", "es"));
  await empty.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  assert.equal((await empty.locator("#guns-total").textContent()).trim(), "10");
  assert.equal(await empty.locator("#battery-list .battery").count(), 4);
  assert.equal(await empty.locator("#launch-btn").textContent(), "Añadir a la flota");
  assert.deepEqual(errors, []);
  console.log("SMOKE OK: captain loadout on boot, explicit selection and empty-fleet builder");
} finally {
  await browser.close();
}
