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

// A seed whose wind is strong and steady over the first seconds of a voyage, so the
// downwind and headwind runs differ by more than the noise of one short sail.
const SEED = 99;

const world = (ship) => ({
  v: 1,
  seed: SEED,
  rngState: SEED,
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

/**
 * Sail straight on `heading` for `seconds` and report speed and distance.
 *
 * The heading is part of the saved world, so no helm is needed: the old version
 * steered with the rudder while the clock (and the wind) kept running, so the course
 * it had picked for the wind at t=2 s was not the wind it sailed in, and it read the
 * final position from an autosave that is up to 3 s old. Here both runs start the
 * same way, sail the same interval, and the end state is saved on demand before it
 * is read.
 */
async function sailTo(heading, seconds) {
  const start = world(runtime);
  start.ship.heading = heading;
  const page = await newSea("es", runtime, start);

  for (let i = 0; i < 4; i += 1) await page.keyboard.press("w");
  await page.waitForTimeout(seconds * 1000);

  const speed = await page.locator("#hud-speed").textContent();
  const end = await page.evaluate(() => {
    // the same save the page makes when it is closed, so the read is not stale
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const ship = JSON.parse(game.world).ship;
    return { x: ship.x, y: ship.y, heading: ship.heading };
  });
  await page.close();
  return {
    speed: Number.parseFloat(String(speed).replace(",", ".")),
    distance: Math.hypot(end.x, end.y),
    finalHeading: end.heading,
  };
}

// Read the wind from the same world model the UI uses, so the expected course is
// whatever the seed really blows, not an assumption about it.
const seed = SEED;
const { windAt } = await import("../src/model/wind.js");
// the sail runs from about t=1.5 s to t=5.5 s of the voyage: aim for its middle
const actual = windAt(seed, 3.5);
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
