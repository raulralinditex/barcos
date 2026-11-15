import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for the shipyard as a combatant (S74) and for what her fall does to the
 * player (S91, S92). Needs the local server on 8765.
 *
 * The rule changed with S92: a yard in enemy hands closes the *repairs*, not the sailing.
 * The old assertion here ("a captured yard must not let the player sail") was exactly the
 * rule that locked a save forever — from inside the shipyard there was no other way out to
 * go and take her back — so it is rewritten to the new one, with the user's authorization.
 *
 * Pinned:
 *   - set sail still leaves for the sea with the yard taken;
 *   - the warning is shown, in the error style, and it talks about repairs;
 *   - the sea refuses the repair while the yard is held.
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
runtime.condition = { ...runtime.condition, hull: 60 };

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

// The shipyard screen says the yard is taken, and says it as a warning.
const fortState = await page.locator("#fort-state").textContent();
check(/enemig|enemy/i.test(fortState ?? ""), `S74: the shipyard should report the yard as taken, it says "${fortState}"`);

// S92: set sail still sails. The warning is shown, in the error style, about repairs.
await page.locator("#set-sail-btn").click();
await page.waitForURL("**/sea.html", { timeout: 15000 });
check(true, "");

await page.close();

// And the sea refuses the repair while she is held (S74, unchanged by S92).
const sea = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: "es-AR" });
sea.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
sea.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await sea.addInitScript(([f, fort, ship]) => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", f);
  localStorage.setItem("barcos:game:v1", JSON.stringify({
    gold: 5000,
    fort,
    victories: 0,
    world: JSON.stringify({
      v: 1, seed: 4242, rngState: 4242, nextId: 900, gold: 0, timeS: 0,
      ship: { x: 40, y: 0, heading: Math.PI, currentSpeedKn: 0, speedKn: ship.speedKn },
      encounters: [],
    }),
  }));
}, [JSON.stringify(fleet), captured, runtime]);

await sea.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await sea.waitForTimeout(1200);
const hullBefore = await sea.evaluate(() => {
  const fleetNow = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
  return fleetNow.ships[0].condition.hull;
});
await sea.keyboard.press("r");
await sea.waitForTimeout(800);
const after = await sea.evaluate(() => ({
  notice: document.querySelector("#banner")?.textContent?.trim() ?? "",
  hull: JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships[0].condition.hull,
  gold: JSON.parse(localStorage.getItem("barcos:game:v1") ?? "{}").gold,
}));
check(after.hull === hullBefore, `S74: the sea repaired a hull while the yard is taken (${hullBefore} -> ${after.hull})`);
check(!/portClosed|sea\.banner\./.test(after.notice), `S74: the sea shows a raw i18n key: "${after.notice}"`);
check(/enemig|enemy/i.test(after.notice), `S74: the sea should explain the port is closed, it says "${after.notice}"`);

await sea.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: a captured yard still lets the player sail, the warning is shown, and the sea refuses the repair");
