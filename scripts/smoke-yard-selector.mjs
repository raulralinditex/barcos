import { chromium } from "playwright";
import { SHIPYARDS } from "../src/data/naval-data.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { fleetUpkeep } from "../src/model/fleet.js";
import { voyageQuote } from "../src/model/voyage.js";

/**
 * Browser smoke for S133: the title bar's shipyard selector, her editable name and the
 * automatic voyage she offers.
 *
 *   S133-A  the selector lists every yard of `SHIPYARDS`, and changing it shows THAT yard's
 *           market;
 *   S133-B  a name edited in the selector is stored per yard id and survives a reload;
 *   S133-C  a yard the captain is not moored at is a read-only visit: her market is on show
 *           and the buy button is disabled;
 *   S133-D  the voyage button quotes first, then moves the captain — and only her — while
 *           the moored hull stays home and the purse drops by the quoted gold.
 *
 * Prices and the quote come from the model, never from a magic number.
 */

const build = (name, id) => ({
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
    { name },
  ),
  id,
  yardId: "puerto-casa",
});

const captain = build("Capitana", "captain");
const spare = build("Queda", "spare");
const fleet = { v: 1, captainId: captain.id, ships: [captain, spare] };
const GOLD = 50000;
const HOME = "puerto-casa";
const ABYSS = "cala-del-abismo";

const expected = voyageQuote(HOME, ABYSS, {
  speedKn: captain.speedKn,
  supplyDays: captain.days,
  gold: GOLD,
  upkeep: fleetUpkeep(fleet),
});

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.addInitScript(
  ([fleetJson, gold]) => {
    // Seed only on the first load: a reload must keep the name and the arrival.
    if (localStorage.getItem("barcos:fleet:v1")) return;
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold, ship: { x: 0, y: 0, heading: 0 } }));
  },
  [JSON.stringify(fleet), GOLD],
);

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const purse = async () =>
  Number.parseFloat(
    String(await page.locator("#gold-value").textContent()).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""),
  );
const options = () =>
  page.locator("#yard-select option").evaluateAll((list) => list.map((option) => ({ value: option.value, label: option.textContent })));
const savedFleet = () => page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")));
const savedNames = () => page.evaluate(() => JSON.parse(localStorage.getItem("barcos:yard-names:v1") ?? "null"));

/* --------------------------------------------------- S133-A: every yard in the selector */

await page.click('.screen-tab[data-screen="mercado"]');
await page.waitForTimeout(300);
const listed = await options();
check(
  JSON.stringify(listed.map((entry) => entry.value)) === JSON.stringify(SHIPYARDS.map((yard) => yard.id)),
  `S133-A: the selector must list every yard, it lists ${JSON.stringify(listed)}`,
);
check(
  (await page.locator("#yard-select").inputValue()) === HOME,
  "S133-A: the yard the screen is showing must be the selected one",
);

/* ------------------------------------------- S133-A/C: a far yard is a read-only visit */

await page.selectOption("#yard-select", ABYSS);
await page.waitForTimeout(300);
check(
  /Cala del abismo/i.test(await page.locator("#market-yard").textContent()),
  "S133-A: switching the selector must show that yard's market",
);
const buyButtons = page.locator(".market-row .market-buy");
check((await buyButtons.count()) > 0, "S133-A: the visited yard must paint her board");
check(
  await buyButtons.first().isDisabled(),
  "S133-C: a visit must not buy, so the buy button is disabled",
);
check(await page.locator("#yard-visit-note").isVisible(), "S133-C: a visit must say why the actions are closed");
check(await page.locator("#yard-travel-btn").isVisible(), "S133-C: a visit must offer the voyage");
check(await page.locator("#set-sail-btn").isDisabled(), "S133-C: a visit must not sail from that yard");

/* ------------------------------------------- S133-B: the name is edited in the selector */

await page.click("#yard-rename-btn");
await page.waitForTimeout(150);
check(await page.locator("#yard-name-input").isVisible(), "S133-B: the pencil must open the inline rename");
await page.fill("#yard-name-input", "  Cala del Sur  ");
await page.press("#yard-name-input", "Enter");
await page.waitForTimeout(250);
check(
  (await savedNames())?.[ABYSS] === "Cala del Sur",
  `S133-B: the name must be stored trimmed per yard id, it is ${JSON.stringify(await savedNames())}`,
);
const renamed = await options();
check(
  renamed.find((entry) => entry.value === ABYSS)?.label === "Cala del Sur",
  `S133-B: the selector must read the new name, it reads ${JSON.stringify(renamed)}`,
);
const untouched = await savedNames();
check(!untouched?.[HOME], "S133-B: renaming one yard must not name another");

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
check(
  (await options()).find((entry) => entry.value === ABYSS)?.label === "Cala del Sur",
  "S133-B: the name must survive a reload",
);
// An empty name brings the shipped one back.
await page.selectOption("#yard-select", ABYSS);
await page.waitForTimeout(250);
await page.click("#yard-rename-btn");
await page.fill("#yard-name-input", "   ");
await page.press("#yard-name-input", "Enter");
await page.waitForTimeout(250);
check(
  !(await savedNames())?.[ABYSS],
  "S133-B: a whitespace name must fall back to the shipped one",
);
check(
  (await options()).find((entry) => entry.value === ABYSS)?.label === "Cala del abismo",
  "S133-B: the shipped name must come back",
);

/* --------------------------------------- S133-D/E: the voyage quotes, then moves the captain */

const before = await purse();
await page.selectOption("#yard-select", ABYSS);
await page.waitForTimeout(250);
const travel = page.locator("#yard-travel-btn");
check(await travel.isEnabled(), "S133-E: a voyage the captain can pay for must be offered");
await travel.click();
await page.waitForTimeout(250);
check((await purse()) === before, "S133-E: the first press reports the quote and charges nothing");
const quoted = await page.locator("#purchase-notice").textContent();
check(
  quoted.includes(String(expected.days)) && quoted.includes(String(expected.gold)),
  `S133-E: the quote must name ${expected.days} days and ${expected.gold} gold, it reads "${quoted}"`,
);
check(
  (await travel.textContent())?.includes("Confirmar"),
  "S133-E: after quoting, the button must ask to confirm",
);

await travel.click();
await page.waitForTimeout(500);
const after = await purse();
check(
  after === before - expected.gold,
  `S133-E: arriving must charge the quoted ${expected.gold} gold, purse went ${before} -> ${after}`,
);
const arrived = await savedFleet();
check(
  arrived.ships.find((ship) => ship.id === "captain")?.yardId === ABYSS,
  "S133-D: the captain must be moored at the destination",
);
check(
  arrived.ships.find((ship) => ship.id === "spare")?.yardId === HOME,
  "S133-D: every other hull must stay where she was",
);
check(
  (await page.locator("#yard-select").inputValue()) === ABYSS,
  "S133-E: after arriving the destination is the current yard",
);
check(
  !(await buyButtons.first().isDisabled()),
  "S133-E: at her own yard the market must be open again",
);
check(
  (await page.locator("#yard-visit-note").isHidden()),
  "S133-E: at her own yard there is no visit note",
);

// The arrival is written to the sea save too, so a reload keeps her there.
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);
check(
  (await page.locator("#yard-select").inputValue()) === ABYSS,
  "S133-E: the destination must survive a reload",
);

check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
await browser.close();

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: S133 selector (${SHIPYARDS.length} yards), rename, read-only visit and voyage (${expected.days} days, ${expected.gold} gold)`,
);
