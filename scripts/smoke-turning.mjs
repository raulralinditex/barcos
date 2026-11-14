import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { hullTurnFactor } from "../src/model/turning.js";

/**
 * Browser smoke for the turning radius by tonnage (S48). Needs the local server on 8765.
 * The same helm, held the same time, turns the lightest hull of the catalogue much more
 * than the heaviest one, in proportion to their declared factors.
 */

const build = (hullId) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries: [{ pieceId: "minion", qty: 1, side: "babor", shotsPerPiece: 10, ammoId: "bala-hierro" }],
        // Enough sailors for the heaviest hull (it asks for 120): below its minimum crew the
        // helm is halved, which would hide the turning rate this smoke is about.
        crew: { marino: 130, artillero: 4, soldado: 4 },
        days: 30, cargoKg: 1000, ballastKg: 500, equipmentKg: 500, reserveKg: 500,
      },
      300000,
    ),
    { name: hullId },
  );

const LIGHT = "barca-costera";
const HEAVY = "gran-galeon";

const browser = await chromium.launch();
const failures = [];
const errors = [];

async function turned(hullId) {
  const ship = build(hullId);
  const world = {
    v: 1, seed: 2, rngState: 2, nextId: 900, gold: 0, timeS: 0,
    ship: { x: 600, y: 600, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
    escorts: [], encounters: [],
  };
  const page = await browser.newPage({ viewport: { width: 1300, height: 850 }, locale: "es-AR" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ([shipJson, worldJson]) => {
      if (localStorage.getItem("smoke:seeded")) return;
      localStorage.setItem("smoke:seeded", "1");
      const parsed = JSON.parse(shipJson);
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:autofire:v1", "0");
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [parsed], captainId: parsed.id }));
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 100, world: worldJson }));
    },
    [JSON.stringify(ship), JSON.stringify(world)],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.keyboard.down("d");
  await page.waitForTimeout(1500);
  await page.keyboard.up("d");
  const heading = await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    return JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world).ship.heading;
  });
  await page.close();
  return heading;
}

const light = await turned(LIGHT);
const heavy = await turned(HEAVY);
const expectedRatio = hullTurnFactor(HEAVY) / hullTurnFactor(LIGHT);
const ratio = heavy / light;

if (!(light > 0 && heavy > 0)) failures.push(`the helm did not turn the hulls (light ${light}, heavy ${heavy})`);
if (!(heavy < light)) failures.push(`the heavy hull must turn less than the light one (light ${light.toFixed(3)} rad, heavy ${heavy.toFixed(3)} rad)`);
if (Math.abs(ratio - expectedRatio) > 0.08) {
  failures.push(`the turns are not in proportion to the hull factors: ratio ${ratio.toFixed(3)}, expected ${expectedRatio.toFixed(3)}`);
}

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
assert.deepEqual(failures, [], failures.join("\n"));
console.log(`SMOKE OK: ${LIGHT} turned ${light.toFixed(2)} rad and ${HEAVY} ${heavy.toFixed(2)} rad (ratio ${ratio.toFixed(2)}, expected ${expectedRatio.toFixed(2)})`);
