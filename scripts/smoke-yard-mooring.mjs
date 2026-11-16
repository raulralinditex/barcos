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
  check(bought?.yardId === "cala-del-abismo" && purchase.fleet.captainId === bought?.id, "S130 C: new captain is launched at the current yard");
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
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  if (browser) await browser.close();
}
console.log(JSON.stringify({ failures, errors }, null, 2));
process.exit(failures.length || errors.length ? 1 : 0);
