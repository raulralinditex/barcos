import { chromium } from "playwright";
import { fleetUpkeep } from "../src/model/fleet.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

const config = {
  hullId: "galeon-pequeno",
  batteries: [
    { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45, cargoKg: 0, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
};
const captain = { ...toRuntimeShip(buildShip(config), { name: "Capitana" }), id: "captain", yardId: null };
const moored = { ...captain, id: "moored", name: "En puerto", yardId: "puerto-casa", sails: false };
const fleet = { v: 1, captainId: captain.id, ships: [captain, moored] };
const upkeep = fleetUpkeep(fleet);
const dayLength = 10;
const gold = 50000;
const world = {
  v: 1, seed: 99, rngState: 99, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 1200, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  encounters: [],
};
const failures = [];
const errors = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
let browser;

async function open(width, lang) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, locale: lang });
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.addInitScript(({ fleet, world, gold, dayLength, lang }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", lang);
    localStorage.setItem("barcos:settings:v1", JSON.stringify({ "time.gameSecondsPerDay": dayLength }));
    localStorage.setItem("barcos:fleet:v1", JSON.stringify(fleet));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold, supplyLeftS: 45 * dayLength, world: JSON.stringify(world) }));
  }, { fleet, world, gold, dayLength, lang });
  return page;
}

async function snapshot(page) {
  return page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const number = (id) => Number(document.querySelector(id)?.textContent.replace(/\./g, "").replace(",", "."));
    return { supply: game.supplyLeftS, gold: game.gold, days: number("#voyage-days"), upkeep: number("#voyage-upkeep"), paidDays: number("#voyage-gold-days") };
  });
}

async function layout(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => {
    const duel = document.querySelector("#duel-panel");
    duel.style.setProperty("display", "block", "important");
    document.querySelector("#duel-roster").style.height = "400px";
    document.querySelector("#time-badge").style.setProperty("display", "block", "important");
  });
  const panel = page.locator("#voyage-panel");
  check(await panel.isVisible(), `${width}: voyage panel is visible`);
  const a = await panel.boundingBox();
  for (const selector of ["#wind-panel", "#time-badge", "#minimap", "#duel-panel"]) {
    const b = await page.locator(selector).boundingBox();
    check(a && b && (a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y), `${width}: voyage panel must not overlap ${selector}`);
  }
  check(a && a.x >= 0 && a.y >= 0 && a.x + a.width <= width && a.y + a.height <= 900, `${width}: voyage panel fits in the viewport`);
}

try {
  browser = await chromium.launch();
  const page = await open(1500, "es");
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  const yardBefore = await page.evaluate(() => ({ game: JSON.parse(localStorage.getItem("barcos:game:v1")), fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")) }));
  await page.waitForTimeout(11000); // Longer than a configured game day, but no sea is running.
  const yardAfter = await page.evaluate(() => ({ game: JSON.parse(localStorage.getItem("barcos:game:v1")), fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")) }));
  check(yardAfter.game.supplyLeftS === yardBefore.game.supplyLeftS && yardAfter.game.gold === yardBefore.game.gold, "shipyard time must not spend supply or wages");
  check(yardAfter.fleet.ships.every((ship, i) => ship.days === yardBefore.fleet.ships[i].days), "shipyard time must not change fleet provision days");
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  if (!(await page.locator("#voyage-panel").count())) {
    failures.push("the sea must show #voyage-panel");
  } else {
    const initial = await snapshot(page);
    check(initial.days === 45, `initial supply days: ${initial.days}`);
    check(initial.upkeep === upkeep && upkeep > captain.upkeep, `daily upkeep must include the moored hull: ${initial.upkeep} vs ${upkeep}`);
    check(initial.paidDays === Math.floor(initial.gold / upkeep), `initial payable days: ${initial.paidDays}`);
    check((await page.locator("#voyage-panel").textContent()).includes("Suministros"), "Spanish labels must be translated");
    await page.keyboard.press("t");
    await page.keyboard.press("t");
    await page.keyboard.press("t");
    await page.waitForFunction((initialDays) => Number(document.querySelector("#voyage-days")?.textContent) <= initialDays - 2, initial.days, { timeout: 10000 });
    const after = await snapshot(page);
    const spent = Math.ceil(initial.supply / dayLength) - Math.ceil(after.supply / dayLength);
    check(after.supply < initial.supply && after.days < initial.days, `sea supply and display must count down: ${JSON.stringify({ initial, after })}`);
    check(after.days === Math.ceil(after.supply / dayLength), "panel must show the live supply clock");
    check(Math.abs(after.gold - (initial.gold - spent * upkeep)) < 1e-8, `whole-day fleet charge: ${initial.gold} -> ${after.gold}, days ${spent}, upkeep ${upkeep}`);
    check(after.upkeep === upkeep && after.paidDays === Math.floor(after.gold / upkeep), "panel must follow the live purse and daily cost");
    await layout(page, 1500);
    await layout(page, 900);
  }
  await page.evaluate(() => localStorage.setItem("barcos:lang:v1", "en"));
  await page.reload({ waitUntil: "networkidle" });
  if (await page.locator("#voyage-panel").count()) {
    check((await page.locator("#voyage-panel").textContent()).includes("Supplies"), "English labels must be translated");
    await layout(page, 900);
  }
  await page.close();
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  if (browser) await browser.close();
}
console.log(JSON.stringify({ failures, errors }, null, 2));
process.exit(failures.length || errors.length ? 1 : 0);
