import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S178: the "hand her to" control only offers moves that work.
 *
 * The player reported it (verbatim): "en flota, el boton que tengo en cada name 'pasar a' no
 * funciona". It worked when both captains were in the same shipyard. When the target captain
 * was at sea, the select showed her, the player picked her, the model refused the move (a hull
 * does not cross the sea by herself, S155-B) and the handler reset the select to its
 * placeholder — no move, no message.
 *
 * The claims, through the screen:
 *   1. two captains in the same shipyard: the control is offered, and the move really happens;
 *   2. a target captain at sea: the control is NOT offered, instead of being offered and
 *      silently refused;
 *   3. the move survives a reload.
 */

const design = buildShip(
  { hullId: "galeon-pequeno", batteries: [], crew: { marino: 25, artillero: 4, soldado: 6 }, days: 45 },
  12000,
);
if (!design?.feasible) throw new Error("smoke setup failed: the ship is not feasible");
const base = (name, id, over = {}) => ({
  ...toRuntimeShip(design, { name }), id, commandId: id, ...over,
});

const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();

/** Open the fleet room with a given set of hulls and return the page. */
const openFleet = async (hulls, seedFlag) => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(([hulls, seedFlag]) => {
    if (sessionStorage.getItem(seedFlag)) return;
    sessionStorage.setItem(seedFlag, "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, captainId: hulls[0].id, ships: hulls }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000, ship: { x: 0, y: 0, heading: 0 } }));
  }, [hulls, seedFlag]);
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.click('.screen-tab[data-screen="flota"]');
  await page.waitForTimeout(400);
  return page;
};

try {
  /* ------------------------- 1 and 3. the move works, and it sticks */

  const home = [
    base("Alfa", "capA", { yardId: "puerto-casa" }),
    base("Bravo", "capB", { yardId: "puerto-casa" }),
    base("Gamma", "esc", { yardId: "puerto-casa", commandId: "capA", sails: false }),
  ];
  const page = await openFleet(home, "handover-home");
  const select = page.locator('.fleet-item[data-ship-id="esc"] [data-move]');
  check((await select.count()) === 1, "S178: two captains in the same yard must offer the control");
  if (await select.count()) {
    await select.selectOption("capB");
    await page.waitForTimeout(400);
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.map((s) => `${s.id}:${s.commandId}`));
    check(after.includes("esc:capB"), `S178: the hull was not handed over, fleet reads ${JSON.stringify(after)}`);
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const kept = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.map((s) => `${s.id}:${s.commandId}`));
  check(kept.includes("esc:capB"), `S178: the move did not survive a reload, fleet reads ${JSON.stringify(kept)}`);
  await page.close();

  /* ------------- 2. a captain at sea is not offered, instead of refused */

  const atSea = [
    base("Alfa", "capA", { yardId: "puerto-casa" }),
    base("Bravo", "capB", { yardId: null }),
    base("Gamma", "esc", { yardId: "puerto-casa", commandId: "capA", sails: false }),
  ];
  const seaPage = await openFleet(atSea, "handover-sea");
  const seaSelect = await seaPage.locator('.fleet-item[data-ship-id="esc"] [data-move]').count();
  check(
    seaSelect === 0,
    "S178: a captain at sea must not be offered — the model refuses that move and the control just resets",
  );
  // And the hull is still where she was: nothing was silently half-applied.
  const untouched = await seaPage.evaluate(() =>
    JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.map((s) => `${s.id}:${s.commandId}`));
  check(untouched.includes("esc:capA"), `S178: the fleet changed without a valid move: ${JSON.stringify(untouched)}`);
  await seaPage.close();

  if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the hand-over control offers only moves that work, and the move sticks");
