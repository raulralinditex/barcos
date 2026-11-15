import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

// Run with a local server on port 8765. Each browser context has an isolated save.
const build = (hullId, name) => toRuntimeShip(buildShip({
  hullId,
  batteries: [
    { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
  crew: { marino: 34, artillero: 10, soldado: 26 },
  days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
}, 12000), { name });

const captain = build("galeon-pequeno", "Captain");
const escort = build("zabra", "Escort");
escort.id = `${escort.id}-escort`;
const fleet = { captainId: captain.id, ships: [captain, { ...escort, sails: false }] };
const world = {
  v: 1, seed: 2, rngState: 2, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 700, y: 700, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  encounters: [],
};

const browser = await chromium.launch();
const errors = [];
async function openVoyage(selected) {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(([fleetJson, worldJson]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  }, [JSON.stringify(fleet), JSON.stringify(world)]);
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
// The flota room owns this control now (S105).
await page.click('.screen-tab[data-screen="flota"]').catch(() => {});

  const checkbox = page.locator(`.fleet-check[data-sail="${escort.id}"]`);
  if (selected) await checkbox.check();
  assert.equal(await checkbox.isChecked(), selected);
  assert.equal(await page.locator(`.fleet-check[data-sail="${captain.id}"]`).isChecked(), true);
  await Promise.all([
    page.waitForURL("**/sea.html"),
    page.locator("#set-sail-btn").click(),
  ]);
  await page.waitForTimeout(300);
  return { page, context };
}

async function snapshot(page) {
  return page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const saved = JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world);
    const ctx = document.querySelector("#sea-canvas").getContext("2d");
    // First escort starts 120 m astern, 48 screen pixels to the left.
    const sample = (x, y) => {
      const p = ctx.getImageData(x - 9, y - 9, 18, 18).data;
      let hullPixels = 0;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i] === 60 && p[i + 1] === 90 && p[i + 2] === 122) hullPixels++;
      }
      return hullPixels;
    };
    return {
      captain: saved.ship,
      escorts: saved.escorts,
      captainPixels: sample(700, 450),
      escortPixels: sample(652, 450),
    };
  });
}

try {
  const single = await openVoyage(false);
  const withoutEscort = await snapshot(single.page);
  assert.equal(withoutEscort.escorts.length, 0, "an unchecked ship must stay in port");
  assert.ok(withoutEscort.captainPixels > 0, "the captain remains visible when sailing alone");
  await single.context.close();

  const pair = await openVoyage(true);
  const before = await snapshot(pair.page);
  const failures = [];
  if (before.escorts.length !== 1 || before.escorts[0]?.id !== escort.id) {
    failures.push("the checked escort must put to sea");
  }
  if (before.captainPixels <= 0) failures.push("the captain must remain visible");
  if (before.escortPixels <= withoutEscort.escortPixels) {
    failures.push(`the checked escort must be visible (pixels with/without: ${before.escortPixels}/${withoutEscort.escortPixels})`);
  }
  await pair.page.keyboard.press("w");
  await pair.page.waitForTimeout(4000);
  const after = await snapshot(pair.page);
  if (Math.hypot(after.captain.x - before.captain.x, after.captain.y - before.captain.y) < 10) {
    failures.push("the captain did not move");
  }
  if (!after.escorts[0] || Math.hypot(after.escorts[0].x - before.escorts[0].x, after.escorts[0].y - before.escorts[0].y) < 5) {
    failures.push("the escort did not follow the moving captain");
  }
  await pair.context.close();
  if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
  assert.deepEqual(failures, [], failures.join("; "));
  console.log("PASS: checked escort is visible and follows; unchecked escort stays in port; captain remains visible");
} finally {
  await browser.close();
}
