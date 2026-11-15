import assert from "node:assert/strict";
import { chromium } from "playwright";
import { priceShip } from "../src/model/economy.js";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const save = () => page.evaluate(() => ({
  fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
  game: JSON.parse(localStorage.getItem("barcos:game:v1")),
}));
const change = async (selector, value) => {
  await page.locator(selector).first().fill(String(value));
  await page.locator(selector).first().dispatchEvent("change");
};
const price = (before, after) => {
  const a = priceShip(before), b = priceShip(after);
  let paid = 0, removed = 0;
  for (const line of ["pieces", "shots", "crew", "provisions", "cargo", "ballast"]) {
    paid += Math.max(0, b[line] - a[line]);
    removed += Math.max(0, a[line] - b[line]);
  }
  // Whole doblones, rounded against the player: what is added up, what comes back down.
  return Math.ceil(paid - 1e-9) - Math.floor(removed * 0.5 + 1e-9);
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const display = (amount) => new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(Math.round(amount));

try {
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 100000 }));
  });
  await page.reload({ waitUntil: "networkidle" });
  for (const name of ["Escort", "Captain"]) {
    // Buying lives in the Comprar tab (S99).
    await page.click('.screen-tab[data-screen="comprar"]');
    await page.fill("#ship-name", name);
    await page.click("#launch-btn");
  }
  let current = await save();
  const escort = current.fleet.ships[0], captain = current.fleet.ships[1];
  assert.equal(current.fleet.captainId, captain.id);
  await page.evaluate(({ escortId, captainId }) => {
    const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    for (const ship of fleet.ships) {
      ship.condition = { hull: 52, rigging: 63, crew: 80, morale: 71 };
      ship.crewAlive = { ...ship.crew, marino: ship.crew.marino - 3 };
    }
    localStorage.setItem("barcos:fleet:v1", JSON.stringify(fleet));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    game.marker = "keep";
    game.combat = {
      player: { condition: fleet.ships.find(s => s.id === captainId).condition, crew: fleet.ships.find(s => s.id === captainId).crewAlive, pieces: [{ shotsLeft: 1 }] },
      escorts: { [escortId]: { condition: fleet.ships.find(s => s.id === escortId).condition, crew: fleet.ships.find(s => s.id === escortId).crewAlive } },
    };
    localStorage.setItem("barcos:game:v1", JSON.stringify(game));
  }, { escortId: escort.id, captainId: captain.id });
  await page.reload({ waitUntil: "networkidle" });
  if (await page.locator("#dock-dialog").evaluate(el => el.open)) await page.click("#dock-later");
  // The fleet strip lives in the Flota tab (S97).
  await page.click('.screen-tab[data-screen="flota"]');
  await page.locator(`.fleet-item[data-ship-id="${escort.id}"] .fleet-check`).uncheck();
  current = await save();
  const before = current.fleet.ships[0], purse = current.game.gold;
  assert.equal(before.sails, false);
  assert.ok(await page.locator("#country-select").isDisabled());
  await page.locator(`.fleet-item[data-ship-id="${escort.id}"] .fleet-ship`).click();
  assert.equal(await page.locator("#launch-btn").textContent(), "Guardar reforma");
  assert.equal(await page.locator("#ship-name").inputValue(), before.name);
  assert.equal(await page.locator("#refit-mode").textContent(), `Reformando: ${before.name}`);
  await page.selectOption("#lang-select", "en");
  assert.equal(await page.locator("#refit-mode").textContent(), `Refitting: ${before.name}`);
  assert.equal(await page.locator("#launch-btn").textContent(), "Save refit");
  assert.equal(await page.locator("#new-ship-btn").textContent(), "New ship");
  await page.selectOption("#lang-select", "es");
  assert.ok(await page.locator(`.fleet-item[data-ship-id="${escort.id}"]`).evaluate(el => el.classList.contains("is-refitting")));
  assert.equal(Number(await page.locator('.battery [data-field="qty"]').first().inputValue()), before.batteries[0].qty);
  assert.equal(Number(await page.locator('[data-role="marino"]').inputValue()), before.crew.marino);
  assert.equal(Number(await page.locator('[data-supply="days"]').inputValue()), before.days);
  assert.ok(await page.locator('.hull-card:not(.is-active)').first().isDisabled());
  await change('.battery [data-field="qty"]', before.batteries[0].qty + 1);
  await page.click('[data-tab="crew"]');
  await change('[data-role="marino"]', before.crew.marino + 2);
  const expected = structuredClone(before);
  expected.batteries[0].qty++;
  expected.crew.marino += 2;
  const net = price(before, expected);
  assert.ok(net > 0);
  assert.equal(await page.locator("#price-total").textContent(), display(net));
  await change('[data-role="marino"]', 0);
  assert.ok(await page.locator("#launch-btn").isDisabled());
  assert.ok((await page.locator("#verdict-issues").textContent()).includes("Faltan marinos"));
  await change('[data-role="marino"]', before.crew.marino + 2);
  await page.fill("#ship-name", "Escort refitted");
  await page.click("#launch-btn");
  current = await save();
  const updated = current.fleet.ships[0];
  assert.equal(updated.id, escort.id);
  assert.equal(updated.name, "Escort refitted");
  assert.equal(updated.sails, false);
  assert.deepEqual(updated.condition, before.condition);
  assert.equal(updated.crewAlive.marino, before.crewAlive.marino + 2);
  assert.equal(updated.batteries[0].qty, before.batteries[0].qty + 1);
  close(current.game.gold, purse - net);
  assert.deepEqual(current.game.combat.escorts[escort.id].condition, before.condition);
  assert.deepEqual(current.game.combat.escorts[escort.id].crew, updated.crewAlive);
  assert.deepEqual(current.game.combat.player.pieces, [{ shotsLeft: 1 }]);
  assert.equal(current.game.marker, "keep");
  // After a saved refit the builder goes back to buying (S99): her action is adding
  // the next new hull to the fleet.
  await page.click('.screen-tab[data-screen="comprar"]');
  assert.equal(await page.locator("#launch-btn").textContent(), "Añadir a la flota");
  // The promote buttons live on the fleet strip, in the Flota tab (S97).
  await page.click('.screen-tab[data-screen="flota"]');
  await page.locator(`.fleet-item[data-ship-id="${escort.id}"] [data-captain]`).click();
  assert.equal((await save()).fleet.captainId, escort.id);
  await page.locator(`.fleet-item[data-ship-id="${captain.id}"] [data-captain]`).click();
  current = await save();
  const oldCaptain = current.fleet.ships[1], oldGold = current.game.gold;
  await page.locator(`.fleet-item[data-ship-id="${captain.id}"] .fleet-ship`).click();
  await page.click("#new-ship-btn");
  assert.equal(await page.locator("#launch-btn").textContent(), "Añadir a la flota");
  await page.locator(`.fleet-item[data-ship-id="${captain.id}"] .fleet-ship`).click();
  await page.click('[data-tab="supply"]');
  await change('[data-supply="cargoKg"]', 0);
  const refund = price(oldCaptain, { ...oldCaptain, cargoKg: 0 });
  assert.ok(refund < 0);
  assert.equal(await page.locator("#price-total").textContent(), display(-refund));
  await page.click("#launch-btn");
  current = await save();
  close(current.game.gold, oldGold - refund);
  assert.equal(current.fleet.ships[1].id, captain.id);
  assert.deepEqual(current.fleet.ships[1].condition, oldCaptain.condition);
  assert.deepEqual(current.game.combat.player.condition, oldCaptain.condition);
  assert.equal("pieces" in current.game.combat.player, false);
  assert.deepEqual(current.game.combat.escorts[escort.id].crew, updated.crewAlive);
  assert.deepEqual(errors, []);
  console.log("SMOKE OK: refit loadout, validation, pricing, fleet, captain, damage and sea save");
} finally {
  await browser.close();
}
