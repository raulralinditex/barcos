import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

// Browser-level S53: the settings screen feeds the sea, and the HUD and floating
// reload bar respond to the guns actually crewed, not the shipyard's total.
const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const attach = (page) => {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
};
const input = (id) => `[data-field-id="${id}"] input`;
const screen = await browser.newPage({ viewport: { width: 1400, height: 900 } });
attach(screen);
await screen.goto("http://localhost:8765/config.html", { waitUntil: "networkidle" });
const cap = screen.locator(input("combat.maxBonus"));
if (await cap.count() !== 1) {
  console.error("SMOKE FAILED: missing gunnery acceleration setting");
  await browser.close();
  process.exit(1);
}
check(await cap.inputValue() === "1.3", "cap must default to 1.3");
await cap.fill("1");
await screen.locator("#settings-apply").click();
const capOne = await screen.evaluate(() => JSON.parse(localStorage.getItem("barcos:settings:v1")));
await cap.fill("1.3");
await screen.locator("#settings-apply").click();
const capDefault = await screen.evaluate(() => JSON.parse(localStorage.getItem("barcos:settings:v1")));
await screen.locator(input("combat.gunners-minion")).fill("1");
await screen.locator("#settings-apply").click();
const heavier = await screen.evaluate(() => JSON.parse(localStorage.getItem("barcos:settings:v1")));
await screen.close();

const ship = toRuntimeShip(buildShip({
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 4, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 4, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
  crew: { marino: 34, artillero: 12, soldado: 26 }, days: 45,
  cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
}, 12000), { name: "Gunnery smoke" });
const world = { v: 1, seed: 424242, rngState: 424242, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 210, y: 70, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  encounters: [{ id: 901, type: "enemy", x: 210, y: 270, hullId: "patache", zoneId: "costera", drift: { heading: 0, speedKn: 0 } }],
};

async function voyage(gunners, settings) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  attach(page);
  const captain = { ...ship, crewAlive: { ...ship.crew, artillero: gunners } };
  await page.addInitScript(([captain, world, settings]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:autofire:v1", "0");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [captain], captainId: captain.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 1000, world: JSON.stringify(world) }));
    localStorage.setItem("barcos:settings:v1", JSON.stringify(settings));
  }, [captain, world, settings]);
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const before = await page.locator("#hud-rounds").textContent();
  const barPixels = () => page.evaluate(() => {
    const ctx = document.querySelector("#sea-canvas").getContext("2d");
    const dpr = devicePixelRatio || 1;
    const pixels = ctx.getImageData(590 * dpr, 340 * dpr, 220 * dpr, 220 * dpr).data;
    let n = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (Math.abs(pixels[i] - 159) < 12 && Math.abs(pixels[i + 1] - 199) < 12 && Math.abs(pixels[i + 2] - 232) < 12) n++;
    }
    return n;
  });
  const barBefore = await barPixels();
  await page.keyboard.press("e");
  await page.waitForTimeout(150);
  const barAfter = await barPixels();
  const after = await page.locator("#hud-rounds").textContent();
  const saved = await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    return JSON.parse(localStorage.getItem("barcos:game:v1")).combat.player;
  });
  await page.close();
  return { before, after, barBefore, barAfter, fired: saved.pieces.filter(p => p.shotsLeft === 24).length,
    timer: Math.max(...saved.pieces.map(p => p.reloadTimer)) };
}
const short = await voyage(2, capDefault);
const exact = await voyage(4, capOne);
const extra = await voyage(12, capDefault);
const configured = await voyage(2, heavier);
check(short.fired === 2, `short crew should fire two starboard guns: ${JSON.stringify(short)}`);
check(short.before !== short.after, "HUD rounds did not change");
check(short.barBefore > 0 && short.barAfter < short.barBefore, `reload bar did not move: ${JSON.stringify(short)}`);
check(exact.fired === 4 && extra.fired === 4, "fully crewed sides must fire four guns");
check(extra.timer < exact.timer * 0.9, `cap did not shorten reload: ${extra.timer} versus ${exact.timer}`);
check(configured.fired === 1, `changed per-gun setting did not reach sea: ${JSON.stringify(configured)}`);
if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
console.log(JSON.stringify({ short, exact, extra, configured, failures }, null, 2));
await browser.close();
if (failures.length) { console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log("SMOKE OK: gunnery, reload bars, cap and settings");
