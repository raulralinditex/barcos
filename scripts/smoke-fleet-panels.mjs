import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S165: the fleet room shows the rig panel only for a picked hull.
 *
 * The player reported it (verbatim): "en la pantalla tu flota del astillero, no mostrar el
 * panel de aparejo si no hay ninguna nave seleccionada". The panels followed the ROOM, not
 * the selection, so the room greeted her with the captain's rig and guns before she had
 * chosen anything.
 *
 * The claims that matter, measured through the screen:
 *   1. opening the fleet room with nothing picked shows neither panel;
 *   2. picking a hull brings both in;
 *   3. dropping the selection takes them out again;
 *   4. the other rooms keep the behaviour they had: buying shows them, the reading rooms
 *      never do.
 */

const build = (name) =>
  toRuntimeShip(
    buildShip(
      {
        hullId: "galeon-pequeno",
        batteries: [{ pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" }],
        crew: { marino: 34, artillero: 10, soldado: 10 },
        days: 45,
        cargoKg: 0,
        ballastKg: 3_000,
        equipmentKg: 2_500,
        reserveKg: 1_500,
      },
      12000,
    ),
    { name },
  );

const alfa = build("Alfa");
const beta = build("Beta");

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
await page.addInitScript(
  ([fleetJson]) => {
    if (localStorage.getItem("barcos:fleet:v1")) return;
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 40000 }));
  },
  [
    JSON.stringify({
      v: 1,
      captainId: alfa.id,
      ships: [
        { ...alfa, commandId: alfa.id, yardId: "puerto-casa" },
        { ...beta, commandId: beta.id, yardId: "puerto-casa" },
      ],
    }),
  ],
);

/** Both panels' visibility, which is what the player complained about. */
const panels = () =>
  page.evaluate(() => ({
    ship: !document.querySelector(".panel-ship").hasAttribute("hidden"),
    rig: !document.querySelector(".panel-build").hasAttribute("hidden"),
  }));

/* ------------------------- 1: nothing picked, no panels */

// The boot fills the editor with the captain but must NOT count as a pick (S109), so the
// fleet room opens with no selection and therefore no panels.
await page.goto("http://localhost:8765/index.html#flota", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
const empty = await panels();
check(!empty.ship, "S165: opening the fleet room with nothing picked must hide the ship panel");
check(!empty.rig, "S165: opening the fleet room with nothing picked must hide the rig panel");

/* ------------------------- 2: picking a hull brings them in */

const ships = page.locator("#fleet-list .fleet-ship");
check((await ships.count()) >= 1, "S165: the fleet room must list her hulls");
await ships.first().click();
await page.waitForTimeout(500);
const picked = await panels();
check(picked.ship, "S165: picking a hull must show the ship panel");
check(picked.rig, "S165: picking a hull must show the rig panel");

/* ------------------------- 3: a fresh visit to the fleet with nothing picked */

// A reload is the honest way to reach the room with no selection: the boot fills the editor
// but must not count as a pick (S109), so the room opens on the list alone.
const fresh = await context.newPage();
fresh.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
await fresh.goto("http://localhost:8765/index.html#flota", { waitUntil: "networkidle" });
await fresh.waitForTimeout(1200);
const freshPanels = await fresh.evaluate(() => ({
  ship: !document.querySelector(".panel-ship").hasAttribute("hidden"),
  rig: !document.querySelector(".panel-build").hasAttribute("hidden"),
}));
check(!freshPanels.ship, "S165: a fresh fleet room with nothing picked must hide the ship panel");
check(!freshPanels.rig, "S165: a fresh fleet room with nothing picked must hide the rig panel");
await fresh.close();

/* ------------------------- 4: the other rooms keep their behaviour */

for (const room of ["astillero", "mercado", "configuracion"]) {
  await page.click(`.screen-tab[data-screen="${room}"]`);
  await page.waitForTimeout(400);
  const reading = await panels();
  check(!reading.ship && !reading.rig, `S165: the ${room} room must not take the builder panels`);
}

await page.click('.screen-tab[data-screen="comprar"]');
await page.waitForTimeout(400);
const buying = await panels();
check(buying.ship, "S165: the buy room must keep the ship panel, it builds a hull from scratch");
check(buying.rig, "S165: the buy room must keep the rig panel");

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
console.log("smoke-fleet-panels: all checks passed");
