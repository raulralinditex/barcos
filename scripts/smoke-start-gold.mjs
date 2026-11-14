import { chromium } from "playwright";

/**
 * Browser smoke for the starting doubloons (S77). Needs the local server on 8765.
 *
 *   - a NEW game opens the shipyard with the purse set in Settings;
 *   - a game IN PROGRESS keeps its own purse, whatever the setting says.
 */

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const purseOn = async (setup) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: "es-AR" });
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  await page.addInitScript(setup);
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const text = await page.locator("#gold-value").textContent();
  await page.close();
  return Number(String(text).replace(/\./g, "").replace(/[^\d]/g, ""));
};

const SETTINGS = (gold) => () => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:settings:v1", JSON.stringify({ "prices.startGold": 20000 }));
};

// 1. fresh storage, setting at 20 000
const fresh = await purseOn(SETTINGS());
check(fresh === 20000, `S77: a new game should open with the configured 20 000, it opened with ${fresh}`);

// 2. no setting at all: the shipped purse, exactly as before
const shipped = await purseOn(() => localStorage.setItem("barcos:lang:v1", "es"));
check(shipped === 12000, `S77: with no setting the shipped 12 000 must remain, got ${shipped}`);

// 3. a game in progress keeps its own purse
const saved = await purseOn(() => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:settings:v1", JSON.stringify({ "prices.startGold": 20000 }));
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 777 }));
});
check(saved === 777, `S77: a saved game must keep its purse (777), it shows ${saved}`);

// 4. a poorer-than-allowed setting is clamped to the minimum, not honoured
const clamped = await purseOn(() => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:settings:v1", JSON.stringify({ "prices.startGold": 5 }));
});
check(clamped === 2500, `S77: an absurdly low start must clamp to the 2 500 minimum, got ${clamped}`);

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`SMOKE OK: new game ${fresh}, shipped ${shipped}, saved game keeps ${saved}, low setting clamps to ${clamped}`);
