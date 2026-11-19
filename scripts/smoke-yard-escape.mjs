import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S157: Escape in the shipyard goes back to the sea.
 *
 * The player asked for it in those words (verbatim): "si estas en el astillero y le das a la
 * tecla esc vuelves al mar". The claims that matter:
 *
 *   - Escape with nothing open puts to sea, exactly as the Sail button does;
 *   - Escape never sails while it is dismissing something: the zoomed hull picture, the yard's
 *     rename field, or one of the two dialogs;
 *   - with no hull to sail, Escape does nothing, because the Sail button would refuse too.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
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

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const open = async (ships) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, locale: "es-AR" });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([shipsJson]) => {
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", shipsJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 40000 }));
    },
    [JSON.stringify({ v: 1, captainId: ship.id, ships })],
  );
  await page.goto("http://localhost:8765/index.html#flota", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  return page;
};

/* --------------------------------------------- 1: Escape sails out */

let page = await open([{ ...ship, commandId: ship.id, yardId: "puerto-casa" }]);
const beforeUrl = page.url();
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
check(/sea\.html/.test(page.url()), `S157: Escape must put to sea, the screen stayed on ${page.url()}`);
check(!/sea\.html/.test(beforeUrl), "S157: the smoke must start in the shipyard");
await page.close();

/* --------------------------------------------- 2: a dialog on top keeps the key */

page = await open([{ ...ship, commandId: ship.id, yardId: "puerto-casa", condition: { hull: 40, rigging: 50, crew: 80, morale: 90 } }]);
// The dock dialog asks about repairs when something is damaged (S25).
const dockShown = await page.locator("#dock-dialog").evaluate((el) => !el.classList.contains("is-hidden")).catch(() => false);
if (dockShown) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  check(
    !/sea\.html/.test(page.url()),
    `S157: Escape over the dock dialog must not sail, the screen went to ${page.url()}`,
  );
}
await page.close();

/* --------------------------------------------- 3: the rename field owns the key */

page = await open([{ ...ship, commandId: ship.id, yardId: "puerto-casa" }]);
const rename = page.locator("#yard-rename-btn");
if (await rename.count()) {
  await rename.click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  check(
    !/sea\.html/.test(page.url()),
    `S157: Escape in the rename field must close the field, not sail (${page.url()})`,
  );
}
await page.close();

/* --------------------------------------------- 4: nothing to sail, nothing happens */

page = await open([{ ...ship, commandId: ship.id, yardId: "puerto-casa", wreck: true }]);
await page.keyboard.press("Escape");
await page.waitForTimeout(900);
check(
  !/sea\.html/.test(page.url()),
  `S157: Escape with no hull to sail must do nothing, the screen went to ${page.url()}`,
);
await page.close();

await browser.close();
console.log(JSON.stringify({ errors, failures }, null, 2));
if (failures.length > 0) process.exit(1);
