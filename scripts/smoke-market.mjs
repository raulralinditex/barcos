import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { COMMODITIES } from "../src/data/naval-data.js";
import { buyPrice, marketBoard, sellPrice, shipHold } from "../src/model/commerce.js";

/**
 * Browser smoke for the market (S113, S114, S118). Needs the local server on 8765.
 *
 *   S118  the market is a tab of the yard, and it reads the yard the captain is moored at;
 *   S113  the same commodity is cheaper in the coast than in the abyss, and the board the
 *         screen paints is the one the model prices;
 *   S114  buying loads the hold and takes the gold, selling empties it and pays, and a
 *         trade that does not fit is refused without moving either the hold or the purse.
 *
 * Prices are checked against the model, never against a magic number: the screen and the
 * market must agree.
 */

const build = (hullId, name) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries: [
          { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 0,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      12000,
    ),
    { name },
  );

const captain = build("galeon-pequeno", "Capitana");
const fleet = { v: 1, captainId: captain.id, ships: [captain] };

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

// The captain is moored at the home port, so the market opens on the coastal board.
await page.addInitScript(
  ([fleetJson, gold]) => {
    // Seed only on the first load: an init script runs on every navigation, and seeding
    // again would wipe the hold the previous step just bought (S114).
    if (localStorage.getItem("barcos:fleet:v1")) return;
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold, ship: { x: 0, y: 0, heading: 0 } }));
  },
  [JSON.stringify(fleet), 20000],
);

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const purse = async () =>
  Number.parseFloat(
    String(await page.locator("#gold-value").textContent()).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""),
  );
// The hold is read from the save and measured by the model here, in node, so the smoke
// never trusts the page's own arithmetic (S114).
const savedHold = async () => {
  const saved = await page.evaluate(() => {
    const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    const ship = fleet.ships.find((entry) => entry.id === fleet.captainId);
    return { manifest: ship.manifest ?? [], cargoKg: ship.cargoKg };
  });
  return shipHold(saved);
};
const holdKg = async () => (await savedHold()).cargoKg;
const manifest = async () => (await savedHold()).manifest;

/* ------------------------------------------------------------- S118: the market tab */

await page.click('.screen-tab[data-screen="mercado"]');
await page.waitForTimeout(300);
check(
  await page.locator('.screen-panel[data-screen-panel="mercado"]').isVisible(),
  "S118: the market room must open",
);
const yardName = await page.locator("#market-yard").textContent();
check(/Puerto de casa/i.test(yardName), `S118: the yard should be the home port, it reads "${yardName}"`);

/* ------------------------------------------------- S113: the board is the model's board */

const board = marketBoard("costera");
const rows = await page.locator(".market-row").count();
check(rows === board.length, `S113: the board should list ${board.length} goods, it lists ${rows}`);

const first = COMMODITIES[0];
const rowText = await page.locator(`.market-row[data-commodity="${first.id}"]`).textContent();
check(
  rowText.includes(String(buyPrice(first.id, "costera"))),
  `S113: the buy price of ${first.id} should read ${buyPrice(first.id, "costera")}: "${rowText}"`,
);
check(
  rowText.includes(String(sellPrice(first.id, "costera"))),
  `S113: the sell price of ${first.id} should read ${sellPrice(first.id, "costera")}: "${rowText}"`,
);
check(
  buyPrice(first.id, "costera") < buyPrice(first.id, "abismo"),
  "S113: the coast must be cheaper than the abyss",
);

/* ---------------------------------------------- S114: buying loads the hold and pays */

const before = await purse();
await page.locator(`.market-row[data-commodity="${first.id}"] [data-buy]`).scrollIntoViewIfNeeded();
await page.locator(`.market-row[data-commodity="${first.id}"] [data-buy]`).click();
await page.waitForTimeout(400);
const afterBuy = await purse();
check(
  afterBuy === before - buyPrice(first.id, "costera"),
  `S114: buying should take ${buyPrice(first.id, "costera")}, purse went ${before} -> ${afterBuy}`,
);
check((await holdKg()) === first.kgPerUnit, `S114: the hold should hold one unit of ${first.id}`);
check(
  JSON.stringify(await manifest()) === JSON.stringify([{ commodityId: first.id, units: 1, kg: first.kgPerUnit }]),
  `S114: the manifest should record the unit, it is ${JSON.stringify(await manifest())}`,
);
// The purse and the hold both live in the save, so a reload keeps them (S114).
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
check((await holdKg()) === first.kgPerUnit, "S114: the hold must survive a reload");

/* -------------------------------------------- S114: selling empties it and pays back */

await page.click('.screen-tab[data-screen="mercado"]');
await page.waitForTimeout(300);
const beforeSell = await purse();
// Both actions must fit inside the market and receive real pointer hits, even when the
// three-column room narrows and when it stacks on a phone-sized viewport.
for (const width of [1500, 900, 320]) {
  await page.setViewportSize({ width, height: 1000 });
  for (const action of ["buy", "sell"]) {
    const button = page.locator(`.market-row[data-commodity="${first.id}"] [data-${action}]`);
    await button.scrollIntoViewIfNeeded();
    const hit = await button.evaluate((element) => {
      const buttonRect = element.getBoundingClientRect();
      const panelRect = element.closest(".panel-market").getBoundingClientRect();
      const top = document.elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2);
      return { inside: buttonRect.left >= panelRect.left && buttonRect.right <= panelRect.right, receivesClick: element.contains(top) };
    });
    check(hit.inside && hit.receivesClick, `S118: ${action} must fit and receive clicks at ${width}px: ${JSON.stringify(hit)}`);
  }
}
await page.setViewportSize({ width: 1500, height: 1000 });
const sellBtn = page.locator(`.market-row[data-commodity="${first.id}"] [data-sell]`);
await sellBtn.scrollIntoViewIfNeeded();
await sellBtn.click();
await page.waitForTimeout(400);
const afterSell = await purse();
check(
  afterSell === beforeSell + sellPrice(first.id, "costera"),
  `S114: selling should pay ${sellPrice(first.id, "costera")}, purse went ${beforeSell} -> ${afterSell}`,
);
check((await holdKg()) === 0, "S114: selling everything must empty the hold");
check((await manifest()).length === 0, "S114: the manifest must be empty after selling it all");

// A refused trade is refused up front: what is not aboard cannot be sold, so the button
// is disabled and the purse cannot move at all (S114).
check(
  await page.locator(`.market-row[data-commodity="${first.id}"] [data-sell]`).isDisabled(),
  "S114: selling what is not in the hold must be impossible, not merely unpaid",
);

check(errors.length === 0, `console errors: ${errors.join(" | ")}`);

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("market smoke: all checks passed");
