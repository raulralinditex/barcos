import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for the wind (S16-S18), driven through the UI only.
 *
 * Checks the observable chain:
 *   1. the wind panel exists and its canvas is drawn (not a blank square)
 *   2. the wind readout shows a compass point and a strength, and it moves
 *   3. sailing downwind covers more ground than sailing into it
 *   4. both indicators render (the forecast arrow must be visible next to the now one)
 */

const runtime = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 6_000,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  ),
  { name: "Golden Hind" },
);

const world = (ship) => ({
  v: 1,
  seed: 424242,
  rngState: 424242,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  encounters: [],
});

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

async function newSea(locale = "es", ship = runtime, worldJson = world(ship)) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([shipJson, wJson, lang]) => {
      localStorage.setItem("barcos:lang:v1", lang);
      const s = JSON.parse(shipJson);
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [s], captainId: s.id }));
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: wJson }));
    },
    [JSON.stringify(ship), JSON.stringify(worldJson), locale],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  return page;
}

/* ---------------------------------------------------------------- 1 & 2: the panel lives */

const page = await newSea("es");

const panel = await page.evaluate(() => {
  const canvas = document.querySelector("#wind-canvas");
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) painted += 1;
  }
  return {
    painted,
    now: document.querySelector("#wind-now").textContent,
    legend: [...document.querySelectorAll(".wind-legend .wind-key")].map((el) => el.textContent.trim()),
  };
});

check(panel !== null, "the wind panel is missing");
if (panel) {
  check(panel.painted > 400, `the compass rose looks empty (${panel.painted} painted px)`);
  check(/[ENSO]+\s+·\s+[\d,]+/.test(panel.now), `wind readout malformed: "${panel.now}"`);
  check(panel.legend.length === 2, `the legend must name both arrows, got ${panel.legend.join(", ")}`);
}

/* ---------------------------------------------------------------- 2: the wind moves */

const readoutAt = async (t) => page.locator("#wind-now").textContent();
const before = await readoutAt();
await page.waitForTimeout(6000);
const after = await readoutAt();
check(before !== after, `the wind readout is frozen ("${before}" unchanged)`);

/* ---------------------------------------------------------------- 3: downwind vs headwind */

async function sailTo(heading, seconds) {
  const page = await newSea("es");
  const target = heading;

  // Steer with a proportional rudder: hold the helm until the bow is near the
  // target, then release. The hold time follows how far off course we are, so a
  // full turn and a small correction both converge without overshooting.
  for (let i = 0; i < 40; i += 1) {
    const current = await page.evaluate(() => {
      const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
      return JSON.parse(game.world).ship.heading;
    });
    const diff = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    if (Math.abs(diff) < 0.04) break;
    const holdMs = Math.min(500, Math.max(80, Math.abs(diff) * 500));
    await page.keyboard.down(diff > 0 ? "d" : "a");
    await page.waitForTimeout(holdMs);
    await page.keyboard.up(diff > 0 ? "d" : "a");
    await page.waitForTimeout(120);
  }

  await page.keyboard.press("w");
  await page.keyboard.press("w");
  await page.keyboard.press("w");
  await page.keyboard.press("w");
  await page.waitForTimeout(seconds * 1000);
  const speed = await page.locator("#hud-speed").textContent();
  const distance = await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const s = JSON.parse(game.world).ship;
    return Math.hypot(s.x, s.y);
  });
  const finalHeading = await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return JSON.parse(game.world).ship.heading;
  });
  await page.close();
  return {
    speed: Number.parseFloat(String(speed).replace(",", ".")),
    distance,
    finalHeading,
  };
}

// The seeded wind at t≈0 blows from the east (it blows towards west/south-west).
// Read the actual direction from the world model the UI is using.
const seed = 424242;
const { windAt } = await import("../src/model/wind.js");
const actual = windAt(seed, 2);
const downwindHeading = actual.direction; // sailing where the wind blows
const headwindHeading = actual.direction + Math.PI;

const down = await sailTo(downwindHeading, 4);
const head = await sailTo(headwindHeading, 4);

check(
  down.distance > head.distance * 1.05,
  `downwind should cover more ground: down=${down.distance.toFixed(0)}m head=${head.distance.toFixed(0)}m`,
);
check(
  Number.parseFloat(down.speed) > Number.parseFloat(head.speed),
  `downwind should be faster: down=${down.speed} head=${head.speed}`,
);

/* ---------------------------------------------------------------- 4: the forecast arrow */

// The forecast arrow is drawn in a different colour; count its pixels on the rose.
const arrows = await page.evaluate(() => {
  const canvas = document.querySelector("#wind-canvas");
  const ctx = canvas.getContext("2d");
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let gold = 0;
  let blue = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 40) continue;
    if (r > 190 && g > 140 && b < 80) gold += 1;
    if (r > 130 && g > 170 && b > 200) blue += 1;
  }
  return { gold, blue };
});
check(arrows.gold > 8, `the "now" arrow is missing (${arrows.gold} px)`);
check(arrows.blue > 4, `the forecast arrow is missing (${arrows.blue} px)`);

await page.screenshot({ path: "/tmp/wind-smoke.png" });
await page.close();
await browser.close();

const result = { errors, panel, windMoves: before !== after, down, head, arrows, windAtT0: actual, downwindHeading, headwindHeading, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: wind panel, moving wind, downwind vs headwind, both arrows");
