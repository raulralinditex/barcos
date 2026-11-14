import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { repairCost } from "../src/model/repair.js";

/**
 * Browser smoke for re-entry and manual repair (S86). The damaged ship starts inside
 * the port: opening, leaving and returning preserve damage and gold. Only the fleet
 * button repairs and charges once, including after staying and reloading.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
    },
    12000,
  ),
  { name: "Captain" },
);
ship.condition = { hull: 42, rigging: 61, crew: 100, morale: 70 };
const GOLD = 5000;
const PORT_RADIUS = 110;
const world = {
  v: 1, seed: 424242, rngState: 424242, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 60, y: 0, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [], encounters: [],
};

const browser = await chromium.launch();
const failures = [];
const errors = [];
const page = await browser.newPage({ viewport: { width: 1300, height: 850 }, locale: "es-AR" });
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(
  ([shipJson, worldJson, gold]) => {
    if (localStorage.getItem("smoke:seeded")) return;
    localStorage.setItem("smoke:seeded", "1");
    const parsed = JSON.parse(shipJson);
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:autofire:v1", "0");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [parsed], captainId: parsed.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold, world: worldJson }));
  },
  [JSON.stringify(ship), JSON.stringify(world), GOLD],
);
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(900);

const state = () =>
  page.evaluate(() => {
    if (location.pathname.endsWith("/sea.html")) window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const w = JSON.parse(game.world);
    const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    return { x: w.ship.x, y: w.ship.y, heading: w.ship.heading, gold: game.gold, condition: fleet.ships[0].condition, hull: fleet.ships[0].condition.hull };
  });

const angleDiff = (to, from) => {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/**
 * Steer towards a point with short helm pulses until `done(state)` holds.
 *
 * The deadline is wall clock, and the crossing is slow by design: the hull has to turn,
 * accelerate and cover a few hundred metres. It failed at 45 s when this smoke ran as one
 * of forty-five in series, because a loaded machine makes every helm pulse and every
 * storage read slower. The bound is generous on purpose — a real hang still fails, it just
 * takes longer to say so.
 */
async function sailUntil(target, done, label, seconds = 120) {
  const deadline = Date.now() + seconds * 1000;
  for (;;) {
    let s;
    try {
      s = await state();
    } catch (error) {
      if (!/navigation|context was destroyed/i.test(error.message)) throw error;
      await page.waitForURL("**/index.html", { timeout: 15000 });
      return state();
    }
    if (done(s)) return s;
    if (Date.now() > deadline) {
      failures.push(`${label}: timed out at (${Math.round(s.x)}, ${Math.round(s.y)})`);
      return s;
    }
    const desired = Math.atan2(target.y - s.y, target.x - s.x);
    const diff = angleDiff(desired, s.heading);
    if (Math.abs(diff) > 0.08) {
      const key = diff > 0 ? "d" : "a";
      await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(260, 90 + Math.abs(diff) * 120));
      await page.keyboard.up(key);
    } else {
      await page.waitForTimeout(120);
    }
  }
}

// 1. inside the port, damaged, with the sea just opened: nothing happens by itself
await page.waitForTimeout(1200);
const opened = await state();
if (opened.gold !== GOLD) failures.push(`opening the sea inside the port charged by itself (gold ${opened.gold})`);
if (JSON.stringify(opened.condition) !== JSON.stringify(ship.condition)) failures.push(`opening the sea inside the port changed damage: ${JSON.stringify(opened.condition)}`);

// speed up the crossing: the keys below are the same T the player has
for (let i = 0; i < 2; i += 1) await page.keyboard.press("t");
for (let i = 0; i < 4; i += 1) await page.keyboard.press("w");

// 2. out of the port: still nothing
const out = await sailUntil({ x: 600, y: 0 }, (s) => Math.hypot(s.x, s.y) > PORT_RADIUS + 220, "leaving the port");
if (out.gold !== GOLD || JSON.stringify(out.condition) !== JSON.stringify(ship.condition)) failures.push(`leaving the port repaired or charged (gold ${out.gold}, condition ${JSON.stringify(out.condition)})`);

// 3. Back in: arrival saves and navigates, without repair or payment.
await sailUntil({ x: 0, y: 0 }, (s) => Math.hypot(s.x, s.y) <= PORT_RADIUS, "coming back into the port");
await page.waitForURL("**/index.html", { timeout: 15000 });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
const settled = await state();
const price = repairCost(ship);
if (JSON.stringify(settled.condition) !== JSON.stringify(ship.condition)) failures.push(`coming back in changed damage: ${JSON.stringify(settled.condition)}`);
if (settled.gold !== GOLD) failures.push(`coming back in charged the purse (${settled.gold}, expected ${GOLD})`);
const banner = (await page.locator("#purchase-notice").textContent()) ?? "";
if (banner.trim() !== "") failures.push(`arrival unexpectedly announced a repair: "${banner.trim()}"`);
if (!(await page.locator("#dock-dialog").isHidden())) failures.push("arrival opened the repair dialog");
await page.locator(`.fleet-item[data-ship-id="${ship.id}"] [data-repair]`).click();
const repaired = await state();
if (repaired.hull !== 100) failures.push(`manual repair did not fix the hull (${repaired.hull})`);
if (repaired.gold !== GOLD - price) failures.push(`manual repair should cost ${price}: gold ${GOLD} -> ${repaired.gold}`);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(600);
const later = await state();
if (later.gold !== repaired.gold || later.hull !== repaired.hull) failures.push(`reload changed the repair or charged again (gold ${later.gold}, hull ${later.hull})`);

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
assert.deepEqual(failures, [], failures.join("\n"));
console.log(`SMOKE OK: opening, leaving and returning preserve damage and gold; manual repair costs ${price} once`);
