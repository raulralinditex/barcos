import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

// --red disables the handover only in the response served to this browser. The
// source is backed up in memory and cmp verifies that it remains byte-for-byte intact.
const red = process.argv.includes("--red");
const sourcePath = new URL("../src/ui/sea.js", import.meta.url);
const backup = await readFile(sourcePath);
const browser = await chromium.launch();
const errors = [];

const design = buildShip({
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45,
}, 12000);
if (!design?.feasible) throw new Error("smoke setup failed: ship is not feasible");
const captain = { ...toRuntimeShip(design, { name: "Flagship" }), id: "smoke-captain" };
const escort = { ...toRuntimeShip(design, { name: "Escort" }), id: "smoke-escort" };
const world = {
  v: 1, seed: 424242, rngState: 424242, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 2200, y: 1200, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  escorts: [{ id: escort.id, x: 2000, y: 1100, heading: 1.2, currentSpeedKn: 2, speedKn: escort.speedKn }],
  encounters: [],
};

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  if (red) {
    const source = backup.toString("utf8");
    const marker = "function handOverCommand() {";
    if (!source.includes(marker)) throw new Error("RED setup failed: handover marker missing");
    await page.route("**/src/ui/sea.js", (route) => route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: source.replace(marker, `${marker}\n  return false; // smoke-only RED`),
    }));
  }
  await page.addInitScript(({ captain, escort, world }) => {
    if (sessionStorage.getItem("handover-smoke-seeded")) return;
    sessionStorage.setItem("handover-smoke-seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [captain, escort], captainId: captain.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({
      gold: 5000,
      world: JSON.stringify(world),
      combat: {
        player: { condition: { hull: 0 } },
        escorts: { [escort.id]: { condition: { hull: 63, rigging: 58 }, crew: escort.crew } },
      },
    }));
  }, { captain, escort, world });

  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  const hudName = await page.locator("#hud-ship-name").textContent();
  if (!hudName.startsWith(`${escort.name} — `)) throw new Error(`HUD did not hand command to Escort (got ${hudName})`);
  const banner = await page.locator("#banner").textContent();
  if (!banner.includes("Flagship") || !banner.includes("Escort")) throw new Error(`handover banner missing names: ${banner}`);
  const immediate = await page.evaluate(() => ({
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    game: JSON.parse(localStorage.getItem("barcos:game:v1")),
  }));
  const ship = JSON.parse(immediate.game.world).ship;
  if (immediate.fleet.captainId !== escort.id || immediate.fleet.ships.some((s) => s.id === captain.id)) {
    throw new Error("fleet did not remove the flagship and promote the escort");
  }
  if (ship.x !== 2000 || ship.y !== 1100 || ship.heading !== 1.2 || ship.currentSpeedKn !== 2) {
    throw new Error(`promoted ship lost its position, heading or speed: ${JSON.stringify(ship)}`);
  }
  if (immediate.game.combat.player.condition.hull !== 63 || immediate.game.combat.player.condition.rigging !== 58) {
    throw new Error("promoted ship did not keep its combat condition");
  }
  for (let i = 0; i < 4; i += 1) await page.keyboard.press("w");
  await page.waitForTimeout(3300);
  if (!(await page.locator("#gameover-overlay").evaluate((el) => el.classList.contains("is-hidden")))) {
    throw new Error("game over appeared while the escort was still fighting");
  }
  const sailed = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world).ship);
  if (Math.hypot(sailed.x - ship.x, sailed.y - ship.y) < 1) throw new Error("the promoted escort did not sail under player input");
  await page.reload({ waitUntil: "networkidle" });
  if (!(await page.locator("#hud-ship-name").textContent()).startsWith(`${escort.name} — `)) throw new Error("command did not survive reload");

  // Preserve the two other paths through sea boot: a fighting captain retains command,
  // and a lost captain with no fighting escort still sees the sinking screen.
  for (const [captainHull, escortHull] of [[100, 100], [0, 0]]) {
    const other = await browser.newPage();
    other.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await other.addInitScript(({ captain, escort, world, captainHull, escortHull }) => {
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [captain, escort], captainId: captain.id }));
      localStorage.setItem("barcos:game:v1", JSON.stringify({
        gold: 5000,
        world: JSON.stringify(world),
        combat: {
          player: { condition: { hull: captainHull } },
          escorts: { [escort.id]: { condition: { hull: escortHull }, crew: escort.crew } },
        },
      }));
    }, { captain, escort, world, captainHull, escortHull });
    await other.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
    await other.waitForTimeout(1700);
    const name = await other.locator("#hud-ship-name").textContent();
    const hidden = await other.locator("#gameover-overlay").evaluate((el) => el.classList.contains("is-hidden"));
    const savedFleet = await other.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")));
    if (!name.startsWith(`${captain.name} — `) || savedFleet.captainId !== captain.id || hidden !== (captainHull > 0)) {
      throw new Error(`existing captain/game-over path changed: ${JSON.stringify({ captainHull, escortHull, name, hidden })}`);
    }
    await other.close();
  }
  if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
  console.log("GREEN: Escort took command, sailed, and survived reload; no game-over overlay");
  console.log("PRESERVE: a fighting captain keeps command; all lost still shows game over");
} finally {
  await browser.close();
  const cmp = spawnSync("cmp", ["-", sourcePath.pathname], { input: backup, encoding: "utf8" });
  if (cmp.status !== 0) throw new Error(`cmp against in-memory source backup failed: ${cmp.stderr || cmp.stdout}`);
  console.log("cmp: src/ui/sea.js matches its in-memory backup");
}
