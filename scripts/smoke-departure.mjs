import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S182: the set-sail button takes the captain who sails, not the yard.
 *
 * The player reported it (verbatim): "cuando estoy de visita en un astillero, puedo dar a
 * zarpar a la flota que ese en ese astillero". Measured in the model: `departYard` moved every
 * hull moored at the yard, whatever command she answered to, so a yard holding two captains
 * sent both squadrons to sea with one button.
 *
 * The claims, through the screen and the saves:
 *   1. with two captains in one yard, set-sail puts only the sailing captain's command to sea;
 *   2. the other captain and her hulls are still moored when the save is read back;
 *   3. the sea the player lands on holds only the squadron that sailed.
 */

const design = buildShip(
  { hullId: "galeon-pequeno", batteries: [], crew: { marino: 25, artillero: 4, soldado: 6 }, days: 45 },
  12000,
);
if (!design?.feasible) throw new Error("smoke setup failed: the ship is not feasible");
const hull = (name, id, commandId, over = {}) => ({
  ...toRuntimeShip(design, { name }), id, commandId, yardId: "puerto-casa", ...over,
});

const alfa = hull("Alfa", "smoke-alfa", "smoke-alfa");
const gamma = hull("Gamma", "smoke-gamma", "smoke-alfa", { sails: true });
const beta = hull("Beta", "smoke-beta", "smoke-beta");
const delta = hull("Delta", "smoke-delta", "smoke-beta", { sails: true });

const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(([ships]) => {
    if (sessionStorage.getItem("departure-seeded")) return;
    sessionStorage.setItem("departure-seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, captainId: "smoke-alfa", ships }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000, ship: { x: 0, y: 0, heading: 0 } }));
  }, [[alfa, gamma, beta, delta]]);

  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.click('.screen-tab[data-screen="flota"]');
  await page.waitForTimeout(400);

  /* ------------------- 1 and 2. the departure is one command's business */

  const button = page.locator("#set-sail-btn");
  check(!(await button.isDisabled()), "S182: the set-sail button must be usable from the home yard");
  if (!(await button.isDisabled())) {
    await button.click();
    // Leaving the shipyard navigates to the sea, so the save is read from wherever it lands.
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.map((s) => `${s.id}:${s.yardId}`));
    const byId = Object.fromEntries(after.map((entry) => entry.split(":")));
    check(byId["smoke-alfa"] === "null", `S182: the sailing captain must leave, she is at ${byId["smoke-alfa"]}`);
    check(byId["smoke-gamma"] === "null", `S182: her marked hull must sail, she is at ${byId["smoke-gamma"]}`);
    check(
      byId["smoke-beta"] === "puerto-casa",
      `S182: another captain must stay in the yard, she is at ${byId["smoke-beta"]}`,
    );
    check(
      byId["smoke-delta"] === "puerto-casa",
      `S182: another captain's hull must stay, she is at ${byId["smoke-delta"]}`,
    );
  }

  /* ------------------- 3. the sea holds only the squadron that sailed */

  // The sea autosaves every three seconds; reading the record before it writes says "no sea"
  // while the screen is already sailing.
  await page.waitForTimeout(4000);
  const sailed = await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
    const world = game?.world ? JSON.parse(game.world) : null;
    return {
      ship: world?.ship?.id ?? null,
      escorts: (world?.escorts ?? []).map((escort) => escort.id),
    };
  });
  check(sailed.ship === "smoke-alfa", `S182: the sea must steer the captain who sailed, it steers ${sailed.ship}`);
  check(
    !sailed.escorts.includes("smoke-delta"),
    `S182: another captain's hull must not be at sea, escorts read ${JSON.stringify(sailed.escorts)}`,
  );

  if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: setting sail takes one command to sea and leaves the rest moored");
