import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S164: the minimap picks a captain.
 *
 * The player asked for it (verbatim): "al poder tener varias capitanas tendremos que poder ir
 * donde estan, para eso necesitamos que en el panel del mapa, si clicamos sobre el vayamos a
 * donde hemos clicado", and chose what the click does: "Elegir la capitana que está ahí".
 *
 * The claims that matter, measured through the screen:
 *   1. with two captains afloat, the chart says so;
 *   2. the cursor changes over a captain on the chart, and not over empty water;
 *   3. a click on a captain on the chart takes her helm;
 *   4. a click on empty water leaves the helm where it was.
 */

const build = (name) =>
  toRuntimeShip(
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
    { name },
  );

const alfa = build("Alfa");
const beta = build("Beta");

/** A sea with two commands: Alfa under the helm, Beta far away on the chart. */
const world = () => ({
  v: 1,
  seed: 4,
  rngState: 4,
  nextId: 500,
  gold: 20000,
  timeS: 0,
  ship: { x: 900, y: 300, heading: 0, currentSpeedKn: 0, speedKn: alfa.speedKn },
  escorts: [],
  level: 1,
  levelEnemies: [],
  levelVictories: 0,
  order: { throttle: 0, turn: 0 },
  squadrons: [
    {
      id: beta.id,
      ship: { x: -2000, y: 1800, heading: 0, currentSpeedKn: 0, speedKn: beta.speedKn, id: beta.id },
      escorts: [],
      order: { throttle: 0, turn: 0 },
    },
  ],
  encounters: [],
  activeId: alfa.id,
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
      captainId: alfa.id,
      ships: [
        { ...alfa, commandId: alfa.id, yardId: null },
        { ...beta, commandId: beta.id, yardId: null },
      ],
    }),
    JSON.stringify(world()),
  ],
);
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1400);

/* ------------------------- 1: the sea says there are two commands */

const title = (await page.locator("#hud-ship-name").textContent()) ?? "";
check(/2 capitanas/i.test(title), `S164: the sea must say it holds two commands, the title reads "${title}"`);
check(/Alfa/.test(title), `S164: the helm must start on Alfa, the title reads "${title}"`);

/* ------------------------- 2 and 3: the chart picks Beta */

const geo = await page.evaluate(() => {
  const canvas = document.querySelector("#minimap");
  const rect = canvas.getBoundingClientRect();
  // The chart draws WORLD.radiusM (5200 m) into MINIMAP_RADIUS - 6 = 79 px.
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, size: canvas.width, scale: 79 / 5200 };
});

/** Chart pixel of a world point, then the screen point it lands on. */
const onChart = (x, y) => {
  const px = geo.size / 2 + x * geo.scale;
  const py = geo.size / 2 + y * geo.scale;
  return { x: geo.left + (px / geo.size) * geo.width, y: geo.top + (py / geo.size) * geo.height };
};

const betaPoint = onChart(-2000, 1800);
await page.mouse.move(betaPoint.x, betaPoint.y);
await page.waitForTimeout(200);
const cursorOnCaptain = await page.evaluate(() => document.querySelector("#minimap").style.cursor);
check(cursorOnCaptain === "pointer", `S164-E: the chart must say a captain can be picked, the cursor is "${cursorOnCaptain}"`);

await page.mouse.click(betaPoint.x, betaPoint.y);
await page.waitForTimeout(900);
const afterPick = (await page.locator("#hud-ship-name").textContent()) ?? "";
check(/Beta/.test(afterPick), `S164-A: a click on a captain on the chart must take her helm, the title reads "${afterPick}"`);

/* ------------------------- 4: empty water leaves the helm alone */

const empty = onChart(0, 0);
await page.mouse.move(empty.x, empty.y);
await page.waitForTimeout(200);
const cursorOnWater = await page.evaluate(() => document.querySelector("#minimap").style.cursor);
check(cursorOnWater !== "pointer", `S164-E: the chart must not say a captain is there, the cursor is "${cursorOnWater}"`);

await page.mouse.click(empty.x, empty.y);
await page.waitForTimeout(800);
const afterEmpty = (await page.locator("#hud-ship-name").textContent()) ?? "";
check(/Beta/.test(afterEmpty), `S164-D: a click on empty water must not change the helm, the title reads "${afterEmpty}"`);

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
console.log("smoke-minimap-pick: all checks passed");
