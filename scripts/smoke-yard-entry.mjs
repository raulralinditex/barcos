import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * S154: the yard opens on the fleet, not on the buy room.
 *
 * The player reported: "cuando entro al astillero, me muestra el tab de comprar barco en
 * vez del tab de flota". S105 replaced the entry rule `captain ? "flota" : "comprar"`
 * with a flat `"comprar"`, so a captain with a fleet landed on the hull shelf every time
 * she opened the shipyard, even though the comment right above the line still said the
 * yard opens on the fleet (S97).
 *
 * The rule this pins:
 *   a captain with a fleet and no hash opens on Flota;
 *   a brand-new save with no hull still opens on Comprar, because there is no fleet to show;
 *   an explicit hash still wins, which is what the sea relies on when she lands the
 *   player on the buy room after a voyage (S109).
 *
 * Needs the local server on 8765 (`node scripts/serve.mjs`).
 */

const captain = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [{ pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" }],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 0,
      ballastKg: 3000,
      equipmentKg: 2500,
      reserveKg: 1500,
    },
    12000,
  ),
  { name: "Capitana" },
);

const fleet = { v: 1, captainId: captain.id, ships: [captain] };

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

const activePanel = () =>
  page.evaluate(() => document.querySelector(".screen-panel.is-active")?.dataset.screenPanel ?? null);

// 1. A captain with a fleet, entering the yard with no room in the URL.
await page.addInitScript(
  ([fleetJson]) => {
    if (localStorage.getItem("__seeded")) return;
    localStorage.setItem("__seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 200000 }));
  },
  [JSON.stringify(fleet)],
);
await page.goto("http://127.0.0.1:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
check((await activePanel()) === "flota", `S154: the yard must open on the fleet, it opened on ${await activePanel()}`);
check(
  (await page.locator("#fleet-list .fleet-item").count()) > 0,
  "S154: the fleet room must list the hulls she has",
);

// 2. The sea lands the player on the buy room with an explicit hash (S109): that wins.
// A hash-only navigation does not reload the document, so the boot rule is only
// exercised after a real load. Each case reloads with the room already in the URL.
await page.goto("http://127.0.0.1:8765/index.html#comprar", { waitUntil: "networkidle" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
check((await activePanel()) === "comprar", `S154: an explicit hash must still win, got ${await activePanel()}`);

// 3. Any other room named in the URL keeps working.
await page.goto("http://127.0.0.1:8765/index.html#astillero", { waitUntil: "networkidle" });
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
check((await activePanel()) === "astillero", `S154: the hash must open the yard room, got ${await activePanel()}`);

// 4. A brand-new save has no fleet to show, so the shelf is the only sensible room.
const fresh = await context.newPage();
fresh.on("pageerror", (error) => errors.push(`fresh pageerror: ${error.message}`));
await fresh.goto("http://127.0.0.1:8765/index.html", { waitUntil: "networkidle" });
await fresh.evaluate(() => localStorage.clear());
await fresh.reload({ waitUntil: "networkidle" });
await fresh.waitForTimeout(600);
const freshPanel = await fresh.evaluate(
  () => document.querySelector(".screen-panel.is-active")?.dataset.screenPanel ?? null,
);
check(freshPanel === "comprar", `S154: a new save must still open on Comprar, it opened on ${freshPanel}`);

await fresh.close();
await browser.close();

if (errors.length > 0) failures.push(`page errors: ${errors.join(" | ")}`);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("S154 ok: the yard opens on the fleet, and an explicit room still wins");
