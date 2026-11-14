import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for the shipyard as a combatant (S74). Needs the local server on 8765.
 *
 *   a captured yard closes the port: the shipyard refuses to sail and the sea refuses to repair.
 */

const runtime = toRuntimeShip(buildShip({
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
}, 12000), { name: "Golden Hind" });

const fleet = { v: 1, captainId: runtime.id, ships: [runtime] };
const captured = { condition: { hull: 60, rigging: 100, crew: 20, morale: 100 }, crew: { marino: 0, artillero: 2, soldado: 6 }, status: "surrendered" };

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: "es-AR" });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.addInitScript(([f, fort]) => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", f);
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, fort, victories: 0 }));
}, [JSON.stringify(fleet), captured]);

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

// "Zarpar" must refuse and say why.
await page.locator("#set-sail-btn").click();
await page.waitForTimeout(500);
check(
  page.url().includes("index.html"),
  `S74: a captured yard must not let the player sail, the page went to ${page.url()}`,
);
const notice = await page.locator("#purchase-notice").textContent();
check(
  /enemig|enemy/i.test(notice ?? ""),
  `S74: the shipyard should say the yard is taken, it says "${notice}"`,
);

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`SMOKE OK: a captured yard blocks sailing, notice reads "${notice.trim()}"`);
