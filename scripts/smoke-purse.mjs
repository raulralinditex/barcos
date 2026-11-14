import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for the purse floor (S32), driven through the UI only.
 *
 * Gold only ever grows with treasure and only ever shrinks with a purchase the player
 * could afford, so a negative balance is always a corrupted save. Both screens must
 * open with zero instead of a debt, and the sea must not write a negative purse back
 * into the save when it closes.
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

const world = {
  v: 1,
  seed: 77,
  rngState: 77,
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

const attach = (page) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
};

/** A shipyard whose save carries a purse no honest session could reach. */
async function openShipyard(gold) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  attach(page);
  await page.addInitScript((seedGold) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.removeItem("barcos:fleet:v1");
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: seedGold }));
  }, gold);
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  return page;
}

/* ---------------------------------------------------------------- the shipyard */

const broke = await openShipyard(-2500);
const brokeState = {
  hud: (await broke.locator("#gold-value").textContent())?.trim(),
  launchDisabled: await broke.locator("#launch-btn").isDisabled(),
};
check(brokeState.hud === "0", `a negative purse must open at zero, got "${brokeState.hud}"`);
check(brokeState.launchDisabled, "with no gold nothing may be launched");

// The cheapest hull still costs gold, so the verdict must ask for gold, not credit.
await broke.locator(".hull-card").first().click();
await broke.waitForTimeout(300);
const verdict = (await broke.locator("#verdict-issues").textContent()) ?? "";
check(/doblones/i.test(verdict), `the verdict must speak of doubloons, got "${verdict}"`);
check(!/-/.test(verdict), `the verdict must not show a negative number, got "${verdict}"`);
check(
  await broke.locator("#launch-btn").isDisabled(),
  "an unaffordable ship must not launch, not even with a debt",
);
await broke.close();

const honest = await openShipyard(5000);
const honestState = {
  hud: (await honest.locator("#gold-value").textContent())?.trim(),
};
check(honestState.hud === "5000", `a normal purse must open unchanged, got "${honestState.hud}"`);
await honest.close();

/* ---------------------------------------------------------------- the sea */

const sea = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
attach(sea);
await sea.addInitScript(
  ([shipJson, worldJson]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    const ship = JSON.parse(shipJson);
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem(
      "barcos:game:v1",
      JSON.stringify({ gold: -1200, world: worldJson }),
    );
  },
  [JSON.stringify(runtime), JSON.stringify(world)],
);
await sea.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await sea.waitForTimeout(600);

const hudGold = (await sea.locator("#hud-gold").textContent())?.trim();
check(hudGold === "0", `the sea HUD must show zero, got "${hudGold}"`);

// The save the sea writes on close must not carry the debt forward either.
const savedGold = await sea.evaluate(() => {
  window.dispatchEvent(new Event("beforeunload"));
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return game.gold;
});
check(savedGold >= 0, `the sea wrote a negative purse back to the save: ${savedGold}`);
await sea.close();

await browser.close();

const result = { errors, brokeState, honestState, hudGold, savedGold, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: no screen opens with a debt and the sea never saves one");
