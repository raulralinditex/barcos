import { chromium } from "playwright";
import { SHIPYARDS } from "../src/data/naval-data.js";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * S134: the title bar names the yard on screen, and changing the yard repaints every room.
 *
 * User request (verbatim): "en la pantalla de el astillero, podemos leer el titulo:
 * Astillero / Un barco a partir de un presupuesto, ahi deberia estar el nombre del
 * astillero" and "cuando cambias de astillero, tienes que actualizar todos los datos de
 * flota, astillero, mercado etc".
 */

const build = (name, id, yardId) => ({
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
  yardId,
});

const HOME = "puerto-casa";
const ABYSS = "cala-del-abismo";
// One hull at each yard, so switching the selector must move the fleet list too.
const home = build("Del puerto", "home", HOME);
const abyss = build("De la cala", "abyss", ABYSS);
const captain = build("Capitana", "captain", HOME);
const fleet = { v: 1, captainId: captain.id, ships: [captain, home, abyss] };

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
  ([fleetJson]) => {
    if (localStorage.getItem("barcos:fleet:v1")) return;
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000, ship: { x: 0, y: 0, heading: 0 } }));
  },
  [JSON.stringify(fleet)],
);

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const title = () => page.locator("#brand-yard").textContent();
const water = () => page.locator("#brand-water").textContent();
const fleetIds = () => page.locator("#fleet-list .fleet-item").evaluateAll((rows) => rows.map((row) => row.dataset.shipId).sort());
const marketYard = () => page.locator("#market-yard").textContent();
const yardName = (id) => SHIPYARDS.find((yard) => yard.id === id).nameKey;

/* -------------------------------------------------- S134: the title names the yard */

check(
  (await title()) !== "Astillero",
  `S134: the title must name the yard, it still reads "${await title()}"`,
);
check(
  (await page.locator("#brand-yard").count()) === 1,
  "S134: the title must be the yard's own heading",
);
check(
  !/barco a partir de un presupuesto/i.test(await water()),
  `S134: the line under the title must say the water, it reads "${await water()}"`,
);

/* ------------------------------------- S134: switching the yard repaints every room */

// The fleet list only holds the hulls of the yard on screen, so it is the sharpest probe
// of "every room updated": home holds two hulls, the abyss one.
const homeFleet = await fleetIds();
check(homeFleet.includes("home"), `S134: the home yard must list her own hull, it lists ${homeFleet}`);
check(!homeFleet.includes("abyss"), `S134: the home yard must not list the abyss hull, it lists ${homeFleet}`);
const homeTitle = await title();

await page.selectOption("#yard-select", ABYSS);
await page.waitForTimeout(400);

const abyssFleet = await fleetIds();
check(abyssFleet.includes("abyss"), `S134: the abyss yard must list her own hull, it lists ${abyssFleet}`);
check(!abyssFleet.includes("home"), `S134: the abyss yard must not list the home hull, it lists ${abyssFleet}`);
check(
  (await title()) !== homeTitle,
  `S134: the title must change with the yard, it still reads "${await title()}"`,
);
check(
  /cala/i.test(await title()),
  `S134: the title must name the abyss yard, it reads "${await title()}"`,
);
check(
  /Cala del abismo/i.test(await marketYard()),
  `S134: the market must show the abyss yard, it reads "${await marketYard()}"`,
);

// The fort panel and the market board are the other two rooms: both must belong to her.
await page.click('.screen-tab[data-screen="astillero"]');
await page.waitForTimeout(300);
const fortState = await page.locator("#fort-state").textContent();
check(typeof fortState === "string" && fortState.trim().length > 0, "S134: the yard's room must paint her state");

await page.click('.screen-tab[data-screen="mercado"]');
await page.waitForTimeout(300);
check(
  (await page.locator("#market-board .market-row").count()) > 0,
  "S134: the market of the visited yard must paint her board",
);
const abyssBoard = await page.locator("#market-board").textContent();

// Going back to the home yard must undo all of it: no room may keep the abyss numbers.
await page.selectOption("#yard-select", HOME);
await page.waitForTimeout(400);
check(
  (await title()) === homeTitle,
  `S134: the title must come back, it reads "${await title()}"`,
);
check(
  JSON.stringify(await fleetIds()) === JSON.stringify(homeFleet),
  `S134: the fleet must come back, it lists ${await fleetIds()}`,
);
check(
  (await page.locator("#market-board").textContent()) !== abyssBoard,
  "S134: the market must not keep the other yard's board",
);


/* ------------------------------------------- S135: the board colours where a good stands */
// S148: the buy colour rides the word Comprar, not the good's name. The rule S135 proves is
// the same one — the cheapest of our markets reads green and the dearest red — so the smoke
// reads it off the buy price now, which is where the player sees it.

await page.selectOption("#yard-select", HOME);
await page.waitForTimeout(400);
await page.click('.screen-tab[data-screen="mercado"]');
await page.waitForTimeout(300);
const coloured = await page.locator("#market-board .market-price").evaluateAll((prices) =>
  prices
    .filter((price) => /Comprar|Buy/i.test(price.textContent))
    .map((price) => ({
      id: price.closest("[data-commodity]").dataset.commodity,
      cls: price.className,
      colour: getComputedStyle(price).color,
      title: price.getAttribute("title") ?? "",
    })),
);
check(coloured.length > 0, "S135: the board must paint her goods");
const green = coloured.filter((entry) => entry.cls.includes("is-cheaper"));
const red = coloured.filter((entry) => entry.cls.includes("is-dearer"));
check(green.length > 0, "S135: some good must be the cheapest of our markets and read green");
check(red.length > 0, "S135: some good must be the dearest of our markets and read red");
const greenColour = green[0]?.colour ?? "";
const redColour = red[0]?.colour ?? "";
check(greenColour !== redColour, `S135: green and red must be different colours, both are ${greenColour}`);
check(green[0]?.title?.length > 0, "S135: a coloured buy must say why");
// S148: the good's name is a name, not a signal: it must not carry the colour any more.
const namedColours = await page.locator("#market-board .market-name").evaluateAll((names) =>
  names.map((name) => name.className),
);
check(
  namedColours.every((cls) => !/is-cheaper|is-dearer/.test(cls)),
  `S148: the good's name must not be coloured, got ${JSON.stringify(namedColours)}`,
);


// S136: the sale side is its own answer, on the sell price.
const saleColours = await page.locator("#market-board .market-price").evaluateAll((prices) =>
  prices
    .filter((price) => /Comprar|Buy/i.test(price.textContent) === false)
    .map((price) => ({ cls: price.className, colour: getComputedStyle(price).color, title: price.getAttribute("title") })),
);
check(saleColours.length > 0, "S136: the board must paint the sell prices");
const bestSale = saleColours.filter((entry) => entry.cls.includes("is-best"));
const worstSale = saleColours.filter((entry) => entry.cls.includes("is-worst"));
check(bestSale.length > 0, "S136: some good must sell best somewhere and read green");
check(worstSale.length > 0, "S136: some good must sell worst somewhere and read red");
check(
  bestSale[0] && worstSale[0] && bestSale[0].colour !== worstSale[0].colour,
  "S136: best and worst sales must be different colours",
);
check(bestSale[0]?.title?.length > 0, "S136: a coloured sale price must say why");

check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
await browser.close();

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the title names the yard and every room follows the selector");
