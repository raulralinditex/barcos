/**
 * Browser smoke for the editable catalogue (S80-S83), driven through the screen.
 *
 * The rule the whole feature hangs on is that a shipped record and a new one are not
 * the same thing, so the two things worth proving here are:
 *   - a hull created from the settings screen reaches the shipyard and can be bought;
 *   - a shipped value typed outside its historical margin comes back to the margin,
 *     not to the field's own range.
 */

import { chromium } from "playwright";

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const attach = (page) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
};

// One context for both screens: `browser.newPage()` would give each its own
// localStorage, and the whole point is that the shipyard sees what the settings stored.
const context = await browser.newContext({ viewport: { width: 1500, height: 1200 }, locale: "es-AR" });
const page = await context.newPage();
attach(page);

await page.goto("http://localhost:8765/config.html", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

/* ------------------------------------------------ the catalogue is on the screen */

const shown = await page.evaluate(() => ({
  hulls: document.querySelectorAll("[data-hull-id]").length,
  pieces: document.querySelectorAll("[data-piece-id]").length,
  badgeNew: document.querySelectorAll(".catalogue-badge.is-new").length,
}));
check(shown.hulls >= 15, `the catalogue shows only ${shown.hulls} hulls`);
check(shown.pieces >= 11, `the catalogue shows only ${shown.pieces} pieces`);
check(shown.badgeNew === 0, "a shipped record is dressed as new");

/* ------------------------------------------------ a shipped value stays inside its margin */

// galeon-guerra is [400, 500], so its measured margin is 11.1 % around 450. That is much
// tighter than the field's own 1..5000 range, which is the whole point of S82: a wild
// value must come back to the measured margin, not to the range.
const arqueoId = "catalogue-galeon-guerra-arqueo";
const arqueoBefore = await page.locator(`#${arqueoId}`).inputValue();
await page.fill(`#${arqueoId}`, "900");
await page.locator(`#${arqueoId}`).blur();
await page.waitForTimeout(500);
const arqueoAfter = await page.locator(`#${arqueoId}`).inputValue();
const measuredCeiling = 450 * 1.1112;
check(
  Number(arqueoAfter) <= measuredCeiling,
  `a shipped tonnage escaped its measured margin: ${arqueoBefore} -> ${arqueoAfter} (ceiling ${measuredCeiling.toFixed(1)})`,
);
check(
  Number(arqueoAfter) > 400,
  `the tonnage was pulled all the way back to the shipped value instead of to the margin: ${arqueoAfter}`,
);

// A field with no measured range falls back to the convention margin, which is ±50 %.
const priceId = "catalogue-galeon-guerra-priceGold";
const before = await page.locator(`#${priceId}`).inputValue();
await page.fill(`#${priceId}`, "999999");
await page.locator(`#${priceId}`).blur();
await page.waitForTimeout(400);
const after = await page.locator(`#${priceId}`).inputValue();
check(
  Number(after) <= Math.round(Number(before) * 1.5) + 1,
  `a convention-margin price escaped its margin: ${before} -> ${after}`,
);

/* ------------------------------------------------ create a hull and buy it */

await page.fill("#catalogue-new-name", "Bergantín de prueba");
await page.fill("#catalogue-new-arqueoLow", "100");
await page.fill("#catalogue-new-arqueoHigh", "200");
await page.fill("#catalogue-new-priceGold", "800");
await page.click("#catalogue-create-hull");
await page.waitForTimeout(500);

const created = await page.evaluate(() =>
  [...document.querySelectorAll("[data-hull-id]")].map((el) => ({
    id: el.dataset.hullId,
    badge: el.querySelector(".catalogue-badge")?.textContent ?? "",
  })),
);
const mine = created.find((hull) => hull.id === "bergantin-de-prueba");
check(mine !== undefined, `the new hull is not in the catalogue: ${created.map((h) => h.id).join(", ")}`);
check(/nuevo|new/i.test(mine?.badge ?? ""), `the new hull is not marked as new: "${mine?.badge}"`);

// It survives a reload, which is what "stored" means (S83).
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
const survived = await page.evaluate(() =>
  [...document.querySelectorAll("[data-hull-id]")].some((el) => el.dataset.hullId === "bergantin-de-prueba"),
);
check(survived, "the new hull did not survive a reload");

// And the shipyard sells it, which is the point of creating one.
const yard = await context.newPage();
attach(yard);
await yard.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await yard.waitForTimeout(900);
const inYard = await yard.evaluate(() =>
  [...document.querySelectorAll(".hull-card")].map((el) => el.dataset.hullId),
);
check(
  inYard.includes("bergantin-de-prueba"),
  `the shipyard does not sell the new hull: ${inYard.join(", ")}`,
);

// Buying it must produce a real ship, not a hull that renders but cannot be built.
await yard.locator('.hull-card[data-hull-id="bergantin-de-prueba"]').click();
await yard.waitForTimeout(600);
const buildable = await yard.evaluate(() => {
  const button = document.querySelector("#launch-btn");
  return { disabled: button?.disabled ?? true, verdict: document.querySelector("#verdict-issues")?.textContent?.trim() ?? "" };
});
check(!buildable.disabled, `the new hull cannot be built: "${buildable.verdict}"`);

await browser.close();

const result = { errors, shown, arqueo: { before: arqueoBefore, after: arqueoAfter }, price: { before, after }, created: created.length, inYard: inYard.length, buildable, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: a hull created on the settings screen is stored, sold and buildable");
