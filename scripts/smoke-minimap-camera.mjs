import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S166: the chart moves the view.
 *
 * The player asked for it (verbatim): "en el mar, tenemos un panel redondo con una miniatura
 * de todo el mapa, cuando en ese panel cliqueas un punto, mostrar esa parte del mapa en
 * pantalla".
 *
 * The claims that matter, measured through the screen and the saves:
 *   1. a click on the chart looks at that piece of sea, and the sea on screen changes;
 *   2. the captain does NOT move: looking elsewhere is not sailing there;
 *   3. the title says the view is away, so a hull that seems still is read as "the view";
 *   4. `V` brings the view back to the captain.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [{ pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" }],
      crew: { marino: 34, artillero: 10, soldado: 10 },
      days: 45,
      cargoKg: 0,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  ),
  { name: "Alfa" },
);

const beta = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [{ pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" }],
      crew: { marino: 34, artillero: 10, soldado: 10 },
      days: 45,
      cargoKg: 0,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  ),
  { name: "Beta" },
);

const CAPTAIN_AT = { x: 900, y: 300 };

const world = () => ({
  v: 1,
  seed: 4,
  rngState: 4,
  nextId: 500,
  gold: 20000,
  timeS: 0,
  ship: { ...CAPTAIN_AT, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [],
  level: 1,
  levelEnemies: [],
  levelVictories: 0,
  order: { throttle: 0, turn: 0 },
  // A second command far from the first, so taking her helm is a real change of place.
  squadrons: [
    {
      id: beta.id,
      ship: { x: -2000, y: 1800, heading: 0, currentSpeedKn: 0, speedKn: beta.speedKn, id: beta.id },
      escorts: [],
      order: { throttle: 0, turn: 0 },
    },
  ],
  encounters: [],
  activeId: ship.id,
});

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
await page.addInitScript(
  ([fleetJson, worldJson]) => {
    if (localStorage.getItem("barcos:fleet:v1")) return;
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 20000, world: worldJson }));
  },
  [
    JSON.stringify({
      v: 1,
      captainId: ship.id,
      ships: [
        { ...ship, commandId: ship.id, yardId: null },
        { ...beta, commandId: beta.id, yardId: null },
      ],
    }),
    JSON.stringify(world()),
  ],
);
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1400);

const seaPixels = async () =>
  (await page.locator("#sea-canvas").screenshot()).toString("base64").slice(0, 3000);
const captainInSave = async () => {
  await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
  return page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
    const w = game?.world ? JSON.parse(game.world) : null;
    return w?.ship ? { x: w.ship.x, y: w.ship.y } : null;
  });
};

/* ------------------------- 1: the click moves the view, not the hull */

const before = await seaPixels();
const captainBefore = await captainInSave();
check(
  captainBefore?.x === CAPTAIN_AT.x && captainBefore?.y === CAPTAIN_AT.y,
  `S166: the captain must start where the fixture put her, she is at ${JSON.stringify(captainBefore)}`,
);
check(
  !(await page.evaluate(() => document.querySelector("#hud-ship-name").classList.contains("is-viewing-elsewhere"))),
  "S166: the sea starts following the captain, the title must not say otherwise",
);

const geo = await page.evaluate(() => {
  const canvas = document.querySelector("#minimap");
  const rect = canvas.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, size: canvas.width, scale: 79 / 5200 };
});
/** Chart pixel of a world point, then the screen point it lands on. */
const onChart = (x, y) => {
  const px = geo.size / 2 + x * geo.scale;
  const py = geo.size / 2 + y * geo.scale;
  return { x: geo.left + (px / geo.size) * geo.width, y: geo.top + (py / geo.size) * geo.height };
};

const far = onChart(-3000, -2500);
await page.mouse.click(far.x, far.y);
await page.waitForTimeout(900);

const after = await seaPixels();
check(after !== before, "S166: clicking the chart must change the piece of sea on screen");
check(
  await page.evaluate(() => document.querySelector("#hud-ship-name").classList.contains("is-viewing-elsewhere")),
  "S166: the title must say the view is away from the captain",
);

/* ------------------------- 2: the captain did not move */

const captainAfter = await captainInSave();
check(
  captainAfter?.x === CAPTAIN_AT.x && captainAfter?.y === CAPTAIN_AT.y,
  `S166: looking elsewhere must not sail the captain there, she went from ${JSON.stringify(captainBefore)} to ${JSON.stringify(captainAfter)}`,
);

/* ------------------------- 3: V brings the view home */

await page.keyboard.press("v");
await page.waitForTimeout(800);
check(
  !(await page.evaluate(() => document.querySelector("#hud-ship-name").classList.contains("is-viewing-elsewhere"))),
  "S166: V must bring the view back to the captain",
);
const back = await seaPixels();
check(back !== after, "S166: coming back must change the sea on screen again");

/* ------------------------- 4: taking another captain's helm brings the view to her */

// Look somewhere neutral, far from both commands, then hand the helm to Beta with C. The
// player took the wheel of a captain she cannot see: the view has to follow the helm, or she
// steers a hull that is thousands of metres off screen.
const neutral = onChart(2500, -2000);
await page.mouse.click(neutral.x, neutral.y);
await page.waitForTimeout(600);
check(
  await page.evaluate(() => document.querySelector("#hud-ship-name").classList.contains("is-viewing-elsewhere")),
  "S166: the smoke must be looking away before it changes captain",
);
await page.keyboard.press("c");
await page.waitForTimeout(700);
const handedOver = (await page.locator("#hud-ship-name").textContent()) ?? "";
check(/Beta/.test(handedOver), `S166: C must hand the helm to Beta, the title reads "${handedOver}"`);
check(
  !(await page.evaluate(() => document.querySelector("#hud-ship-name").classList.contains("is-viewing-elsewhere"))),
  "S166: taking another captain's helm must bring the view to her, it stayed on a far corner of the sea",
);

await context.close();
await browser.close();

if (errors.length > 0) {
  console.error("Console errors:");
  for (const error of errors) console.error(`  - ${error}`);
}
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("smoke-minimap-camera: all checks passed");
