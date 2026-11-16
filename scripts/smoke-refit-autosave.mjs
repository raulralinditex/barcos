import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { withHold } from "../src/model/commerce.js";

/**
 * Browser smoke: the automatic refit. Needs the local server on 8765.
 *
 * User request (verbatim): "el boton guardar reforma, lo vamos a hacer opcional, creamos
 * un check en la configuracion reforma automatica, si esta on todo cambio se guarda
 * automaticamente, si esta en off, mostramos el boton y se hace manual clickeando el
 * boton, por defecto es on"
 */

const base = toRuntimeShip(
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
);
const captain = withHold(base, { manifest: [{ commodityId: "sal", units: 5 }] });
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

const savedShip = () =>
  page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    return saved.ships[0];
  });
const setDays = async (value) => {
  await page.click('.tab[data-tab="supply"]');
  const input = page.locator('[data-supply="days"]');
  await input.fill(String(value));
  await input.dispatchEvent("change");
  await page.waitForTimeout(300);
};
const launch = page.locator("#launch-btn");

// Default is on: select the hull, change her, and she is saved with no click.
await page.click('.screen-tab[data-screen="flota"]');
await page.locator("[data-refit]").first().click();
await page.waitForTimeout(300);
check(!(await launch.isVisible()), "automatic refit (default): the save button must be hidden");
await setDays(60);
check((await savedShip()).days === 60, `automatic refit: the change must save itself, days = ${(await savedShip()).days}`);
check(
  (await savedShip()).manifest?.length === 1,
  "automatic refit: the merchandise must survive a refit",
);

// Turn it off in the settings: the button comes back and nothing saves by itself.
await page.click('.screen-tab[data-screen="configuracion"]');
await page.locator('[id="field-refit.autoSave"]').uncheck();
await page.click("#settings-apply");
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(300);
check(await launch.isVisible(), "automatic refit off: the save button must show");
await setDays(70);
check((await savedShip()).days === 60, "automatic refit off: nothing saves until the button is clicked");
await launch.click();
await page.waitForTimeout(300);
check((await savedShip()).days === 70, "automatic refit off: the button saves the change");

check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
await browser.close();
console.log(JSON.stringify({ failures, errors }, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
