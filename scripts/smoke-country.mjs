import { chromium } from "playwright";
import { COUNTRIES } from "../src/data/naval-data.js";
import { availableHulls, availablePieces } from "../src/model/country.js";

/**
 * Browser smoke for the country selector (S26), driven through the UI only.
 *
 * The shipyard sells one country's catalogue at a time: England by default, only that
 * country's hulls and pieces, the choice stored in the browser, and locked as soon as
 * the fleet owns a ship. Switching country with a half-built loadout must repair it
 * instead of leaving an illegal ship on screen.
 */

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const PORT = "http://localhost:8765/index.html";
const CONFIG_KEY = "barcos:config:v1";
const FLEET_KEY = "barcos:fleet:v1";

const attach = (page) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
};

/** A page whose storage is seeded once, before the app boots. */
const openPage = async ({ config = null, fleet = null, language = "es" } = {}) => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  attach(page);
  await page.addInitScript(
    ([seedConfig, seedFleet, lang]) => {
      if (window.__seeded) return;
      window.__seeded = true;
      localStorage.setItem("barcos:lang:v1", lang);
      if (seedConfig) localStorage.setItem("barcos:config:v1", seedConfig);
      if (seedFleet) localStorage.setItem("barcos:fleet:v1", seedFleet);
    },
    [config ? JSON.stringify(config) : null, fleet ? JSON.stringify(fleet) : null, language],
  );
  await page.goto(PORT, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  return page;
};

const hullNames = (page) => page.locator(".hull-card-name").allTextContents();
const pieceNames = (page) => page.locator("#piece-select option").allTextContents();
const selectedHull = (page) => page.locator(".hull-card.is-active .hull-card-name").first().textContent();
const country = (page) => page.locator("#country-select").inputValue();

const englishNames = {
  hulls: availableHulls("inglaterra").map((hull) => hull.id),
  pieces: availablePieces("inglaterra").map((piece) => piece.id),
};

/* ---------------------------------------------------------------- default country */

const fresh = await openPage();
const freshState = {
  hasSelector: (await fresh.locator("#country-select").count()) === 1,
  country: await fresh.locator("#country-select").count() === 1 ? await country(fresh) : null,
  options: await fresh.locator("#country-select option").allTextContents().catch(() => []),
  values: await fresh.locator("#country-select option").evaluateAll((nodes) => nodes.map((n) => n.value)).catch(() => []),
  hullCards: await fresh.locator(".hull-card").count(),
  hullNames: await hullNames(fresh),
  enabled: await fresh.locator("#country-select").isEnabled().catch(() => false),
  stored: await fresh.evaluate(() => localStorage.getItem("barcos:country:v1")),
};
check(freshState.hasSelector, "the shipyard must offer a country selector (S26)");
check(freshState.country === "inglaterra", `the default country must be England, got ${freshState.country}`);
check(
  JSON.stringify(freshState.values) === JSON.stringify(COUNTRIES),
  `the selector must offer exactly ${COUNTRIES.join(", ")}, got ${freshState.values.join(", ")}`,
);
check(freshState.enabled, "with an empty fleet the selector must be usable");
check(
  freshState.hullCards === englishNames.hulls.length,
  `England must show ${englishNames.hulls.length} hulls, got ${freshState.hullCards}`,
);
check(
  freshState.hullNames.includes("Galeón pequeño"),
  `the English catalogue must be the one on screen, got ${freshState.hullNames.join(", ")}`,
);
check(
  !freshState.hullNames.includes("Patache"),
  `other countries' hulls must not appear, got ${freshState.hullNames.join(", ")}`,
);

/* ---------------------------------------------------------------- switching country */

await fresh.selectOption("#country-select", "espana");
await fresh.waitForTimeout(300);
const spain = {
  country: await country(fresh),
  hullNames: await hullNames(fresh),
  hullCards: await fresh.locator(".hull-card").count(),
  pieces: await pieceNames(fresh),
  selected: await selectedHull(fresh),
  stored: await fresh.evaluate(() => localStorage.getItem("barcos:country:v1")),
  batteryPieces: await fresh.locator(".battery-name").allTextContents(),
};
check(spain.country === "espana", `switching must select Spain, got ${spain.country}`);
check(
  spain.hullCards === availableHulls("espana").length,
  `Spain must show ${availableHulls("espana").length} hulls, got ${spain.hullCards}`,
);
check(spain.hullNames.includes("Patache"), `Spain must show its own hulls, got ${spain.hullNames.join(", ")}`);
check(
  !spain.hullNames.includes("Galeón pequeño"),
  `English hulls must disappear, got ${spain.hullNames.join(", ")}`,
);
check(spain.stored === "espana", `the choice must persist, stored ${spain.stored}`);
check(
  spain.selected === "Patache",
  `the loadout must fall back to a Spanish hull, got ${spain.selected}`,
);
const allowedSpanishPieces = availablePieces("espana").map((piece) => piece.id);
check(
  !spain.pieces.some((label) => label.startsWith("Minion")),
  `the piece picker must not offer the minion, got ${spain.pieces.join(" | ")}`,
);
check(
  spain.batteryPieces.every((name) => name !== "Minion de 4 libras"),
  `the loadout must drop the minion batteries, got ${spain.batteryPieces.join(", ")}`,
);
check(
  allowedSpanishPieces.length > 0 && spain.pieces.length === allowedSpanishPieces.length,
  `Spain must offer exactly ${allowedSpanishPieces.length} pieces, got ${spain.pieces.length}`,
);

/* ---------------------------------------------------------------- persistence + language */

await fresh.reload({ waitUntil: "networkidle" });
await fresh.waitForTimeout(400);
const afterReload = {
  country: await country(fresh),
  hullNames: await hullNames(fresh),
  selected: await selectedHull(fresh),
};
check(afterReload.country === "espana", `the country must survive a reload, got ${afterReload.country}`);
check(afterReload.selected === "Patache", `the Spanish loadout must survive a reload, got ${afterReload.selected}`);
check(
  !afterReload.hullNames.includes("Galeón pequeño"),
  `the filtered catalogue must survive a reload, got ${afterReload.hullNames.join(", ")}`,
);

await fresh.selectOption("#lang-select", "en");
await fresh.waitForTimeout(300);
const english = {
  label: await fresh.locator(".country-label").first().textContent(),
  options: await fresh.locator("#country-select option").allTextContents(),
  hullNames: await hullNames(fresh),
};
check(/Country/i.test(english.label ?? ""), `the selector label must be translated, got ${english.label}`);
check(
  english.options.some((label) => /Spain/i.test(label)),
  `the country names must be translated, got ${english.options.join(", ")}`,
);
check(
  english.hullNames.includes("Patache") || english.hullNames.includes("Zabra"),
  `the hull list must still be Spanish in English, got ${english.hullNames.join(", ")}`,
);

/* ---------------------------------------------------------------- locked with a fleet */

const fleet = {
  v: 1,
  captainId: "hull-1",
  ships: [
    {
      id: "hull-1",
      name: "Golden Hind",
      hullId: "galeon-pequeno",
      hullName: "Galeón pequeño",
      paidGold: 4800,
      upkeep: 20,
      speedKn: 6,
      condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
      crewAlive: { marino: 34, artillero: 10, soldado: 26 },
      batteries: [],
    },
  ],
};

const locked = await openPage({ fleet });
const lockedState = {
  country: await country(locked),
  enabled: await locked.locator("#country-select").isEnabled(),
  hullNames: await hullNames(locked),
  fleetCount: await locked.locator("#fleet-count").textContent(),
  note: await locked.locator(".country-note").first().textContent().catch(() => ""),
};
check(lockedState.enabled === false, "a fleet with a ship must lock the country (S26)");
check(lockedState.country === "inglaterra", `the locked country must show England, got ${lockedState.country}`);
check(
  lockedState.hullNames.includes("Galeón pequeño"),
  `the catalogue must stay England's, got ${lockedState.hullNames.join(", ")}`,
);
check(
  lockedState.note.trim().length > 0,
  "a locked selector must say why, the note is empty",
);

/* ---------------------------------------------------------------- saving the choice */

const saved = await openPage({ config: { hullId: "jacht", batteries: [] } });
await saved.selectOption("#country-select", "paises-bajos");
await saved.waitForTimeout(300);
const dutch = {
  country: await country(saved),
  stored: await saved.evaluate(() => localStorage.getItem("barcos:country:v1")),
  storedConfig: await saved.evaluate(() => localStorage.getItem("barcos:config:v1")),
  hullNames: await hullNames(saved),
  selected: await selectedHull(saved),
};
check(dutch.country === "paises-bajos", `the selector must read the Dutch choice, got ${dutch.country}`);
check(dutch.stored === "paises-bajos", `the choice must be stored, got ${dutch.stored}`);
check(
  JSON.parse(dutch.storedConfig ?? "{}").hullId === "jacht",
  `the reconciled hull must be saved, got ${dutch.storedConfig}`,
);
check(dutch.selected === "Jacht", `the Dutch catalogue keeps the jacht, got ${dutch.selected}`);
check(
  !dutch.hullNames.includes("Galeón pequeño"),
  `English hulls must be gone, got ${dutch.hullNames.join(", ")}`,
);

/* ---------------------------------------------------------------- an old save */

const legacy = await openPage({ config: { hullId: "galeon-pequeno", batteries: [{ pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 20, ammoId: "bala-hierro" }] } });
const legacyState = {
  country: await country(legacy),
  selected: await selectedHull(legacy),
  hullNames: await hullNames(legacy),
};
check(
  legacyState.country === "inglaterra",
  `a save without a country must default to England, got ${legacyState.country}`,
);
check(
  legacyState.selected === "Galeón pequeño",
  `the saved hull must be kept, got ${legacyState.selected}`,
);
check(
  legacyState.hullNames.length === englishNames.hulls.length,
  `England must still show ${englishNames.hulls.length} hulls, got ${legacyState.hullNames.length}`,
);

await browser.close();

const result = { errors, freshState, spain, afterReload, english, lockedState, dutch, legacyState, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: one country at a time, choice persisted, locked with a fleet");
