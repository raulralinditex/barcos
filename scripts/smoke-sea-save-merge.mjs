import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * S151: the sea's autosave must not erase what the yard bought.
 *
 * The bug the player reported: "las cantidades de las mercacias compradas en el mercado,
 * cambian aleatoriamente, sin vender ni comprar nada", and where: "pasa cuando vuelvo al
 * mar y luego retorno al astillero". The sea page keeps a copy of the fleet from the
 * moment it opens and its autosave (every 3 s) wrote that copy back whole, so a purchase
 * made while the sea was alive was replaced by the value the sea remembered.
 *
 * This smoke follows the player's path: buy in the yard, open the sea in a second tab of
 * the same browser context, wait past one autosave interval, and check the hold and the
 * port's stock are still there. It fails on the pre-S151 code and passes after it.
 *
 * Needs the local server on 8765 (`node scripts/serve.mjs`).
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

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
const yard = await context.newPage();
const errors = [];
yard.on("pageerror", (error) => errors.push(`yard pageerror: ${error.message}`));

await yard.addInitScript(
  ([fleetJson]) => {
    if (localStorage.getItem("__seeded")) return;
    localStorage.setItem("__seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 200000 }));
  },
  [JSON.stringify(fleet)],
);

const saved = (page) =>
  page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem("barcos:fleet:v1") ?? "null");
    const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
    const ship = record?.ships?.[0] ?? {};
    return {
      manifest: (ship.manifest ?? []).map((entry) => `${entry.commodityId}:${entry.units}`).join(","),
      cargoKg: ship.cargoKg,
      gold: game?.gold,
      marketStock: JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null")?.markets,
    };
  });

// 1. Buy in the yard.
await yard.goto("http://127.0.0.1:8765/index.html", { waitUntil: "networkidle" });
await yard.waitForTimeout(300);
await yard.click('.screen-tab[data-screen="mercado"]');
await yard.waitForTimeout(400);
for (let bought = 0; bought < 5; bought += 1) {
  await yard.locator('.market-buy[data-buy="sal"]').click();
  await yard.waitForTimeout(150);
}
const afterBuy = await saved(yard);
check(afterBuy.manifest === "sal:5", `S151: the yard must load the hold (manifest: ${afterBuy.manifest})`);
check(afterBuy.cargoKg === 1600, `S151: the hold must weigh what was bought (cargoKg: ${afterBuy.cargoKg})`);

// 2. Open the sea while the yard stays alive, exactly like the player's path back and forth.
const sea = await context.newPage();
sea.on("pageerror", (error) => errors.push(`sea pageerror: ${error.message}`));
await sea.goto("http://127.0.0.1:8765/sea.html", { waitUntil: "networkidle" });
await sea.waitForTimeout(1000);

// 2b. The sea is alive and holds a photograph of the fleet. Buy three more barrels in the
// yard now: the sea never saw them, so its autosave must not erase them.
await yard.bringToFront();
for (let bought = 0; bought < 3; bought += 1) {
  await yard.locator('.market-buy[data-buy="sal"]').click();
  await yard.waitForTimeout(150);
}
const afterSecondBuy = await saved(yard);
check(afterSecondBuy.manifest === "sal:8", `S151: the yard must load the second purchase (manifest: ${afterSecondBuy.manifest})`);

// The sea autosaves every 3 s: wait for two of them, so the write definitely happened.
await sea.waitForTimeout(7000);

const afterSea = await saved(yard);
check(
  afterSea.manifest === "sal:8",
  `S151: the sea's autosave must not erase the hold the yard bought (manifest: ${afterSea.manifest})`,
);
check(
  afterSea.cargoKg === afterSecondBuy.cargoKg,
  `S151: the sea's autosave must not erase the cargo weight (cargoKg: ${afterSea.cargoKg})`,
);
check(
  afterSea.gold === afterSecondBuy.gold,
  `S151: the sea's autosave must not refund the purchase (gold: ${afterSecondBuy.gold} -> ${afterSea.gold})`,
);

// 3. The yard's own market must not roll back either.
await yard.bringToFront();
await yard.reload({ waitUntil: "networkidle" });
await yard.waitForTimeout(500);
await yard.click('.screen-tab[data-screen="mercado"]');
await yard.waitForTimeout(500);
const hold = await yard.evaluate(() => document.querySelector("#market-hold")?.textContent ?? "");
// es-AR does not group four digits ("2560"), other locales do ("2.560").
check(/\b2\.?560\b/.test(hold), `S151: the yard must still show the bought hold after a reload (${hold})`);
const stock = await yard.evaluate(() =>
  [...document.querySelectorAll(".market-row")].find((row) => row.dataset.commodity === "sal")
    ?.querySelector(".market-stock")?.textContent,
);
check(stock === "8", `S151: the port must still be missing the eight barrels it sold (stock: ${stock})`);

await sea.close();
await browser.close();

if (errors.length > 0) failures.push(`page errors: ${errors.join(" | ")}`);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("S151 ok: the sea saved what it owns and left the yard's hold alone");
