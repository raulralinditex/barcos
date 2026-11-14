import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for the duel panel (S73). Needs the local server on 8765.
 *
 * The old panel showed only the nearest enemy, so the player could watch the hostile's
 * hull fall and not her own. This checks the other half: the captain's three bars are on
 * screen too, in the same panel, alongside the enemy's.
 */

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

const captain = build("galeon-pequeno", "Golden Hind");
// The captain starts damaged on purpose: a full bar and a damaged one look different, so
// a panel that painted the enemy's numbers on our row would be caught.
captain.condition = { hull: 62, rigging: 48, crew: 71, morale: 100 };
captain.crewAlive = { marino: 24, artillero: 7, soldado: 18 };

const enemy = {
  id: 901,
  type: "enemy",
  hullId: "patache",
  x: 0,
  y: 300,
  heading: 0,
  currentSpeedKn: 0,
  drift: { heading: 0, speedKn: 0 },
};

const world = {
  v: 1,
  seed: 7,
  rngState: 7,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  encounters: [enemy],
};

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.addInitScript(
  ([fleetJson, worldJson]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:autofire:v1", "0");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify({ v: 1, captainId: captain.id, ships: [captain] }), JSON.stringify(world)],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const panelVisible = () => page.locator("#duel-panel").evaluate((el) => !el.classList.contains("is-hidden"));

check(await panelVisible(), "S73: the duel panel should be on screen while a fight is on");

const rows = await page.locator(".duel-row").count();
check(rows === 2, `S73: both hulls should be listed (ours and theirs), found ${rows} rows`);

const ours = await page.locator(".duel-row.is-ours").count();
const theirs = await page.locator(".duel-row.is-theirs").count();
check(ours === 1, `S73: the captain's row should be marked as ours, found ${ours}`);
check(theirs === 1, `S73: the enemy's row should be marked as hostile, found ${theirs}`);

// Each row carries three bars.
const barsPerRow = await page.locator(".duel-row").evaluateAll((nodes) =>
  nodes.map((node) => node.querySelectorAll(".duel-bar").length),
);
check(
  barsPerRow.every((count) => count === 3),
  `S73: every row should carry three bars, found ${JSON.stringify(barsPerRow)}`,
);

// Our row shows OUR damage, not the enemy's. The captain's hull was seeded at 62 %.
const widths = await page.locator(".duel-row.is-ours .duel-fill").evaluateAll((nodes) =>
  nodes.map((node) => Math.round(Number.parseFloat(node.style.width) || 0)),
);
check(widths.length === 3, `S73: our row should paint three bars, found ${widths.length}`);
check(
  widths[0] > 30 && widths[0] < 90,
  `S73: our hull bar should show the captain's damage, it reads ${widths[0]}%`,
);

const enemyWidths = await page.locator(".duel-row.is-theirs .duel-fill").evaluateAll((nodes) =>
  nodes.map((node) => Math.round(Number.parseFloat(node.style.width) || 0)),
);
check(
  enemyWidths[0] !== widths[0],
  `S73: our bar and the enemy's must not read the same (${widths[0]} vs ${enemyWidths[0]}), or the panel shows one hull twice`,
);

// The captain's name is on her row, so the player knows which is hers.
const names = await page.locator(".duel-name").allTextContents();
check(names.includes("Golden Hind"), `S73: the captain should be named in the panel, names are ${JSON.stringify(names)}`);

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: the duel panel lists ${rows} hulls (${ours} ours, ${theirs} hostile) with three bars each, our hull at ${widths[0]}% and theirs at ${enemyWidths[0]}%`,
);
