import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke (S50): after refitting the CAPTAIN the saved sea game has no guns state
 * (`combat.player.pieces` is dropped so the new guns are rebuilt from the fleet sheet),
 * but it still carries her damage, which is fresher than the fleet sheet. Opening the sea
 * must keep that damage. Needs the local server on 8765.
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
// The fleet sheet is the OLD copy: sound. The sea save is the fresh one: damaged.
ship.condition = { hull: 100, rigging: 100, crew: 100, morale: 100 };
const savedDamage = { hull: 40, rigging: 55, crew: 100, morale: 80 };
const world = {
  v: 1, seed: 2, rngState: 2, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 600, y: 600, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [], encounters: [],
};

const browser = await chromium.launch();
const failures = [];
const errors = [];
const page = await browser.newPage({ viewport: { width: 1300, height: 850 }, locale: "es-AR" });
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(
  ([shipJson, worldJson, damage]) => {
    if (localStorage.getItem("smoke:seeded")) return;
    localStorage.setItem("smoke:seeded", "1");
    const parsed = JSON.parse(shipJson);
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:autofire:v1", "0");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [parsed], captainId: parsed.id }));
    // No `pieces`: exactly what a refit of the captain leaves behind.
    localStorage.setItem(
      "barcos:game:v1",
      JSON.stringify({ gold: 100, world: worldJson, combat: { player: { condition: damage, crew: parsed.crew } } }),
    );
  },
  [JSON.stringify(ship), JSON.stringify(world), savedDamage],
);
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(900);

const hud = await page.evaluate(() => ({
  hull: document.querySelector("#hud-hull")?.textContent.trim() ?? "",
  rigging: document.querySelector("#hud-rigging")?.textContent.trim() ?? "",
}));
const number = (text) => Number((text.match(/[\d.]+/) ?? [NaN])[0]);
if (number(hud.hull) !== 40) failures.push(`the saved hull damage was lost on opening the sea: HUD says "${hud.hull}", expected 40`);
if (number(hud.rigging) !== 55) failures.push(`the saved rigging damage was lost on opening the sea: HUD says "${hud.rigging}", expected 55`);

// the guns come from the fleet sheet: full racks (2+2 minions x 25 rounds)
const rounds = await page.locator("#hud-rounds").textContent();
if (!/50\/50/.test(rounds ?? "")) failures.push(`the guns were not rebuilt from the fleet sheet: rounds "${rounds?.trim()}"`);

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
assert.deepEqual(failures, [], failures.join("\n"));
console.log("SMOKE OK: a captain with no saved guns keeps her saved damage when the sea opens");
