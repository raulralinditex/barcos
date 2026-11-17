import { chromium } from "playwright";
import { COMMODITIES } from "../src/data/naval-data.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { buyPriceNow, HOLD_BUY } from "../src/model/commerce.js";

/**
 * S138: holding the buy button keeps buying, ten at a time.
 *
 * User request (verbatim): "si en el mercado dejo el boton de comprar pulsado la compra va
 * de 10 en 10 en vez de 1 a 11 hata que haya dinero"
 */

const captain = {
  ...toRuntimeShip(
    buildShip(
      {
        hullId: "galeon-pequeno",
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
    { name: "Capitana" },
  ),
  id: "captain",
  yardId: "puerto-casa",
};
const fleet = { v: 1, captainId: captain.id, ships: [captain] };
const good = COMMODITIES[0].id;
const unit = buyPriceNow(good, "puerto-casa", {});
// Enough for several batches at a price that climbs as the yard's stock drains, so the
// smoke proves repeats (not one batch) and still ends with the purse short, not negative.
const GOLD = unit * 60;

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

await page.addInitScript(
  ([fleetJson, gold]) => {
    if (localStorage.getItem("barcos:fleet:v1")) return;
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold, ship: { x: 0, y: 0, heading: 0 } }));
  },
  [JSON.stringify(fleet), GOLD],
);

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.click('.screen-tab[data-screen="mercado"]');
await page.waitForTimeout(300);

const manifest = () =>
  page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    const ship = saved.ships.find((entry) => entry.id === "captain");
    const line = (ship.manifest ?? []).find((entry) => entry.commodityId === "sal");
    return line?.units ?? 0;
  });
const purse = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1")).gold);

// A single click buys exactly one unit, as it always did.
const buy = page.locator(`.market-row[data-commodity="${good}"] [data-buy]`);
await buy.click();
await page.waitForTimeout(300);
check((await manifest()) === 1, `S138: one click must buy one unit, it bought ${await manifest()}`);

// Holding it keeps buying ten at a time until the purse stops it.
const before = await purse();
const box = await buy.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(120 * 6);
await page.mouse.up();
await page.waitForTimeout(400);

const bought = (await manifest()) - 1;
check(bought > 0, `S138: holding the button must buy more, it bought ${bought}`);
check(
  bought >= HOLD_BUY.repeatUnits * 2,
  `S138: a held press must repeat, ${bought} units is a single batch`,
);
check(
  bought % HOLD_BUY.repeatUnits === 0,
  `S138: the repeats must come in batches of ${HOLD_BUY.repeatUnits}, ${bought} is not one`,
);
const spent = before - (await purse());
check(
  spent > 0 && spent <= bought * unit * 2,
  `S138: the purse must fall by what was bought (${bought} units), it fell ${spent}`,
);
check(
  (await purse()) >= 0,
  `S138: the purse must never go negative, it reads ${await purse()}`,
);

// Nothing is bought after the pointer goes up.
const afterRelease = await manifest();
await page.waitForTimeout(600);
check((await manifest()) === afterRelease, "S138: releasing the button must stop the buying");

check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
await browser.close();

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`SMOKE OK: one click buys 1, a held press bought ${bought} in batches of ${HOLD_BUY.repeatUnits}`);
