import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for the time-warp key (S31), driven through the UI only.
 *
 * T cycles the speed of the simulation through x1, x2, x4 and x8 so the player does
 * not wait out the long stretches between objectives. The proof is the world clock,
 * which drives the wind and every reload: each press must multiply it, and the fifth
 * press must come back to real time. A badge says which multiplier is on, in both
 * languages.
 */

const runtime = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 6_000,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  ),
  { name: "Golden Hind" },
);

// Far from the port and from everything else: nothing to dock at, nothing to fight.
const world = {
  v: 1,
  seed: 99,
  rngState: 99,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 1200, y: 0, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  encounters: [],
};

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

async function open(locale) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([shipJson, worldJson, lang]) => {
      localStorage.setItem("barcos:lang:v1", lang);
      const s = JSON.parse(shipJson);
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [s], captainId: s.id }));
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
    },
    [JSON.stringify(runtime), JSON.stringify(world), locale],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  return page;
}

/** World clock in seconds, read after forcing the same save the page makes on close. */
const clock = (page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return JSON.parse(game.world).timeS;
  });

/** How many world seconds pass in `ms` of real time. */
async function rate(page, ms) {
  const before = await clock(page);
  await page.waitForTimeout(ms);
  return ((await clock(page)) - before) / (ms / 1000);
}

/* ---------------------------------------------------------------- es */

const page = await open("es");
const badge = page.locator("#time-badge");

const normal = await rate(page, 1500);
check(normal > 0.8 && normal < 1.2, `the world clock does not run in real time (${normal.toFixed(2)}x)`);
check(await badge.isHidden(), "the time-warp badge shows before the key is pressed");

/** Press T once and prove both the world clock and the badge for one multiplier. */
async function expectScale(scale, label) {
  await page.keyboard.press("t");
  await page.waitForTimeout(150);
  const measured = await rate(page, 1200);
  check(
    measured > scale * 0.8 && measured < scale * 1.25,
    `${label}: the world clock should run at ${scale}x, measured ${measured.toFixed(2)}x`,
  );
  check(await badge.isVisible(), `${label}: the badge is hidden at ${scale}x`);
  const text = (await badge.textContent())?.trim();
  check(text === `×${scale}`, `${label}: the badge says "${text}", expected "×${scale}"`);
  const banner = await page.locator("#banner").textContent();
  check(
    banner.includes(`×${scale}`),
    `${label}: the banner does not announce ×${scale}: "${banner}"`,
  );
  return measured;
}

const fast = await expectScale(2, "first press");
const four = await expectScale(4, "second press");
const eight = await expectScale(8, "third press");

await page.keyboard.press("t");
await page.waitForTimeout(150);
const back = await rate(page, 1500);
check(back > 0.8 && back < 1.2, `the fourth T does not come back to real time (${back.toFixed(2)}x)`);
check(await badge.isHidden(), "the badge stays after the cycle returns to x1");
const bannerBack = await page.locator("#banner").textContent();
check(/×1/.test(bannerBack), `the banner does not announce the return to ×1: "${bannerBack}"`);
await page.close();

/* ---------------------------------------------------------------- en */

const pageEn = await open("en");
await pageEn.keyboard.press("t");
await pageEn.waitForTimeout(200);
const bannerEn = await pageEn.locator("#banner").textContent();
check(/time/i.test(bannerEn) && !/tiempo/i.test(bannerEn), `the English banner is not translated: "${bannerEn}"`);
await pageEn.keyboard.press("t");
await pageEn.waitForTimeout(200);
const badgeEn = (await pageEn.locator("#time-badge").textContent())?.trim();
check(badgeEn === "×4", `the English badge does not follow the cycle: "${badgeEn}"`);
const helpEn = await pageEn.locator(".hud-help").textContent();
check(/\bT\b/.test(helpEn), `the help line does not mention the T key: "${helpEn}"`);
await pageEn.close();

await browser.close();

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
console.log(JSON.stringify({ normal, fast, four, eight, back, failures }, null, 2));
if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("SMOKE OK: T cycles the world clock through x1, x2, x4 and x8, in both languages");
