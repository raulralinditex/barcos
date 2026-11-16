import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { shipHold } from "../src/model/commerce.js";
import { COMMODITIES } from "../src/data/naval-data.js";

/**
 * Browser smoke for the hold on the fleet panel (S124). Needs the local server on 8765.
 *
 * The player's report, verbatim: "cuando en el mercado cargamos una nave con carga, la
 * carga de la nave no cambia y no podemos saber que carga lleva la nave".
 *
 * What the market actually did: it wrote the hold on the captain's fleet entry and the
 * screen showed it. What was missing was every other place a player looks at a hull. The
 * fleet panel showed her condition bars and nothing about what she carried, so the load
 * was invisible unless the player happened to be standing in a yard.
 *
 * Pinned:
 *   a hull with nothing aboard says so, and no manifest rows are invented;
 *   buying at the market makes the hold visible in the fleet panel, with the units and
 *   the kg of each commodity, and the total against her capacity;
 *   the sum the panel shows is the model's own `shipHold`, not a second accounting.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
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

const fleet = { v: 1, ships: [ship], captainId: ship.id };
const world = {
  v: 1,
  seed: 4242,
  rngState: 4242,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  encounters: [],
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, locale: "es-AR" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.addInitScript(({ fleet, world }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify(fleet));
    localStorage.setItem(
      "barcos:game:v1",
      JSON.stringify({ gold: 5000, world: JSON.stringify(world) }),
    );
  }, { fleet, world });

  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const holdPanel = () =>
    page.evaluate(() => {
      const el = document.querySelector("#fleet-hold");
      return {
        hidden: el.hidden,
        text: el.textContent.replace(/\s+/g, " ").trim(),
        rows: [...el.children].map((row) => row.textContent.replace(/\s+/g, " ").trim()),
      };
    });

  const pickHull = async () => {
    await page.click('.screen-tab[data-screen="flota"]');
    await page.waitForTimeout(250);
    await page.locator(`.fleet-item[data-ship-id="${ship.id}"] [data-refit]`).click();
    await page.waitForTimeout(250);
  };

  /* ------------------------------------------------------- an empty hold says so */

  await pickHull();
  const empty = await holdPanel();
  assert.equal(empty.hidden, false, "the panel reports the hold even when it is empty");
  assert.ok(empty.text.includes("Bodega vacía"), `an empty hold says so: "${empty.text}"`);
  assert.equal(empty.rows.length, 1, `an empty hold invents no manifest rows: ${JSON.stringify(empty.rows)}`);

  /* --------------------------------- the market loads her, and the fleet shows what */

  await page.click('.screen-tab[data-screen="mercado"]');
  await page.waitForTimeout(300);
  const bought = [];
  for (const id of ["sal", "vino"]) {
    const commodity = COMMODITIES.find((entry) => entry.id === id);
    await page.locator(`[data-buy="${id}"]`).click();
    await page.waitForTimeout(250);
    bought.push(commodity);
  }

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships[0]);
  const hold = shipHold(saved);
  assert.equal(hold.manifest.length, 2, `two commodities are aboard: ${JSON.stringify(hold.manifest)}`);
  assert.ok(hold.cargoKg > 0, "the hold weighs something");

  await pickHull();
  const loaded = await holdPanel();
  assert.ok(
    loaded.text.includes(`Bodega: ${hold.cargoKg}`),
    `the panel shows the model's own total (${hold.cargoKg} kg): "${loaded.text}"`,
  );
  assert.ok(
    loaded.text.includes(saved.capacityKg.toLocaleString("es-ES")),
    `and her capacity, so the load reads against the room she has: "${loaded.text}"`,
  );

  for (const commodity of bought) {
    const units = hold.manifest.find((entry) => entry.commodityId === commodity.id)?.units ?? 0;
    assert.ok(units > 0, `${commodity.id} is aboard`);
    assert.ok(
      loaded.rows.some((row) => row.includes(`${units} ×`) && row.includes(`${units * commodity.kgPerUnit} kg`)),
      `the panel names ${units} × ${commodity.id} and its kg: ${JSON.stringify(loaded.rows)}`,
    );
  }

  /* --------------------------- selling it all empties the panel, without a reload */

  await page.click('.screen-tab[data-screen="mercado"]');
  await page.waitForTimeout(300);
  for (const commodity of bought) {
    await page.locator(`[data-sell="${commodity.id}"]`).click();
    await page.waitForTimeout(250);
  }
  await pickHull();
  const emptied = await holdPanel();
  assert.ok(emptied.text.includes("Bodega vacía"), `selling it all empties the panel: "${emptied.text}"`);
  assert.equal(emptied.rows.length, 1, "and leaves no stale manifest rows behind");

  assert.deepEqual(errors, [], `the screens threw: ${errors.join(" | ")}`);
  console.log(`smoke-fleet-hold OK — ${hold.cargoKg} kg shown for ${hold.manifest.length} commodities`);
} finally {
  await browser.close();
}
