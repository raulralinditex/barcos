import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { createEnemyCombatant } from "../src/model/combat.js";

/**
 * Browser smoke for the lost tramo of a condition bar (S52). Needs the local server on 8765.
 * A cheap enemy (a short bar) that cannot shoot back is hit with grapeshot, which barely
 * scratches a hull: the loss is a pixel or two, and the player must still see it.
 */

const TRAIL_COLOUR = "#f5e6c8";
const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "metralla" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "metralla" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
    },
    12000,
  ),
  { name: "Captain" },
);
const enemy = { id: 901, type: "enemy", hullId: "patache", x: 600, y: 790, heading: 0, currentSpeedKn: 0, drift: { heading: 0, speedKn: 0 } };
enemy.combat = createEnemyCombatant(enemy, { id: "costera" }, 424242);
enemy.combat.pieces = []; // it cannot shoot back, so only its own bars ever show a tramo
const world = {
  v: 1, seed: 424242, rngState: 424242, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 600, y: 600, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [], encounters: [enemy],
};

const browser = await chromium.launch();
const failures = [];
const errors = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(
  ([shipJson, worldJson, colour]) => {
    if (!localStorage.getItem("smoke:seeded")) {
      localStorage.setItem("smoke:seeded", "1");
      const parsed = JSON.parse(shipJson);
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:autofire:v1", "0");
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [parsed], captainId: parsed.id }));
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 100, world: worldJson }));
    }
    // log every lost-tramo rectangle the canvas is asked to draw, with the time it was drawn
    window.__trail = [];
    const original = CanvasRenderingContext2D.prototype.fillRect;
    CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
      if (this.fillStyle === colour && w > 0 && h === 6) window.__trail.push({ t: performance.now(), w: Math.round(w) });
      return original.call(this, x, y, w, h);
    };
  },
  [JSON.stringify(ship), JSON.stringify(world), TRAIL_COLOUR],
);
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const trailSince = (since) =>
  page.evaluate((from) => window.__trail.filter((entry) => entry.t >= from).map((entry) => entry.w), since);
const now = () => page.evaluate(() => performance.now());

// 1. nothing has been hit yet: no tramo anywhere
if ((await trailSince(0)).length > 0) failures.push("a lost tramo is drawn before anything was hit");

// 2. grapeshot until one volley lands, then the tramo must show, at least 3 px wide
let seen = [];
let firedAt = 0;
for (let attempt = 0; attempt < 5 && seen.length === 0; attempt += 1) {
  firedAt = await now();
  await page.keyboard.press("e");
  await page.waitForTimeout(900);
  seen = await trailSince(firedAt);
  if (seen.length === 0) await page.waitForTimeout(4200); // wait out the reload before trying again
}
if (seen.length === 0) failures.push("five grapeshot volleys never produced a visible lost tramo on the enemy's bars");
else if (Math.min(...seen) < 3) failures.push(`a lost tramo was drawn narrower than 3 px: ${Math.min(...seen)}`);

// 3. with no more fire it drains away completely (0.5 s hold + 1.2 s drain)
await page.waitForTimeout(3200);
const checkFrom = await now();
await page.waitForTimeout(700);
const lingering = await trailSince(checkFrom);
if (lingering.length > 0) failures.push(`the lost tramo never drained away: still ${lingering.length} rectangles 3 s after the last hit`);

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
assert.deepEqual(failures, [], failures.join("\n"));
console.log("SMOKE OK: a hit leaves a visible lost tramo (>= 3 px) that drains away");
