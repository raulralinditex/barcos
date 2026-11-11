import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/** A real runtime ship, so the sea screen has something to sail. */
const runtime = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 6_000,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  ),
  { name: "Golden Hind" },
);

/**
 * Browser smoke for the language switch (S11-S13), driven through the UI only.
 *
 * Checks that the shipyard renders in both languages, that the selector switches
 * without reloading, that the choice persists, and that a fresh browser with an
 * English locale starts in English.
 */

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const attach = (page) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
};

/* ---------------------------------------------------------------- Spanish browser */
const esPage = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
attach(esPage);
await esPage.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await esPage.waitForTimeout(400);

const text = (page, selector) => page.locator(selector).first().textContent();
const es = {
  brand: await text(esPage, "h1"),
  launch: await text(esPage, "#launch-btn"),
  hulls: await text(esPage, "#hulls-title"),
  selected: await esPage.locator("#lang-select").inputValue(),
  htmlLang: await esPage.evaluate(() => document.documentElement.lang),
  hullNames: await esPage.locator(".hull-card-name").allTextContents(),
};
check(es.brand === "Astillero", `Spanish brand should be Astillero, got ${es.brand}`);
check(es.selected === "es", `Spanish browser should select es, got ${es.selected}`);
check(es.htmlLang === "es", `html lang should be es, got ${es.htmlLang}`);

// switch to English in the same page
await esPage.selectOption("#lang-select", "en");
await esPage.waitForTimeout(400);

const en = {
  brand: await text(esPage, "h1"),
  launch: await text(esPage, "#launch-btn"),
  hulls: await text(esPage, "#hulls-title"),
  hullNames: await esPage.locator(".hull-card-name").allTextContents(),
  htmlLang: await esPage.evaluate(() => document.documentElement.lang),
  stored: await esPage.evaluate(() => localStorage.getItem("barcos:lang:v1")),
  url: esPage.url(),
};
check(en.brand === "Shipyard", `English brand should be Shipyard, got ${en.brand}`);
check(en.launch === "Launch the ship", `English launch button, got ${en.launch}`);
// Compare the whole list: some hulls keep the same name in both languages
// (Patache, Jacht, Zabra), but the class names must move.
check(
  JSON.stringify(en.hullNames) !== JSON.stringify(es.hullNames),
  "hull names must be translated, not only the chrome",
);
check(
  en.hullNames.includes("Small galleon"),
  `expected the galleon to be translated, got ${en.hullNames.join(", ")}`,
);
check(en.htmlLang === "en", `html lang should be en, got ${en.htmlLang}`);
check(en.stored === "en", `the choice must persist, stored ${en.stored}`);

// --- the choice survives a reload, and wins over the browser locale ---------
await esPage.reload({ waitUntil: "networkidle" });
await esPage.waitForTimeout(400);
const afterReload = {
  brand: await text(esPage, "h1"),
  selected: await esPage.locator("#lang-select").inputValue(),
};
check(afterReload.brand === "Shipyard", "the stored choice must survive a reload");
check(afterReload.selected === "en", `selector should read en after reload, got ${afterReload.selected}`);

/* ---------------------------------------------------------------- English browser */
const enPage = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "en-GB" });
attach(enPage);
await enPage.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await enPage.waitForTimeout(400);
const freshEn = {
  brand: await text(enPage, "h1"),
  selected: await enPage.locator("#lang-select").inputValue(),
};
check(freshEn.selected === "en", `an English browser should start in English, got ${freshEn.selected}`);
check(freshEn.brand === "Shipyard", `an English browser should render English, got ${freshEn.brand}`);

/* ---------------------------------------------------------------- French browser */
const frPage = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "fr-FR" });
attach(frPage);
await frPage.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await frPage.waitForTimeout(400);
const freshFr = {
  brand: await text(frPage, "h1"),
  selected: await frPage.locator("#lang-select").inputValue(),
};
check(freshFr.selected === "es", `an unsupported locale falls back to Spanish, got ${freshFr.selected}`);
check(freshFr.brand === "Astillero", `an unsupported locale should render Spanish, got ${freshFr.brand}`);


/* ---------------------------------------------------------------- the sea screen */
// S13: the sea has no selector, it inherits the shipyard's choice.
const sea = {};
for (const language of ["es", "en"]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, locale: `${language}-ES` });
  attach(page);
  await page.addInitScript(
    ([shipJson, lang]) => {
      localStorage.setItem("barcos:lang:v1", lang);
      const ship = JSON.parse(shipJson);
      localStorage.setItem(
        "barcos:fleet:v1",
        JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }),
      );
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000 }));
    },
    [JSON.stringify(runtime), language],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  sea[language] = await page.evaluate(() => ({
    title: document.title,
    goldLabel: document.querySelector("#hud-gold").previousElementSibling.textContent,
    zone: document.querySelector("#hud-zone").textContent,
    help: document.querySelector(".hud-help").textContent,
    htmlLang: document.documentElement.lang,
    hasSelector: Boolean(document.querySelector("#lang-select")),
  }));
  await page.close();
}

check(sea.es.goldLabel === "Doblones", `Spanish sea HUD, got ${sea.es.goldLabel}`);
check(sea.en.goldLabel === "Doubloons", `English sea HUD, got ${sea.en.goldLabel}`);
check(sea.es.zone === "Aguas costeras", `Spanish zone, got ${sea.es.zone}`);
check(sea.en.zone === "Coastal waters", `English zone, got ${sea.en.zone}`);
check(sea.es.htmlLang === "es" && sea.en.htmlLang === "en", "the sea must set html lang");
check(!sea.es.hasSelector && !sea.en.hasSelector, "the sea must not carry a language selector (S13)");

await esPage.screenshot({ path: "/tmp/i18n-en.png" });
await browser.close();

const result = { errors, es, en, afterReload, freshEn, freshFr, sea, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: both languages render, switch without reload, choice persists");
