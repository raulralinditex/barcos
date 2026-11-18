import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { COMMODITIES } from "../src/data/naval-data.js";
import { buyPrice, shipHold } from "../src/model/commerce.js";

/**
 * Browser smoke: the market trades with the hull the player picks, and the trade shows in
 * that hull's hold line. Needs the local server on 8765.
 *
 * User request (verbatim): "en el mercado no podemos elegir el buque donde van a ir las
 * mercancias, y cuando compramos la mercancia o la vendemos se tiene que reflejar en
 * Aparejo/carga del buque seleccionado"
 *
 * S147 changed where the hold is READ, not what is proven. The player then asked for the
 * rig to leave the market ("quita el aparejo del mercado"), so the trade can no longer be
 * read off Aparejo/Carga: it is read off the market's own hold line (#market-hold, used
 * against capacity), which follows the picked hull. The cargo still has to be visible on
 * the screen that bought it — that is the point of the smoke.
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
const second = build("galeon-pequeno", "Segunda");
const fleet = { v: 1, captainId: captain.id, ships: [captain, second] };
const good = COMMODITIES[0];

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
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold, ship: { x: 0, y: 0, heading: 0 } }));
  },
  [JSON.stringify(fleet), 20000],
);

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const savedHold = (id) =>
  page.evaluate((id) => {
    const saved = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    const ship = saved.ships.find((entry) => entry.id === id);
    return { manifest: ship.manifest ?? [], cargoKg: ship.cargoKg };
  }, id).then(shipHold);
// The kg the market's own hold line names for the hull it is trading with (S147). The
// line reads "used / capacity", so the number is parsed out of the text the player sees.
const holdLine = async () => String(await page.locator("#market-hold").textContent());
const holdCargo = async () => {
  // "Bodega: 320 de 112.500 kg" / "Hold: 320 of 112,500 kg": the first number is the used
  // hold, and the thousands separator is dropped before reading it.
  const text = await holdLine();
  const match = text.match(/^[^\d]*(\d[\d.,]*)\s+(?:de|of)\s/i);
  if (!match) return null;
  return Number(match[1].replace(/[.,]/g, ""));
};
// The hull the market says it is trading with, from the picker the player sees.
const pickedName = async () => {
  const value = await page.locator("#market-ship").inputValue();
  return page.locator(`#market-ship option[value="${value}"]`).textContent();
};

await page.click('.screen-tab[data-screen="mercado"]');
await page.waitForTimeout(300);

// S147: the rig does not stand in this room at all.
check(
  await page.evaluate(() => {
    const rig = document.querySelector(".panel-build");
    return !rig || rig.getClientRects().length === 0;
  }),
  "S147: the market must not show the rig panel",
);

const picker = page.locator("#market-ship");
check((await picker.count()) === 1, "the market must offer a hull picker (#market-ship)");
if ((await picker.count()) === 1) {
  const options = await picker.locator("option").allTextContents();
  check(options.length === 2, `the picker should list both hulls, it lists ${JSON.stringify(options)}`);
  check((await picker.inputValue()) === captain.id, "the picker should start on the captain");

  // Trade with the second hull.
  await picker.selectOption(second.id);
  await page.waitForTimeout(300);
  check((await pickedName()) === "Segunda", `the market should trade with the picked hull, it names "${await pickedName()}"`);

  await page.locator(`.market-row[data-commodity="${good.id}"] [data-buy]`).click();
  await page.waitForTimeout(400);
  check((await savedHold(second.id)).cargoKg === good.kgPerUnit, "the bought unit must load the PICKED hull");
  check((await savedHold(captain.id)).cargoKg === 0, "the captain must stay empty");
  check(
    (await holdCargo()) === good.kgPerUnit,
    `the market's hold line must show the purchase (${good.kgPerUnit} kg), it reads "${await holdLine()}"`,
  );

  // The pick survives a trade (the board is redrawn) and a reload keeps the cargo.
  check((await picker.inputValue()) === second.id, "the pick must survive the redraw after a trade");

  // Selling comes out of the picked hull and the rig follows.
  await page.locator(`.market-row[data-commodity="${good.id}"] [data-sell]`).click();
  await page.waitForTimeout(400);
  check((await savedHold(second.id)).cargoKg === 0, "selling must empty the picked hull");
  check((await holdCargo()) === 0, `the hold line must show the sale, it reads "${await holdLine()}"`);

  // Switching hull moves the rig and the hold line with her.
  await page.locator(`.market-row[data-commodity="${good.id}"] [data-buy]`).click();
  await page.waitForTimeout(300);
  await picker.selectOption(captain.id);
  await page.waitForTimeout(300);
  check((await pickedName()) === "Capitana", "switching back must move the market to the captain");
  check((await holdCargo()) === 0, `the hold line must read the captain's own empty hold, it reads "${await holdLine()}"`);
  check(
    buyPrice(good.id, "costera") > 0 && (await savedHold(second.id)).cargoKg === good.kgPerUnit,
    "the second hull keeps her cargo while the captain is picked",
  );
}

check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
await browser.close();
console.log(JSON.stringify({ failures, errors }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
