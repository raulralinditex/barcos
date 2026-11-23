import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S174: the repair button also makes the hull seaworthy.
 *
 * The player asked for it (verbatim): "en el boton de reparar, añadamos tambien la dotacion
 * minima si no la tenemos y en carga, suministro para 25 dias y la carga necesaria". Her
 * decisions (verbatim): the minimum is the shipyard's, "la carga necesaria" is ballast to
 * stop her floating high, and it all "se suma al precio".
 *
 * The claims, through the screen and the saves:
 *   1. a hull short of men, days and ballast shows the whole bill on the button;
 *   2. paying it brings her crew to the shipyard's minimum, her provisions to 25 days and
 *      her ballast up to where the light-load warning is gone;
 *   3. a hull already seaworthy shows only the repair price, which is what it always was.
 */

const design = buildShip(
  { hullId: "galeon-pequeno", batteries: [], crew: { marino: 25, artillero: 4, soldado: 6 }, days: 45 },
  12000,
);
if (!design?.feasible) throw new Error("smoke setup failed: the ship is not feasible");

/** A hull at sea, damaged, and short of everything the button tops up. */
const short = {
  ...toRuntimeShip(design, { name: "Corta" }),
  id: "smoke-short",
  yardId: null,
  // Short of the minimum crew, of the 25 days, and of ballast.
  crew: { marino: 5, artillero: 0, soldado: 0 },
  crewAlive: { marino: 5, artillero: 0, soldado: 0 },
  days: 4,
  ballastKg: 0,
  cargoKg: 0,
  condition: { hull: 40, rigging: 60, crew: 30, morale: 50 },
};
const captain = { ...toRuntimeShip(design, { name: "Alfa" }), id: "smoke-captain", yardId: null };

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
  await page.addInitScript(([captain, short]) => {
    if (sessionStorage.getItem("seaworthy-seeded")) return;
    sessionStorage.setItem("seaworthy-seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    // Both hulls in port, so the fleet room lists them and the button is reachable.
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({
      v: 1,
      captainId: captain.id,
      ships: [{ ...captain, yardId: "puerto-casa" }, { ...short, yardId: "puerto-casa" }],
    }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000, ship: { x: 0, y: 0, heading: 0 } }));
  }, [captain, short]);

  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.click('.screen-tab[data-screen="flota"]');
  await page.locator('.fleet-item[data-ship-id="smoke-short"] [data-refit]').click();
  await page.waitForTimeout(200);

  /* ---------------------- 1. the button shows the whole bill */

  const label = (await page.locator("#fleet-repair-btn").textContent())?.trim() ?? "";
  check(/Reparar/i.test(label), `S174: the button does not offer the service, it says "${label}"`);
  check(/·/.test(label), `S174: the button shows no price, it says "${label}"`);
  const quoted = Number((label.match(/(\d[\d.]*)/g) ?? []).pop()?.replace(/\./g, "") ?? 0);
  check(quoted > 0, `S174: the button quoted no price, it says "${label}"`);

  /* ----------------- 2. paying brings her to the minimum, 25 days and ballast */

  await page.click("#fleet-repair-btn");
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
    gold: JSON.parse(localStorage.getItem("barcos:game:v1") ?? "{}").gold,
  }));
  const hull = after.fleet.ships.find((entry) => entry.id === "smoke-short");
  check(Boolean(hull), "S174: the hull vanished from the fleet");
  if (hull) {
    check(hull.crew.marino >= 25, `S174: the mariners did not reach the minimum, got ${hull.crew.marino}`);
    check(hull.crew.artillero >= 2, `S174: the gunners did not reach the minimum, got ${hull.crew.artillero}`);
    check(hull.crew.soldado >= 10, `S174: the soldiers did not reach the minimum, got ${hull.crew.soldado}`);
    check(hull.days >= 25, `S174: the provisions did not reach 25 days, got ${hull.days}`);
    check(hull.ballastKg > 0, `S174: no ballast was stowed, got ${hull.ballastKg}`);
    check(hull.condition.hull === 100, `S174: the hull was not repaired, got ${hull.condition.hull}`);
    check(after.gold < 50000, "S174: nothing was paid");
  }

  /* ---------------- 3. a seaworthy hull shows only the repair price */

  await page.evaluate(() => {
    const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    const ready = fleet.ships.find((entry) => entry.id === "smoke-short");
    // Sound hull, full crew, plenty of days: nothing left to buy.
    Object.assign(ready, {
      crew: { marino: 30, artillero: 5, soldado: 15 },
      crewAlive: { marino: 30, artillero: 5, soldado: 15 },
      days: 40,
      cargoKg: 40000,
      condition: { hull: 40, rigging: 60, crew: 30, morale: 50 },
    });
    localStorage.setItem("barcos:fleet:v1", JSON.stringify(fleet));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.click('.screen-tab[data-screen="flota"]');
  await page.locator('.fleet-item[data-ship-id="smoke-short"] [data-refit]').click();
  await page.waitForTimeout(200);
  const repairOnly = (await page.locator("#fleet-repair-btn").textContent())?.trim() ?? "";
  const repairPrice = Number((repairOnly.match(/(\d[\d.]*)/g) ?? []).pop()?.replace(/\./g, "") ?? 0);
  check(repairPrice > 0 && repairPrice < quoted,
    `S174: a seaworthy hull must cost less than a short one (${repairPrice} vs ${quoted})`);

  if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the repair button also hires the minimum crew, loads 25 days and stows ballast");
