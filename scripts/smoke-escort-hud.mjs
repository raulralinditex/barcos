import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { hullBarShare } from "../src/model/sea-hud.js";
import { createPlayerCombatant, hullToughness } from "../src/model/combat.js";
import { hullById } from "../src/data/naval-data.js";

/**
 * Browser smoke for the fleet's state at sea (S42, S43, S54, S59). Needs the local server on 8765.
 *
 *   S42  an escort carries the same bars as the captain and shows up on the minimap;
 *   S54  an escort shows her bars only while she has an enemy in gunshot;
 *   S59  every ship's condition bars are as long as the hull actually endures;
 *   S43  the fast-forward drops to x1 when an enemy engages, once per engagement.
 */

const BAR_WIDTH = 108; // BAR.width in sea.js
const build = (hullId, name) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries: [
          { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 6000,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      12000,
    ),
    { name },
  );

// The captain is the toughest hull in view, so the three bars in this scenario have
// three different lengths (S59): the captain's, the escort's and the enemy's. With the
// lightest hull in the captain's chair the escort's bar would be the longest one and the
// "no bars while out of gunshot" check below could not tell which ship it saw.
const captain = build("zabra", "Captain");
const escort = build("galeon-pequeno", "Escort");
escort.id = `${escort.id}-escort`;
const fleet = { v: 1, captainId: captain.id, ships: [captain, { ...escort, sails: true }] };

const enemy = (x, y, hullId = "patache") => ({
  id: 901,
  type: "enemy",
  hullId,
  x,
  y,
  heading: 0,
  currentSpeedKn: 0,
  drift: { heading: 0, speedKn: 0 },
});

const seaWorld = ({ escorts = [], encounters = [] } = {}) => ({
  v: 1,
  seed: 2,
  rngState: 2,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  escorts,
  encounters,
});

const browser = await chromium.launch();
const failures = [];
const errors = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

async function openSea(world) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ([fleetJson, worldJson]) => {
      if (window.__seeded) return;
      window.__seeded = true;
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
    },
    [JSON.stringify(fleet), JSON.stringify(world)],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  return page;
}

/** Lengths of every run of the hull-bar colour on the sea canvas: one per ship that shows bars. */
const hullBarRuns = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("#sea-canvas");
    const { width, height } = canvas;
    const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
    const runs = [];
    for (let y = 0; y < height; y += 1) {
      let start = -1;
      for (let x = 0; x <= width; x += 1) {
        const i = (y * width + x) * 4;
        const hit = x < width && data[i] === 161 && data[i + 1] === 60 && data[i + 2] === 44;
        if (hit && start < 0) start = x;
        if (!hit && start >= 0) {
          if (x - start >= 8) runs.push({ x: start, y, len: x - start });
          start = -1;
        }
      }
    }
    return runs;
  });

const has = (runs, expected) => runs.some((run) => Math.abs(run.len - expected) <= 3);

/* ------------------------------------------------- S42 + S59: every hull shows bars, as long as it endures */

const toughness = {
  captain: createPlayerCombatant(captain).hullToughness,
  escort: createPlayerCombatant(escort).hullToughness,
  enemy: hullToughness(hullById("patache")),
};
const reference = Math.max(toughness.captain, toughness.escort, toughness.enemy);
const expected = {
  captain: Math.round(BAR_WIDTH * hullBarShare(toughness.captain, reference)),
  escort: Math.round(BAR_WIDTH * hullBarShare(toughness.escort, reference)),
  enemy: Math.round(BAR_WIDTH * hullBarShare(toughness.enemy, reference)),
};

// The escort starts far to the south, with an enemy of her own to the south-east (S54):
// both enemies are inside the captain's engage radius, so both are fighting, and the
// escort is in gunshot of her own. Their blocks never overlap.
let page = await openSea(
  seaWorld({
    escorts: [{ id: escort.id, x: 0, y: 330, heading: 0, currentSpeedKn: 0, speedKn: escort.speedKn }],
    encounters: [enemy(0, -450), { ...enemy(400, 400), id: 902 }],
  }),
);
const runs = await hullBarRuns(page);
check(has(runs, expected.captain), `the captain's hull bar should be ${expected.captain} px, runs: ${runs.map((r) => r.len)}`);
check(
  has(runs, expected.escort),
  `S42/S59: the escort should show a hull bar of ${expected.escort} px (endurance ${toughness.escort.toFixed(2)}), runs: ${runs.map((r) => r.len)}`,
);
check(
  has(runs, expected.enemy),
  `S59: the enemy patache should show a hull bar of ${expected.enemy} px (endurance ${toughness.enemy.toFixed(2)}), runs: ${runs.map((r) => r.len)}`,
);
check(
  new Set([expected.captain, expected.escort, expected.enemy]).size >= 2,
  "the scenario should have hulls of different endurance, or it proves nothing",
);
check(expected.enemy < expected.captain, "the light enemy hull must get a shorter bar than the captain");

/* ------------------------------------------------- S54: out of gunshot, the escort shows nothing */

page = await openSea(
  seaWorld({
    escorts: [{ id: escort.id, x: 0, y: 330, heading: 0, currentSpeedKn: 0, speedKn: escort.speedKn }],
    encounters: [enemy(0, -450)],
  }),
);
const lonelyRuns = await hullBarRuns(page);
check(has(lonelyRuns, expected.captain), `the captain keeps her bars, runs: ${lonelyRuns.map((r) => r.len)}`);
check(
  !has(lonelyRuns, expected.escort),
  `S54: an escort 780 m from the only enemy must show no bars of ${expected.escort} px, runs: ${lonelyRuns.map((r) => r.len)}`,
);
await page.close();

/* ------------------------------------------------- S42: the escort is on the minimap */

page = await openSea(
  seaWorld({
    escorts: [{ id: escort.id, x: 0, y: 330, heading: 0, currentSpeedKn: 0, speedKn: escort.speedKn }],
    encounters: [enemy(0, -450)],
  }),
);

const minimapColours = await page.evaluate(() => {
  const canvas = document.querySelector("#minimap");
  const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
  const seen = new Set();
  for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  return [...seen];
});
// the escort arrow is drawn in #8fd0ff; the captain's is white
check(minimapColours.includes("143,208,255"), "S42: the escort is missing from the minimap");
await page.close();

/* ------------------------------------------------- S43: the fast-forward drops to x1 on engagement */

page = await openSea(seaWorld({ encounters: [enemy(1500, 0, "patache")] }));
await page.keyboard.press("t");
await page.keyboard.press("t");
const badgeText = () => page.locator("#time-badge").textContent();
const badgeHidden = () => page.locator("#time-badge").evaluate((el) => el.classList.contains("is-hidden"));
check((await badgeText()).includes("4"), `the badge should show x4 before the fight, got "${await badgeText()}"`);

// The enemy is dead ahead (east): sail straight at it until it is inside the engage radius.
for (let i = 0; i < 6; i += 1) await page.keyboard.press("w");
let engaged = false;
for (let i = 0; i < 60 && !engaged; i += 1) {
  await page.waitForTimeout(250);
  engaged = await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const world = JSON.parse(game.world);
    return world.encounters.some((e) => e.type === "enemy" && Math.hypot(e.x - world.ship.x, e.y - world.ship.y) < 620);
  });
}
check(engaged, "the captain never reached the enemy: the scenario did not engage");
await page.waitForTimeout(400);
check(await badgeHidden(), "S43: the time did not go back to x1 when the enemy engaged");

// It fires once per engagement: pressing T again in the middle of the fight speeds up again.
await page.keyboard.press("t");
await page.waitForTimeout(500);
check(
  !(await badgeHidden()) && (await badgeText()).includes("2"),
  `S43: T must work again during the fight, the badge says "${await badgeText()}"`,
);
await page.close();

await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
assert.deepEqual(failures, [], failures.join("\n"));
console.log(`SMOKE OK: escorts show bars and a minimap arrow, bars scale with endurance (${JSON.stringify(expected)}), time drops to x1 once per engagement`);
