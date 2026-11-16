import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { COMMODITIES } from "../src/data/naval-data.js";
import { buyPrice, holdOf, marketBoard, sellPrice, shipHold, withHold } from "../src/model/commerce.js";

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

/* --------------------------------------------------------- S119: memory and reload */

const marketRow = page.locator(`.market-row[data-commodity="${first.id}"]`);
const boardPrice = async (side) => Number((await marketRow.locator(".market-price").nth(side === "buy" ? 0 : 1).textContent()).replace(/[^0-9]/g, ""));
const marketState = () => page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1")));
const moveTo = async (x) => {
  await page.evaluate((x) => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    game.ship = { x, y: 0, heading: 0 };
    if (game.world) {
      const world = JSON.parse(game.world);
      world.ship.x = x;
      world.ship.y = 0;
      game.world = JSON.stringify(world);
    }
    localStorage.setItem("barcos:game:v1", JSON.stringify(game));
  }, x);
  await page.reload({ waitUntil: "networkidle" });
  await page.click('.screen-tab[data-screen="mercado"]');
};

const voyages = [];
for (let trip = 0; trip < 2; trip++) {
  await moveTo(0);
  const buyStart = await boardPrice("buy");
  const homeBefore = (await marketState()).markets?.["puerto-casa"]?.stock?.[first.id] ?? 60;
  const beforeLoad = await purse();
  for (let i = 0; i < 20; i++) {
    const quoted = await boardPrice("buy");
    const beforeUnit = await purse();
    await marketRow.locator("[data-buy]").click();
    check((await purse()) === beforeUnit - quoted, `S119: buy ${i + 1} must charge displayed ${quoted}`);
  }
  const paid = beforeLoad - await purse();
  const homeAfter = (await marketState()).markets["puerto-casa"].stock[first.id];
  check(homeAfter === homeBefore - 20, `S119: home stock ${homeBefore} -> ${homeAfter}`);
  check((await holdKg()) === 20 * first.kgPerUnit, "S119: the entire load must be aboard");
  const homeBuyAfter = await boardPrice("buy");
  await page.reload({ waitUntil: "networkidle" });
  await page.click('.screen-tab[data-screen="mercado"]');
  check((await marketState()).markets["puerto-casa"].stock[first.id] === homeAfter, "S119: home stock survives reload");
  check((await boardPrice("buy")) === homeBuyAfter, "S119: home buy price survives reload");

  await moveTo(4600);
  const abyssBefore = (await marketState()).markets?.["cala-del-abismo"]?.stock?.[first.id] ?? 60;
  const sellStart = await boardPrice("sell");
  const beforeSale = await purse();
  await marketRow.locator("[data-sell]").click();
  const earned = (await purse()) - beforeSale;
  const abyssAfter = (await marketState()).markets["cala-del-abismo"].stock[first.id];
  const sellAfter = await boardPrice("sell");
  // S125: the yard pays the price of each unit from her own stock, so a 20-unit sale no
  // longer pays the single displayed quote twenty times. It pays a little less, and the
  // screen must say the same number the purse received.
  check(earned > 0 && earned < 20 * sellStart, `S125: a 20-unit sale pays less than ${sellStart} × 20, got ${earned}`);
  check(earned > 20 * sellAfter, `S125: and more than the price it leaves behind (${sellAfter} × 20), got ${earned}`);
  check(abyssAfter === abyssBefore + 20, `S119: abyss stock ${abyssBefore} -> ${abyssAfter}`);
  check(sellAfter < sellStart, `S119: abyss price must drop: ${sellStart} -> ${sellAfter}`);
  check((await holdKg()) === 0, "S119: selling the load empties the hold");
  await page.reload({ waitUntil: "networkidle" });
  await page.click('.screen-tab[data-screen="mercado"]');
  check((await marketState()).markets["cala-del-abismo"].stock[first.id] === abyssAfter, "S119: abyss stock survives reload");
  check((await boardPrice("sell")) === sellAfter, "S119: abyss sale price survives reload");
  voyages.push({ homeBefore, homeAfter, buyStart, homeBuyAfter, paid, abyssBefore, abyssAfter, sellStart, sellAfter, earned });
}
check(voyages[1].paid > voyages[0].paid, "S119: the second load must cost more");
check(voyages[1].earned < voyages[0].earned, "S119: the second load must pay less");
check(voyages[1].earned > voyages[1].paid, "S119: the second voyage must still profit");

// The sea advances both markets by its own clock and persists them on navigation.
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(3200);
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
const seaSave = await marketState();
const elapsed = JSON.parse(seaSave.world).timeS;
const recoveredHome = seaSave.markets["puerto-casa"].stock[first.id];
const recoveredAbyss = seaSave.markets["cala-del-abismo"].stock[first.id];
check(elapsed > 0, `S119: the sea clock must advance, got ${elapsed}`);
check(Math.abs(recoveredHome - (20 + elapsed * 0.2)) < 0.001, `S119: home recovers on sea seconds: ${recoveredHome} at ${elapsed}s`);
check(Math.abs(recoveredAbyss - (100 - elapsed * 0.2)) < 0.001, `S119: abyss recovers on sea seconds: ${recoveredAbyss} at ${elapsed}s`);

// An old sea save without a markets field opens every yard at rest, on screen.
const legacyContext = await browser.newContext({ locale: "es-AR" });
const legacy = await legacyContext.newPage();
await legacy.addInitScript((fleetJson) => {
  if (localStorage.getItem("barcos:fleet:v1")) return;
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", fleetJson);
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 20000, ship: { x: 0, y: 0 } }));
}, JSON.stringify(fleet));
for (const [x, zone] of [[0, "costera"], [2400, "abierto"], [4600, "abismo"]]) {
  await legacy.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await legacy.evaluate((x) => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    game.ship = { x, y: 0 };
    localStorage.setItem("barcos:game:v1", JSON.stringify(game));
  }, x);
  await legacy.reload({ waitUntil: "networkidle" });
  await legacy.click('.screen-tab[data-screen="mercado"]');
  for (const row of marketBoard(zone)) {
    const element = legacy.locator(`.market-row[data-commodity="${row.id}"]`);
    check((await element.locator(".market-yard-stock").textContent()).includes("60"), `S119: legacy ${zone}/${row.id} stock is at rest`);
    const buy = Number((await element.locator(".market-price").nth(0).textContent()).replace(/[^0-9]/g, ""));
    const sell = Number((await element.locator(".market-price").nth(1).textContent()).replace(/[^0-9]/g, ""));
    check(buy === row.buy && sell === row.sell, `S119: legacy ${zone}/${row.id} prices are at rest`);
  }
}
// An empty yard cannot sell even one unit; a disabled click changes no saved state.
await legacy.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  game.markets = { "cala-del-abismo": { stock: { sal: 0 } } };
  localStorage.setItem("barcos:game:v1", JSON.stringify(game));
});
await legacy.reload({ waitUntil: "networkidle" });
await legacy.click('.screen-tab[data-screen="mercado"]');
const emptyBuy = legacy.locator('.market-row[data-commodity="sal"] [data-buy]');
const beforeEmpty = await legacy.evaluate(() => [localStorage.getItem("barcos:game:v1"), localStorage.getItem("barcos:fleet:v1")]);
check(await emptyBuy.isDisabled(), "S119: an empty yard disables the buy button");
await emptyBuy.evaluate((button) => button.click());
const afterEmpty = await legacy.evaluate(() => [localStorage.getItem("barcos:game:v1"), localStorage.getItem("barcos:fleet:v1")]);
check(JSON.stringify(afterEmpty) === JSON.stringify(beforeEmpty), "S119: a disabled buy leaves purse, hold and stock unchanged");
await legacyContext.close();

// The separate 40-barrel example starts with an untouched abyss and a real hold.
const exampleContext = await browser.newContext({ locale: "es-AR" });
const example = await exampleContext.newPage();
const laden = withHold(captain, holdOf([{ commodityId: first.id, units: 40 }]));
await example.addInitScript((fleetJson) => {
  if (localStorage.getItem("barcos:fleet:v1")) return;
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", fleetJson);
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 20000, ship: { x: 4600, y: 0 } }));
}, JSON.stringify({ ...fleet, ships: [laden] }));
await example.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await example.click('.screen-tab[data-screen="mercado"]');
const exampleRow = example.locator('.market-row[data-commodity="sal"]');
const examplePrice = async () => Number((await exampleRow.locator(".market-price").nth(1).textContent()).replace(/[^0-9]/g, ""));
const exampleBefore = await examplePrice();
await exampleRow.locator("[data-sell]").click();
const exampleAfter = await examplePrice();
const exampleSave = await example.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1")));
check(exampleBefore === 58 && exampleAfter === 36, `S119: 40 salt move abyss price 58 -> 36, got ${exampleBefore} -> ${exampleAfter}`);
check(exampleSave.gold > 20000 && exampleSave.gold < 20000 + 40 * exampleBefore, `S125: the 40-barrel sale pays the curve, not 40 × the displayed quote: ${exampleSave.gold - 20000}`);
check(exampleSave.markets["cala-del-abismo"].stock.sal === 100, "S119: selling 40 moves abyss stock 60 -> 100");
await example.reload({ waitUntil: "networkidle" });
await example.click('.screen-tab[data-screen="mercado"]');
check(await examplePrice() === exampleAfter, "S119: the 40-barrel example price survives reload");
await exampleContext.close();
check(errors.length === 0, `console errors after memory checks: ${errors.join(" | ")}`);
console.log(`S119 voyages ${first.id}: ${JSON.stringify(voyages)}`);
console.log(`S119 sea recovery: ${elapsed}s, home ${recoveredHome}, abyss ${recoveredAbyss}`);

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("market smoke: all checks passed");
