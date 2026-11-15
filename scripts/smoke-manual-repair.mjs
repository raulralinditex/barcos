/**
 * Browser smoke for manual repair (S86), driven through the screen.
 *
 * The player asked for repairing to stop being automatic and to become a button on each
 * fleet entry. So the two things worth proving are:
 *   - arriving at the home port spends nothing and repairs nobody;
 *   - the repair button on a fleet entry puts that hull right, and only that one.
 */

import { chromium } from "playwright";

const fleet = {
  v: 1,
  captainId: "a",
  ships: [
    {
      id: "a",
      name: "Capitana",
      hullId: "galeon-pequeno",
      hullName: "Galeón pequeño",
      batteries: [{ pieceId: "minion", side: "babor", qty: 3, shots: 30 }],
      crew: { marino: 20, artillero: 6 },
      days: 20, cargoKg: 0, ballastKg: 0, equipmentKg: 0, reserveKg: 0,
      condition: { hull: 40, rigging: 100, crew: 100, morale: 100 },
      crewAlive: { marino: 20, artillero: 6 },
      sails: true, speedKn: 6, hullToughness: 166,
    },
    {
      id: "b",
      name: "Escolta",
      hullId: "barca-costera",
      hullName: "Barca costera",
      batteries: [{ pieceId: "falconete", side: "babor", qty: 2, shots: 40 }],
      crew: { marino: 10 },
      days: 20, cargoKg: 0, ballastKg: 0, equipmentKg: 0, reserveKg: 0,
      condition: { hull: 30, rigging: 100, crew: 100, morale: 100 },
      crewAlive: { marino: 10 },
      sails: true, speedKn: 5, hullToughness: 60,
    },
  ],
};

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.addInitScript(([f]) => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", f);
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 40000 }));
}, [JSON.stringify(fleet)]);

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
// The fleet strip lives in the Flota room (S105, S108): enter it before reading the list.
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(200);

const readFleet = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.map((s) => ({
    id: s.id, hull: s.condition?.hull,
  })));
const readGold = () => page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1") ?? "{}").gold);

/* --------------------------------------------- the actions belong to the picked hull */

// S108: the rows carry no actions any more; picking a hull fills the panel under the
// list with her bars and her two buttons.
const rows = await page.evaluate(() =>
  [...document.querySelectorAll(".fleet-item")].map((el) => ({
    id: el.dataset.shipId,
    rowActions: el.querySelectorAll("[data-repair], [data-sell]").length,
  })),
);
check(rows.length === 2, `expected two fleet entries, got ${rows.length}`);
check(rows.every((r) => r.rowActions === 0), `a fleet row still carries its actions: ${JSON.stringify(rows)}`);

// Each hull's own buttons answer when she is picked.
const perHull = [];
for (const id of ["a", "b"]) {
  await page.locator(`.fleet-item[data-ship-id="${id}"] [data-refit]`).click();
  perHull.push(await page.evaluate(() => ({
    name: document.querySelector("#fleet-detail-name")?.textContent ?? "",
    bars: document.querySelectorAll("#fleet-bars .fleet-bar-row").length,
    repair: document.querySelector("#fleet-repair-btn")?.textContent?.trim() ?? "",
    disabled: document.querySelector("#fleet-repair-btn")?.disabled ?? true,
  })));
}
check(perHull.every((h) => /reparar/i.test(h.repair)), `a hull has no repair action: ${JSON.stringify(perHull)}`);
check(perHull.every((h) => h.bars === 4), `a hull is missing her condition bars: ${JSON.stringify(perHull)}`);
check(perHull.every((h) => !h.disabled), "a damaged hull's repair action is disabled");

/* --------------------------------------------- repairing is manual and per hull */

const goldBefore = await readGold();
const fleetBefore = await readFleet();
check(fleetBefore.find((s) => s.id === "a").hull === 40, "the seeded captain is not damaged");

await page.locator('.fleet-item[data-ship-id="a"] [data-refit]').click();
await page.locator("#fleet-repair-btn").dispatchEvent("click");
await page.waitForTimeout(900);

const fleetAfter = await readFleet();
const goldAfter = await readGold();
const captain = fleetAfter.find((s) => s.id === "a");
const escort = fleetAfter.find((s) => s.id === "b");
check(captain.hull > 40, `the repair button did not repair the captain (${captain.hull})`);
check(captain.hull === 100, `the captain did not come back whole (${captain.hull})`);
check(escort.hull === 30, `repairing one hull repaired another too (escort ${escort.hull})`);
check(goldAfter < goldBefore, `repairing cost nothing (${goldBefore} -> ${goldAfter})`);

/* --------------------------------------------- the dialog is gone: no automatic ask */

// The dialog asked "shall we repair the fleet?" on opening. With manual repair it must not
// spend anything on its own, which is the rule: the player answers, not the screen.
const dialogOpen = await page.evaluate(() => {
  const dialog = document.querySelector("#dock-dialog");
  return Boolean(dialog && !dialog.classList.contains("is-hidden"));
});
check(!dialogOpen, "the dock dialog still opens by itself on entering the shipyard");

await browser.close();

const result = { errors, rows, perHull, goldBefore, goldAfter, fleetBefore, fleetAfter, dialogOpen, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: repairing belongs to the picked hull's panel, and the shipyard spends nothing on its own");
