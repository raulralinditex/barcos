import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

const makeShip = (name, id) => ({
  ...toRuntimeShip(buildShip({
    hullId: "galeon-pequeno",
    batteries: [
      { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    ],
    crew: { marino: 34, artillero: 10, soldado: 26 },
    days: 45, cargoKg: 0, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
  }, 12000), { name }), id, yardId: "puerto-casa",
});
const captain = makeShip("Capitana", "captain");
const spare = makeShip("Queda", "spare");
const fleet = { v: 1, captainId: captain.id, ships: [captain, spare] };
const failures = [];
const errors = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.addInitScript(([initialFleet]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", initialFleet);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000, ship: { x: 0, y: 0, heading: 0 } }));
  }, [JSON.stringify(fleet)]);
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.click('.screen-tab[data-screen="mercado"]');
  const picker = page.locator("#market-ship");
  const values = () => picker.locator("option").evaluateAll((options) => options.map((o) => o.value));
  check(JSON.stringify(await values()) === JSON.stringify(["captain", "spare"]), "S130 G: home market lists both local hulls");
  await page.click('.screen-tab[data-screen="flota"]');
  await page.locator('[data-sail="spare"]').uncheck();
  await Promise.all([page.waitForURL("**/sea.html"), page.click("#set-sail-btn")]);
  const departure = await page.evaluate(async () => {
    const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    const model = await import("/src/model/fleet.js");
    return { fleet, home: model.shipsAtYard ? model.shipsAtYard(fleet, "puerto-casa").map((s) => s.id) : null };
  });
  check(departure.fleet.ships.find((s) => s.id === "captain")?.yardId === null, "S130 D: departing captain has no yard");
  check(JSON.stringify(departure.home) === JSON.stringify(["spare"]), "S130 A/D: at home the moored spare remains and the sailing captain is absent");
  // Leave the sea first: its beforeunload handler otherwise overwrites the seeded position.
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  // The visiting captain is at the abyss yard; no home-moored hull may follow her there.
  await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    delete game.world;
    game.ship = { x: 4600, y: 0, heading: 0 };
    localStorage.setItem("barcos:game:v1", JSON.stringify(game));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.click('.screen-tab[data-screen="flota"]');
  const listed = await page.locator("#fleet-list .fleet-item").evaluateAll((items) => items.map((item) => item.dataset.shipId));
  check(JSON.stringify(listed) === JSON.stringify(["captain"]), `S130 F: abyss fleet excludes home hull, got ${JSON.stringify(listed)}`);
  check((await page.locator("#fleet-count").textContent()) === "1 nave", "S130 F: count is local");
  await page.click('.screen-tab[data-screen="mercado"]');
  check(JSON.stringify(await values()) === JSON.stringify(["captain"]), `S130 G: abyss picker excludes home hull, got ${JSON.stringify(await values())}`);
  // Buying in the abyss must not reset the location to the home yard.
  await page.click('.screen-tab[data-screen="comprar"]');
  await page.fill("#ship-name", "Nueva");
  await page.click("#launch-btn");
  const purchase = await page.evaluate(() => ({ fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")), game: JSON.parse(localStorage.getItem("barcos:game:v1")) }));
  const bought = purchase.fleet.ships.find((s) => s.name === "Nueva");
  // S130 C keeps its claim: the hull is launched where the player is, not at home.
  check(bought?.yardId === "cala-del-abismo", "S130 C: the new hull is launched at the current yard");
  // S179 changed who commands her. The player's rule (verbatim): "Cualquier capitana
  // cuenta" — the visiting captain already commands this yard, so the new hull joins her
  // instead of taking the helm. Updated with her explicit approval.
  const visitor = purchase.fleet.ships.find((entry) => entry.id === "captain");
  check(
    bought?.commandId === visitor?.id && purchase.fleet.captainId === visitor?.id,
    `S179: the purchase joins the captain already in this yard, got commandId=${bought?.commandId}`,
  );
  await page.click('.screen-tab[data-screen="mercado"]');
  check(!(await values()).includes("spare"), "S130 C/G: purchase does not reset the screen to the home yard");

  // A traveling escort can be left at a new yard and checked again before departure.
  const visit = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  visit.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  visit.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await visit.addInitScript(([captain, escort]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, captainId: captain.id, ships: [captain, escort] }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000, ship: { x: 4600, y: 0, heading: 0 } }));
  }, [{ ...captain, yardId: null }, { ...spare, yardId: null, sails: true }]);
  await visit.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await visit.click('.screen-tab[data-screen="flota"]');
  await visit.locator('[data-sail="spare"]').uncheck();
  check(await visit.locator('[data-sail="spare"]').count() === 1, "S130 F: an unchecked visiting escort remains selectable at this yard");
  if (await visit.locator('[data-sail="spare"]').count()) {
    await visit.locator('[data-sail="spare"]').check();
    await Promise.all([visit.waitForURL("**/sea.html"), visit.click("#set-sail-btn")]);
    await visit.waitForFunction(() => {
      const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
      return game?.world && JSON.parse(game.world).escorts?.some((escort) => escort.id === "spare");
    }, null, { timeout: 8000 });
    await visit.reload({ waitUntil: "networkidle" });
    await visit.waitForFunction(() => {
      const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
      return game?.world && JSON.parse(game.world).escorts?.some((escort) => escort.id === "spare");
    }, null, { timeout: 8000 });
    const formation = await visit.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world).escorts.map((escort) => escort.id));
    check(JSON.stringify(formation) === JSON.stringify(["spare"]), `S130 E: formation survives reload, got ${JSON.stringify(formation)}`);
  }

  // S169: a hull left in a yard as a wreck by an old save is discarded on load, and she is
  // never listed in the fleet. That is the rule that replaced the yard refloat this smoke
  // used to drive.
  const ghost = { ...spare, yardId: "puerto-casa", wreck: true, sails: false };
  const ghostPage = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  ghostPage.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  ghostPage.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await ghostPage.addInitScript(([captain, ghost]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, captainId: captain.id, ships: [captain, ghost] }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000, ship: { x: 0, y: 0, heading: 0 } }));
  }, [{ ...captain, yardId: null }, ghost]);
  await ghostPage.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await ghostPage.click('.screen-tab[data-screen="flota"]');
  check(
    (await ghostPage.locator('.fleet-item[data-ship-id="spare"]').count()) === 0,
    "S169: a wreck left by an old save must not be listed in the yard",
  );

  // A stale captain location follows the sea position at boot and on room entry.
  const stale = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  stale.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  stale.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await stale.addInitScript(([captain, spare]) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, captainId: captain.id, ships: [captain, { ...spare, sails: false }] }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000, ship: { x: 4600, y: 0 } }));
  }, [captain, spare]);
  await stale.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await stale.click('.screen-tab[data-screen="mercado"]');
  const staleOptions = () => stale.locator("#market-ship option").evaluateAll((options) => options.map((o) => o.value));
  const staleYards = () => stale.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.map((ship) => ship.yardId));
  check(JSON.stringify(await staleOptions()) === JSON.stringify(["captain"]), "S130: the stale captain can trade at her actual yard, but the home hull cannot");
  check(JSON.stringify(await staleYards()) === JSON.stringify(["cala-del-abismo", "puerto-casa"]), "S130: boot reconciles only the captain");
  await stale.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    game.ship = { x: 0, y: 0 };
    localStorage.setItem("barcos:game:v1", JSON.stringify(game));
  });
  await stale.click('.screen-tab[data-screen="flota"]');
  check(JSON.stringify(await staleYards()) === JSON.stringify(["puerto-casa", "puerto-casa"]), "S130: opening the fleet room reconciles the position again");
  check(await stale.locator("#fleet-list .fleet-item").count() === 2, "S130: both hulls appear when the captain comes home");
  await stale.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    game.ship = { x: 1000, y: 1000 };
    localStorage.setItem("barcos:game:v1", JSON.stringify(game));
  });
  await stale.click('.screen-tab[data-screen="mercado"]');
  check(JSON.stringify(await staleYards()) === JSON.stringify([null, "puerto-casa"]), "S130: open water clears only the captain's yard");
  await stale.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    game.ship = { x: 0, y: 0 };
    localStorage.setItem("barcos:game:v1", JSON.stringify(game));
  });
  await stale.click('.screen-tab[data-screen="flota"]');
  await stale.locator('.fleet-item[data-ship-id="spare"] [data-refit]').click();
  await stale.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    game.ship = { x: 4600, y: 0 };
    localStorage.setItem("barcos:game:v1", JSON.stringify(game));
  });
  await stale.click('.screen-tab[data-screen="flota"]');
  check(!(await stale.locator("#refit-mode").textContent()).includes("Queda"), "S130: a formerly selected remote hull is no longer in the refit editor");
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  if (browser) await browser.close();
}
console.log(JSON.stringify({ failures, errors }, null, 2));
process.exit(failures.length || errors.length ? 1 : 0);
