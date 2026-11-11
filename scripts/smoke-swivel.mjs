import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for the swivel gun (S20), driven through the UI only.
 *
 * Shipyard (both languages): the verso can be added, it has no choosable side, the
 * summary counts it apart, the card is translated, and too many of them block the
 * launch with a readable error.
 *
 * Sea: a ship armed only with swivels answers a target on the starboard beam with E
 * and a target on the port beam with Q, spending its own rounds each time.
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

/* ---------------------------------------------------------------- shipyard */

const labels = {
  es: { swivel: /giratorias\s+2/i, side: "Costado", qty: "Cantidad", blocked: /giratorias/i },
  en: { swivel: /swivels\s+2/i, side: "Side", qty: "Quantity", blocked: /swivel/i },
};
const yard = {};

for (const language of ["es", "en"]) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: `${language}-ES` });
  attach(page);
  await page.addInitScript((lang) => {
    localStorage.clear();
    localStorage.setItem("barcos:lang:v1", lang);
  }, language);
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  const cardsBefore = await page.locator(".battery").count();
  await page.selectOption("#piece-select", "verso");
  await page.click("#add-battery");
  await page.waitForTimeout(250);

  const cards = page.locator(".battery");
  const last = cards.last();
  const info = {
    cardsBefore,
    cardsAfter: await cards.count(),
    sideDisabled: await last.locator('select[data-field="side"]').isDisabled(),
    sideValue: await last.locator('select[data-field="side"]').inputValue(),
    sideLabel: await last.locator("label").first().locator("span").textContent(),
    qtyLabel: await last.locator("label").nth(1).locator("span").textContent(),
    summary: await page.locator("#guns-swivel").textContent(),
    cardText: await last.textContent(),
  };

  // a normal cannon keeps its choosable side
  const firstSideDisabled = await cards.first().locator('select[data-field="side"]').isDisabled();

  // too many swivels block the launch with a readable error
  const qty = last.locator('input[data-field="qty"]');
  await qty.fill("40");
  await qty.blur();
  await page.waitForTimeout(300);
  info.launchDisabled = await page.locator("#launch-btn").isDisabled();
  info.verdict = await page.locator("#verdict-issues").textContent();
  info.firstSideDisabled = firstSideDisabled;

  yard[language] = info;
  await page.close();

  const expect = labels[language];
  check(info.cardsAfter === info.cardsBefore + 1, `${language}: the verso card was not added`);
  check(info.sideDisabled, `${language}: a swivel must not offer a side to choose`);
  check(info.sideValue === "swivel", `${language}: swivel side value is ${info.sideValue}`);
  check(!info.firstSideDisabled, `${language}: a fixed gun must keep its side selector`);
  check(expect.swivel.test(info.summary), `${language}: summary should count swivels, got "${info.summary}"`);
  check(info.sideLabel === expect.side, `${language}: side label "${info.sideLabel}"`);
  check(info.qtyLabel === expect.qty, `${language}: quantity label "${info.qtyLabel}"`);
  check(info.launchDisabled, `${language}: 40 swivels must block the launch`);
  check(expect.blocked.test(info.verdict), `${language}: verdict should name the swivels: "${info.verdict}"`);
}

check(
  yard.es.cardText !== yard.en.cardText,
  "the battery card must differ between languages (it used to be hardcoded Spanish)",
);
check(/swivel gun/i.test(yard.en.cardText), "English card should name the family 'swivel gun'");
check(/Swivel \(both sides\)/.test(yard.en.cardText), "English card should offer 'Swivel (both sides)'");

/* ---------------------------------------------------------------- sea */

const swivelShip = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [{ pieceId: "verso", qty: 4, side: "swivel", shotsPerPiece: 30, ammoId: "metralla" }],
      crew: { marino: 34, artillero: 6, soldado: 26 },
      days: 45,
      cargoKg: 3_000,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    30_000,
  ),
  { name: "Rail" },
);

const world = (enemyY) => ({
  v: 1,
  seed: 424242,
  rngState: 424242,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 210, y: 70, heading: 0, currentSpeedKn: 0, speedKn: swivelShip.speedKn },
  encounters: [
    {
      id: 901,
      type: "enemy",
      x: 210,
      y: enemyY,
      hullId: "patache",
      zoneId: "costera",
      drift: { heading: 0, speedKn: 0 },
    },
  ],
});

const parseG = (text) => {
  const match = /G\s+(\d+)/.exec(String(text));
  return match ? Number(match[1]) : null;
};

async function fireAt(enemyY, key) {
  const page = await browser.newPage({ viewport: { width: 1300, height: 850 }, locale: "es-ES" });
  attach(page);
  await page.addInitScript(
    ([shipJson, worldJson]) => {
      const ship = JSON.parse(shipJson);
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 1000, world: worldJson }));
    },
    [JSON.stringify(swivelShip), JSON.stringify(world(enemyY))],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const before = parseG(await page.locator("#hud-rounds").textContent());
  await page.keyboard.press(key);
  await page.waitForTimeout(250);
  const after = parseG(await page.locator("#hud-rounds").textContent());
  const banner = await page.locator("#banner").textContent();

  // the other key faces away from the target and must stay silent
  const otherKey = key === "e" ? "q" : "e";
  await page.waitForTimeout(6500); // let the swivels reload
  const beforeOther = parseG(await page.locator("#hud-rounds").textContent());
  await page.keyboard.press(otherKey);
  await page.waitForTimeout(250);
  const afterOther = parseG(await page.locator("#hud-rounds").textContent());
  const otherBanner = await page.locator("#banner").textContent();

  await page.close();
  return { before, after, banner, beforeOther, afterOther, otherBanner };
}

// enemy 120 m due south of an east-bound ship = starboard beam; due north = port beam
const starboard = await fireAt(190, "e");
const port = await fireAt(-50, "q");

check(starboard.before === 120, `swivel rounds before: ${starboard.before}`);
check(starboard.after !== null && starboard.after < starboard.before, `swivels must answer E on the starboard beam (${starboard.before} -> ${starboard.after})`);
check(port.after !== null && port.after < port.before, `swivels must answer Q on the port beam (${port.before} -> ${port.after})`);
check(starboard.afterOther === starboard.beforeOther, `Q must stay silent with the target to starboard (${starboard.beforeOther} -> ${starboard.afterOther})`);
check(port.afterOther === port.beforeOther, `E must stay silent with the target to port (${port.beforeOther} -> ${port.afterOther})`);

await browser.close();

console.log(JSON.stringify({ errors, yard: { es: yard.es.summary, en: yard.en.summary, esVerdict: yard.es.verdict.trim().slice(0, 80), enVerdict: yard.en.verdict.trim().slice(0, 80) }, starboard, port, failures }, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: swivel in the shipyard (es/en), limit, and fire on both beams");
