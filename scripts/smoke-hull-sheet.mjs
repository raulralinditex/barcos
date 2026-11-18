import { chromium } from "playwright";

/**
 * S141: the hull's own sheet, back on the screen.
 *
 * The sheet was lost in S46 when the launch dialog was removed
 * (`estado-flota-y-reparacion-parcial.md`, L14). The player asked for it again:
 * the panel of the ship must show, without a click, the six facts about the hull
 * that no other block on the screen shows.
 *
 * What is proven here, through the UI only:
 *   1. the block exists in the panel of the ship, in both languages;
 *   2. it names the hull, her country, her length and her displacement;
 *   3. the supply and the cargo follow the editor, so the sheet is live;
 *   4. changing the hull changes the sheet, so it is not a stale snapshot;
 *   5. the six numbers are the hull's own, not a copy of the stats row below.
 */

const browser = await chromium.launch();
const failures = [];
const errors = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const open = async (language) => {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript((lang) => {
    localStorage.setItem("barcos:lang:v1", lang);
  }, language);
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  return { context, page };
};

const sheet = async (page) => {
  const block = page.locator("#hull-sheet");
  return {
    visible: await block.isVisible(),
    title: await page.locator("#hull-sheet-title").textContent(),
    hull: await page.locator("#sheet-hull").textContent(),
    country: await page.locator("#sheet-country").textContent(),
    length: await page.locator("#sheet-length").textContent(),
    displacement: await page.locator("#sheet-displacement").textContent(),
    supply: await page.locator("#sheet-supply").textContent(),
    cargo: await page.locator("#sheet-cargo").textContent(),
    rows: await page.locator("#hull-sheet dt").count(),
  };
};

try {
  /* ---------------------------------------------------------------- Spanish */
  const es = await open("es");
  const esSheet = await sheet(es.page);

  check(esSheet.visible, "S141: the hull's sheet must be on screen without a click");
  check(esSheet.title === "Ficha del casco", `S141: the block is titled "Ficha del casco", got "${esSheet.title}"`);
  check(esSheet.rows === 6, `S141: the sheet shows exactly the six facts nothing else shows, got ${esSheet.rows}`);
  check(esSheet.hull === "Galeón pequeño", `S141: the sheet names the hull, got "${esSheet.hull}"`);
  check(esSheet.country === "Inglaterra", `S141: the sheet names her country, got "${esSheet.country}"`);
  check(esSheet.length === "25 m", `S141: the sheet gives her length, got "${esSheet.length}"`);
  check(
    esSheet.displacement === "250.000 kg",
    `S141: the sheet gives her displacement, got "${esSheet.displacement}"`,
  );
  check(/^45 días$/.test(esSheet.supply), `S141: the sheet gives the supply aboard, got "${esSheet.supply}"`);
  check(/^6000 kg$/.test(esSheet.cargo), `S141: the sheet gives the cargo aboard, got "${esSheet.cargo}"`);

  // The sheet is live: it reads the editor, not a snapshot taken at boot. The supply
  // fields live in the Carga tab, so open it before touching them. `fill` alone does not
  // fire `change`, which is the event the editor listens for: Tab commits the value.
  await es.page.click('.tab[data-tab="supply"]');
  await es.page.waitForTimeout(150);
  const daysInput = es.page.locator('#supply-list input[data-supply="days"]');
  await daysInput.fill("60");
  await daysInput.press("Tab");
  await es.page.waitForTimeout(200);
  const afterDays = await sheet(es.page);
  check(afterDays.supply === "60 días", `S141: the supply on the sheet follows the editor, got "${afterDays.supply}"`);

  const cargoInput = es.page.locator('#supply-list input[data-supply="cargoKg"]');
  await cargoInput.fill("5000");
  await cargoInput.press("Tab");
  await es.page.waitForTimeout(200);
  const afterCargo = await sheet(es.page);
  check(afterCargo.cargo === "5000 kg", `S141: the cargo on the sheet follows the editor, got "${afterCargo.cargo}"`);

  // The sheet is the hull's own: a different hull reads different numbers.
  await es.page.locator(".hull-card", { hasText: "Gran buque real" }).click();
  await es.page.waitForTimeout(200);
  const flagship = await sheet(es.page);
  check(
    flagship.hull === "Gran buque real",
    `S141: picking another hull must change the sheet, got "${flagship.hull}"`,
  );
  check(
    flagship.length !== esSheet.length && flagship.displacement !== esSheet.displacement,
    `S141: another hull brings her own length and displacement, got ${flagship.length} / ${flagship.displacement}`,
  );

  await es.context.close();

  /* ---------------------------------------------------------------- English */
  const en = await open("en");
  const enSheet = await sheet(en.page);
  check(enSheet.title === "Hull's sheet", `S141: the block is translated, got "${enSheet.title}"`);
  check(enSheet.country === "England", `S141: the country is translated, got "${enSheet.country}"`);
  check(/^45 days$/.test(enSheet.supply), `S141: the supply reads in English, got "${enSheet.supply}"`);
  await en.context.close();
} finally {
  await browser.close();
}

console.log(JSON.stringify({ failures, errors }, null, 2));
process.exit(failures.length > 0 || errors.length > 0 ? 1 : 0);
