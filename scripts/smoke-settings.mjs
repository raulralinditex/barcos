import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { windAt } from "../src/model/wind.js";

/**
 * Browser smoke for the settings screen (S33), driven through the UI only.
 *
 * Two things have to be true, and neither is cosmetic:
 *   1. The screen clamps what a player types, so a wrong number makes the game
 *      harsher and never broken.
 *   2. The value the screen saves is the value the sea runs with: the same voyage,
 *      sailed twice with a different wind bonus, must cover different ground.
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

// A seed whose wind is at the top of its range, so the bonus has something to act on.
const SEED = 2;
// Sail dead downwind from the start, so the bonus is at its strongest and equal.
const HEADING = windAt(SEED, 0).direction;

const world = (heading) => ({
  v: 1,
  seed: SEED,
  rngState: SEED,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading, currentSpeedKn: 0, speedKn: runtime.speedKn },
  encounters: [],
});

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

/* ---------------------------------------------------------------- the screen */

const screen = await browser.newPage({ viewport: { width: 1400, height: 1100 }, locale: "es-AR" });
attach(screen);
await screen.goto("http://localhost:8765/config.html", { waitUntil: "networkidle" });
await screen.waitForTimeout(400);

const shown = {
  groups: await screen.locator(".settings-card h2").allTextContents(),
  rows: await screen.locator(".settings-row").count(),
  bonus: await screen.locator("#field-wind\\.maxSpeedBonus").inputValue(),
  segment: await screen.locator("#field-wind\\.segmentS").inputValue(),
};
check(shown.rows >= 20, `the screen shows only ${shown.rows} values`);
// Fort reinforcement (S100/S102) adds its own block to the settings screen, and the trade
// brings two more (S113, S117): the sinking switch and the market prices.
check(shown.groups.length === 17, `expected seventeen blocks, got ${shown.groups.join(", ")}`);
check(
  shown.groups.some((name) => /Naufragio/i.test(name)) && shown.groups.some((name) => /Comercio/i.test(name)),
  `the sinking and trade blocks must be on screen, got ${shown.groups.join(", ")}`,
);
// No group heading may reach the player as a raw key.
check(!shown.groups.some((name) => /^settings\./.test(name)), `a raw group key is on screen: ${shown.groups.join(", ")}`);

// S117: the wreck switch is a checkbox, off by default, and it stores a 1 or a 0.
const wreckSwitch = await screen.locator("#field-sinking\\.keepWreck").getAttribute("type");
check(wreckSwitch === "checkbox", `the wreck switch must be a checkbox, it is a ${wreckSwitch}`);
check(
  (await screen.locator("#field-sinking\\.keepWreck").isChecked()) === false,
  "the wreck switch ships off, which is the game as it always played",
);
// S113: every market price is on the screen, with its label resolved.
const marketRows = await screen.locator('.settings-row[data-field-id^="commerce."]').count();
check(marketRows === 8, `expected eight trade fields, got ${marketRows}`);
check(shown.bonus === "60", `the wind bonus must open at 60 %, got "${shown.bonus}"`);
check(shown.segment === "12", `the wind segment must open at 12 s, got "${shown.segment}"`);

// Out of range on both sides: the box must be pulled back to the limit.
await screen.fill("#field-wind\\.maxSpeedBonus", "500");
await screen.fill("#field-repair\\.shareOfPrice", "-300");
await screen.click("#settings-apply");
await screen.waitForTimeout(200);
const clamped = {
  bonus: await screen.locator("#field-wind\\.maxSpeedBonus").inputValue(),
  fee: await screen.locator("#field-repair\\.shareOfPrice").inputValue(),
  status: await screen.locator("#settings-status").textContent(),
};
check(clamped.bonus === "200", `an over-range bonus must clamp to 200, got "${clamped.bonus}"`);
check(clamped.fee === "0", `a negative repair share must clamp to 0, got "${clamped.fee}"`);
check(/guard/i.test(clamped.status ?? ""), `the screen does not confirm the save: "${clamped.status}"`);

// Reset must put the shipped values back, in the boxes and in storage.
await screen.click("#settings-reset");
await screen.waitForTimeout(200);
const reset = {
  bonus: await screen.locator("#field-wind\\.maxSpeedBonus").inputValue(),
  fee: await screen.locator("#field-repair\\.shareOfPrice").inputValue(),
  stored: JSON.parse(await screen.evaluate(() => localStorage.getItem("barcos:settings:v1"))),
};
check(reset.bonus === "60", `reset must restore 60 %, got "${reset.bonus}"`);
check(reset.fee === "20", `reset must restore the 20 % repair share, got "${reset.fee}"`);
check(reset.stored["wind.maxSpeedBonus"] === 0.6, "reset did not write the shipped bonus");

// English must translate the whole screen, blocks included.
await screen.selectOption("#lang-select", "en");
await screen.waitForTimeout(300);
const english = {
  title: await screen.locator("h1").textContent(),
  groups: await screen.locator(".settings-card h2").allTextContents(),
  bonusLabel: await screen.locator('label[for="field-wind\\.maxSpeedBonus"]').textContent(),
};
check(/Settings/i.test(english.title ?? "") || /Astillero|Shipyard/i.test(english.title ?? ""), `the title is not translated: "${english.title}"`);
check(
  english.groups.includes("Wind") && english.groups.includes("Combat"),
  `the blocks are not translated: ${english.groups.join(", ")}`,
);
check(
  /wind/i.test(english.bonusLabel ?? ""),
  `the field label is not translated: "${english.bonusLabel}"`,
);
await screen.close();

/* ---------------------------------------------------------------- the sea obeys it */

/** Sail the same seeded voyage for `ms` with one stored wind bonus, return the ground covered. */
async function sail(bonus) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 }, locale: "es-AR" });
  attach(page);
  await page.addInitScript(
    ([shipJson, worldJson, bonusValue]) => {
      localStorage.setItem("barcos:lang:v1", "es");
      const ship = JSON.parse(shipJson);
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
      // A wind that does not move during the run, so the two voyages differ only in
      // the bonus under test. This is the feature being used to make the test honest.
      localStorage.setItem(
        "barcos:settings:v1",
        JSON.stringify({ "wind.maxSpeedBonus": bonusValue, "wind.segmentS": 300 }),
      );
    },
    [JSON.stringify(runtime), JSON.stringify(world(HEADING)), bonus],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  // Full sail, straight, and long enough to reach the target speed: while the hull
  // is still accelerating the limit is the acceleration, not the wind.
  for (let i = 0; i < 12; i += 1) await page.keyboard.press("w");
  // Long enough for the hull to reach its target speed under each bonus: while it is
  // still accelerating the limit is the acceleration, not the wind.
  await page.waitForTimeout(14000);

  // The speed the hull has settled at, which is what the bonus actually sets.
  const settled = await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const saved = JSON.parse(game.world);
    return saved.ship.currentSpeedKn;
  });
  await page.close();
  return settled;
}

const weak = await sail(0.2);
const strong = await sail(2.0);
check(weak > 0, `the ship did not make way with a weak bonus (${weak.toFixed(2)} kn)`);
check(
  strong > weak * 1.4,
  `the stored bonus is not reaching the sea: 20 % settled at ${weak.toFixed(2)} kn, 200 % at ${strong.toFixed(2)} kn`,
);

await browser.close();

const result = { errors, shown, clamped, reset, english, weak, strong, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the screen clamps and translates, and the sea sails with the saved value");
