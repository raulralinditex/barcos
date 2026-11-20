import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S163: entering a shipyard from the sea.
 *
 * The player asked for it (verbatim): "cuando estamos en el mar, si cliqueamos en el icono de
 * un astillero, entrar en el, podremos hacer todo menos lo que necesitemos un barco como
 * mercado etc." and settled the scope: "si la capitana no esta en el radio de atraca,
 * simplemente vas de visita al astillero, las naves no se mueven, y solo puedes hacer cosas
 * en el astillero que no necesiten naves".
 *
 * The claims that matter, measured through the screen and the saves:
 *   1. a captain under way has no yard, so every yard she opens is a visit;
 *   2. in a visit she can still buy a hull, and it is moored at the yard she bought it at;
 *   3. the market refuses her, and says why;
 *   4. Escape takes her back to the sea without moving her or losing anything.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [{ pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" }],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 0,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  ),
  { name: "Santa Ana" },
);

/** A sea where the captain is under way, far from every yard on the chart. */
const seaWorld = () => ({
  v: 1,
  seed: 4,
  rngState: 4,
  nextId: 500,
  gold: 40000,
  timeS: 0,
  ship: { x: 1200, y: 300, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [],
  level: 1,
  levelEnemies: [],
  levelVictories: 0,
  order: { throttle: 0, turn: 0 },
  squadrons: [],
  encounters: [],
});

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 950 }, locale: "es-AR" });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([fleetJson, worldJson]) => {
      if (localStorage.getItem("barcos:fleet:v1")) return;
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 40000, world: worldJson }));
    },
    [
      JSON.stringify({ v: 1, captainId: ship.id, ships: [{ ...ship, commandId: ship.id, yardId: null }] }),
      JSON.stringify(seaWorld()),
    ],
  );
  return { page, context };
};

const fleetInSave = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1") ?? "null"));
const seaInSave = async (page) => {
  await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
  return page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
    return game?.world ? JSON.parse(game.world) : null;
  });
};

/* ------------------------- 1: from the sea, a yard opens as a visit */

const { page, context } = await open();
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
check(/sea\.html/.test(page.url()), "S163: the smoke must start at sea");

// The click itself is exercised by the model tests; here the yard is entered the way the
// click enters it, through the hash the sea writes.
await page.goto("http://localhost:8765/index.html#comprar:cala-del-abismo", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
check(
  /comprar:cala-del-abismo/.test(page.url()),
  `S163-A: the yard clicked must be the yard opened, the screen is ${page.url()}`,
);
const shown = await page.locator("#brand-yard").textContent();
check(/cala del abismo/i.test(shown ?? ""), `S163-A: the title must name the clicked yard, it reads "${shown}"`);
check(
  (await page.locator("#yard-select").inputValue()) === "cala-del-abismo",
  "S163-A: the selector must agree with the yard on screen",
);

/* ------------------------- 2: buying a hull works, and it is moored there */

const before = (await fleetInSave(page)).ships.length;
const cards = await page.locator(".hull-card").count();
check(cards > 0, "S163-D: a visit must still offer hulls to buy");
await page.locator(".hull-card").first().click();
await page.waitForTimeout(400);
const launch = page.locator("#launch-btn");
check(
  await launch.isEnabled(),
  "S163-D: buying a hull must not need the captain's presence, the button is disabled",
);
await launch.click();
await page.waitForTimeout(1200);

const after = await fleetInSave(page);
check(
  after.ships.length === before + 1,
  `S163-D: a hull bought in a visit must join the fleet, it went ${before} → ${after.ships.length}`,
);
const bought = after.ships[after.ships.length - 1];
check(
  bought.yardId === "cala-del-abismo",
  `S163-D: a hull bought at a yard must be moored there, her yardId is ${JSON.stringify(bought.yardId)}`,
);

/* ------------------------- 3: the market refuses her, and says why */

await page.locator('.screen-tab[data-screen="mercado"]').click();
await page.waitForTimeout(600);
const buys = page.locator("[data-buy]");
const buyCount = await buys.count();
check(buyCount > 0, "S163-D: the market board must still be on show in a visit");
if (buyCount > 0) {
  check(
    await buys.first().isDisabled(),
    "S163-D: the market must refuse a captain who is not tied up at that yard",
  );
  const title = await buys.first().getAttribute("title");
  check(
    Boolean(title && title.trim().length > 0),
    "S163-D: the refused market must say why, its title is empty",
  );
}

/* ------------------------- 4: Escape goes back to the sea, moving nothing */

const seaBefore = await seaInSave(page);
await page.keyboard.press("Escape");
await page.waitForTimeout(1300);
check(/sea\.html/.test(page.url()), `S163-F: Escape must take her back to the sea, the screen is ${page.url()}`);
const seaAfter = await seaInSave(page);
check(
  seaAfter?.ship?.x === seaBefore?.ship?.x && seaAfter?.ship?.y === seaBefore?.ship?.y,
  `S163-F: a visit must not move the captain, she was at (${seaBefore?.ship?.x},${seaBefore?.ship?.y}) and is at (${seaAfter?.ship?.x},${seaAfter?.ship?.y})`,
);
check(
  seaAfter?.ship?.currentSpeedKn === seaBefore?.ship?.currentSpeedKn,
  "S163-F: a visit must not change the captain's speed",
);

await context.close();
await browser.close();

if (errors.length > 0) {
  console.error("Console errors:");
  for (const error of errors) console.error(`  - ${error}`);
}
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("smoke-shipyard-from-sea: all checks passed");
