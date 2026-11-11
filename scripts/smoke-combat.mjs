import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for T7: real-time broadside combat, end to end through the UI.
 *
 * Seeds an autosave with a coastal corsair 400 m due north of the player (dead on
 * the starboard beam for a ship heading east) and a gun deck heavy enough to
 * settle the fight, so the assertions are about mechanics, not about whether a
 * scripted player can outmaneuver the AI.
 *
 * Checks the observable chain only — the HUD and the autosaved world, never
 * internal module state:
 *   1. the target panel appears when the corsair closes to engage range
 *   2. Q on the empty side reports no target instead of firing
 *   3. E fires the starboard broadside, spends rounds and strips enemy hull
 *   4. the defeated enemy becomes a lootable wreck
 *   5. the console stays clean throughout
 */

const ship = buildShip(
  {
    hullId: "galeon-guerra",
    batteries: [
      { pieceId: "sacre", qty: 8, side: "babor", shotsPerPiece: 120, ammoId: "bala-hierro" },
      { pieceId: "sacre", qty: 8, side: "estribor", shotsPerPiece: 120, ammoId: "bala-hierro" },
    ],
    crew: { marino: 70, artillero: 24, soldado: 40 },
    days: 45,
    cargoKg: 6_000,
    ballastKg: 3_000,
    equipmentKg: 2_500,
    reserveKg: 1_500,
  },
  30000,
);
if (!ship || !ship.feasible) {
  console.error("smoke setup failed: the gun deck no longer builds");
  process.exit(1);
}
const runtime = toRuntimeShip(ship, { name: "Golden Hind" });

const world = {
  v: 1,
  seed: 424242,
  rngState: 424242,
  nextId: 900,
  gold: 0,
  ship: { x: 210, y: 70, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  encounters: [
    {
      id: 901,
      type: "enemy",
      x: 210,
      y: 470,
      hullId: "zabra",
      zoneId: "costera",
      drift: { heading: Math.PI / 2, speedKn: 2 },
    },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.addInitScript(
  ([shipJson, worldJson]) => {
    localStorage.setItem("barcos:current-ship:v1", shipJson);
    localStorage.setItem(
      "barcos:game:v1",
      JSON.stringify({ gold: 5000, world: worldJson }),
    );
  },
  [JSON.stringify(runtime), JSON.stringify(world)],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });

const num = (text) =>
  Number.parseFloat(String(text).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));

const targetPanel = () =>
  page.locator("#target-panel").evaluate((el) => !el.classList.contains("is-hidden"));
const targetHull = () =>
  page.locator("#target-hull").evaluate((el) => Number.parseFloat(el.style.width) || 0);
const playerRounds = () => page.locator("#hud-rounds").textContent();
const banner = () => page.locator("#banner").textContent();
const savedEncounters = () =>
  page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return game?.world ? JSON.parse(game.world).encounters : [];
  });

// --- 1. the corsair closes in and the target panel appears ------------------
let engaged = false;
for (let i = 0; i < 20 && !engaged; i += 1) {
  await page.waitForTimeout(400);
  engaged = await targetPanel();
}
const targetName = engaged ? await page.locator("#target-name").textContent() : null;

// --- 2. the empty side must not fire ---------------------------------------
await page.keyboard.press("q");
await page.waitForTimeout(250);
const emptySideBanner = await banner();
const roundsAfterEmpty = await playerRounds();

// --- 3. the bearing side fires, spends rounds and strips hull --------------
const roundsBefore = await playerRounds();
const hullBefore = await targetHull();
let hullAfter = hullBefore;

// Fire on the broadside cadence and watch for the real outcome: the wreck the
// defeated corsair leaves in the saved world. A beaten enemy strikes its sails
// and runs (COMBAT.fleeHullPct), so the player has to keep way on and steer to
// stay in arc — otherwise the fight simply never resolves, which is the point.
let wreck = null;
for (let i = 0; i < 120 && !wreck; i += 1) {
  await page.keyboard.press("w"); // steerage way
  await page.keyboard.press("e"); // starboard battery
  await page.waitForTimeout(400);
  // hunt: turn toward the enemy whenever the panel shows it outside the arc
  const inArc = await targetPanel();
  if (!inArc) {
    await page.keyboard.down("d");
    await page.waitForTimeout(300);
    await page.keyboard.up("d");
  }
  if (inArc) hullAfter = await targetHull();
  const found = (await savedEncounters()).find((e) => e.type === "wreck");
  if (found) wreck = found;
}
const roundsAfter = await playerRounds();

await page.screenshot({ path: "/tmp/combat.png" });

const result = {
  errors,
  engaged,
  targetName,
  emptySideBanner,
  roundsAfterEmpty,
  roundsBefore,
  roundsAfter,
  hullBefore,
  hullAfter,
  wreck: wreck ? { gold: wreck.gold, zoneId: wreck.zoneId } : null,
};
console.log(JSON.stringify(result, null, 2));

const failures = [];
if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (!engaged) failures.push("the target panel never appeared");
if (roundsAfterEmpty !== "0/0" && emptySideBanner !== "Sin blanco a babor") {
  failures.push(`the empty side should not fire, banner was: ${emptySideBanner}`);
}
if (roundsBefore === roundsAfter) failures.push("firing never spent any rounds");
if (hullAfter >= hullBefore) {
  failures.push(`the enemy hull never dropped (${hullBefore} -> ${hullAfter})`);
}
if (!wreck) failures.push("the defeated enemy left no wreck");

await browser.close();
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: engagement, side gating, gunnery, sinking and prize observed");
