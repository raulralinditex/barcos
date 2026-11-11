import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

// Build a real runtime ship with the same code the shipyard uses.
const ship = buildShip(
  {
    hullId: "galeon-pequeno",
    batteries: [
      { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      { pieceId: "falcon", qty: 2, side: "babor", shotsPerPiece: 30, ammoId: "metralla" },
      { pieceId: "falcon", qty: 2, side: "estribor", shotsPerPiece: 30, ammoId: "metralla" },
    ],
    crew: { marino: 34, artillero: 10, soldado: 26 },
    days: 45,
    cargoKg: 6_000,
    ballastKg: 3_000,
    equipmentKg: 2_500,
    reserveKg: 1_500,
  },
  12000,
);
if (!ship || !ship.feasible) {
  console.error("smoke setup failed: the starter ship no longer builds");
  process.exit(1);
}
const runtime = toRuntimeShip(ship, { name: "Golden Hind" });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.addInitScript(
  ([shipJson, goldValue]) => {
    localStorage.setItem("barcos:current-ship:v1", shipJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: goldValue }));
  },
  [JSON.stringify(runtime), 3874],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

const hud = async () => ({
  name: await page.locator("#hud-ship-name").textContent(),
  gold: await page.locator("#hud-gold").textContent(),
  zone: await page.locator("#hud-zone").textContent(),
  throttle: await page.locator("#hud-throttle").textContent(),
  speed: await page.locator("#hud-speed").textContent(),
  heading: await page.locator("#hud-heading").textContent(),
});

const atRest = await hud();

// full sail ahead and a touch of rudder
await page.keyboard.press("w");
await page.keyboard.down("d");
await page.waitForTimeout(1600);
await page.keyboard.up("d");
const sailing = await hud();

// keep sailing so treasures can be collected and the autosave can fire
await page.waitForTimeout(3500);
const later = await hud();

// teleport near a treasure through the exposed world? Not exposed: instead verify the
// autosave wrote a parseable world with the ship away from the origin.
const saved = await page.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  if (!game || !game.world) return null;
  const world = JSON.parse(game.world);
  return {
    gold: game.gold,
    shipX: Math.round(world.ship.x),
    shipY: Math.round(world.ship.y),
    speedKn: world.ship.speedKn,
    encounters: world.encounters.length,
    version: world.v,
  };
});

// throttle back to zero
await page.keyboard.press("s");
await page.keyboard.press("s");
await page.keyboard.press("s");
await page.keyboard.press("s");
await page.waitForTimeout(400);
const stopped = await hud();

await page.screenshot({ path: "/tmp/sea.png" });

console.log(JSON.stringify({ errors, atRest, sailing, later, stopped, saved }, null, 2));

await browser.close();
