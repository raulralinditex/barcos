import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for buying a hull when the fleet already has one (S129). Needs the local
 * server on 8765.
 *
 * The player's report, verbatim: "al comprar un barco, si has comprado un barco antes, no
 * puedes cambiar el tipo de barco, siempre compras el mismo independientemente del que
 * elijas".
 *
 * What was really happening: the boot filled the editor with the captain and left
 * `refitId` pointing at her, while the entry screen is Comprar. That screen disables every
 * hull card and turns the button into "Save refit", so the click on a hull did nothing and
 * the button refitted the captain — which the player reads as "it always buys the same
 * ship". Nothing about the purchase itself was wrong.
 *
 * Pinned:
 *   the yard opens on Comprar with every hull card usable and the button offering a buy;
 *   choosing a different hull really changes the selection;
 *   the purchase adds the chosen hull, and the fleet keeps both;
 *   entering from the fleet still offers the refit, so the fix did not remove that path.
 */

const captain = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [{ pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" }],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 0,
      ballastKg: 0,
      equipmentKg: 0,
      reserveKg: 0,
    },
    12000,
  ),
  { name: "Capitana" },
);

const fleet = { v: 1, ships: [captain], captainId: captain.id };

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, locale: "es-AR" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.addInitScript(({ fleet }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify(fleet));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 200000 }));
  }, { fleet });

  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);

  const cards = () =>
    page.$$eval(".hull-card", (els) =>
      els.map((el) => ({
        id: el.dataset.hullId,
        active: el.classList.contains("is-active"),
        disabled: el.disabled,
      })),
    );
  const button = () => page.evaluate(() => document.querySelector("#launch-btn").textContent.trim());
  const savedHulls = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.map((s) => s.hullId));

  /* ------------------------------- the yard opens able to sell, not in refit mode */

  assert.ok(
    (await button()).includes("Añadir"),
    `with a fleet already afloat the yard must offer a purchase, not a refit: "${await button()}"`,
  );
  const opening = await cards();
  assert.ok(opening.length > 1, `the yard lists several hulls: ${opening.length}`);
  assert.deepEqual(
    opening.filter((card) => card.disabled).map((card) => card.id),
    [],
    `every hull card must be usable on entry (S129): ${JSON.stringify(opening)}`,
  );

  /* --------------------------------- choosing a different hull changes the choice */

  // The two heaviest hulls cost more than the purse this smoke seeds, so their button is
  // legitimately disabled. Pick the first hull she can actually afford, which is the case
  // the player reported.
  let target = null;
  for (const card of opening.filter((entry) => !entry.active)) {
    await page.locator(`.hull-card[data-hull-id="${card.id}"]`).click();
    await page.waitForTimeout(200);
    const enabled = await page.evaluate(() => !document.querySelector("#launch-btn").disabled);
    if (!enabled) continue;
    const chosenNow = (await cards()).filter((entry) => entry.active).map((entry) => entry.id);
    assert.deepEqual(chosenNow, [card.id], `the click must select the chosen hull, not the captain: ${chosenNow}`);
    target = card;
    break;
  }
  assert.ok(target, "the purse must be able to afford at least one hull in the yard");

  /* ------------------------------ the purchase adds that hull and keeps the old one */

  await page.click("#launch-btn");
  await page.waitForTimeout(900);
  const bought = await savedHulls();
  assert.deepEqual(bought, [captain.hullId, target.id], `the fleet must hold both hulls: ${bought}`);
  const notice = await page.textContent("#purchase-notice");
  assert.ok(notice.length > 0, "the purchase answers in the notice");

  /* ------------------------------------- the refit path still exists from the fleet */

  await page.click('.screen-tab[data-screen="flota"]');
  await page.waitForTimeout(250);
  await page.locator(`.fleet-item[data-ship-id="${captain.id}"] [data-refit]`).click();
  await page.waitForTimeout(300);
  assert.ok(
    (await button()).includes("reforma"),
    `picking a hull from the fleet must still offer the refit: "${await button()}"`,
  );

  assert.deepEqual(errors, [], `the yard threw: ${errors.join(" | ")}`);
  console.log(`smoke-buy-hull OK — opened buying, chose ${target.id}, fleet holds ${bought.join(" + ")}`);
} finally {
  await browser.close();
}
