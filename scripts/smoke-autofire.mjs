import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for automatic fire (S47, S88). Needs the local server on 8765.
 *
 * The switch used to be a check in the shipyard's fleet panel; S88 moved it to the
 * settings screen, where the rest of the design numbers live. The behaviour it controls
 * is unchanged, so this smoke pins the same three facts and only changes where the
 * player touches it:
 *   settings: a field, on by default, in both languages, that persists;
 *   sea, on:  the captain fires at a hostile on her beam with no key pressed;
 *   sea, off: with the switch off she stays silent until the player fires by hand.
 */

const KEY = "barcos:settings:v1";
const INITIAL_ROUNDS = 6 * 25;
const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500,
    },
    12000,
  ),
  { name: "Captain" },
);
const fleet = { v: 1, captainId: ship.id, ships: [ship] };
// East-facing captain: starboard is south. A hostile 250 m to the south is on her starboard beam.
const world = {
  v: 1, seed: 2, rngState: 2, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 600, y: 600, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [],
  encounters: [
    { id: 901, type: "enemy", hullId: "galeon-guerra", x: 600, y: 850, heading: 0, currentSpeedKn: 0, drift: { heading: 0, speedKn: 0 } },
  ],
};

const browser = await chromium.launch();
const failures = [];
const errors = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

async function open(path, { stored, locale = "es" } = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: locale === "en" ? "en-US" : "es-AR" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ([fleetJson, gameJson, value, lang]) => {
      if (localStorage.getItem("smoke:seeded")) return;
      localStorage.setItem("smoke:seeded", "1");
      localStorage.setItem("barcos:lang:v1", lang);
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", gameJson);
      // S88: the switch is a settings field now, so that is what a scenario stores.
      if (value !== null) localStorage.setItem("barcos:settings:v1", JSON.stringify({ "combat.autofire": Number(value) }));
    },
    [JSON.stringify(fleet), JSON.stringify({ gold: 500, world: JSON.stringify(world) }), stored ?? null, locale],
  );
  await page.goto(`http://localhost:8765/${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  return page;
}

const roundsLeft = (page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return (game.combat?.player?.pieces ?? []).reduce((sum, piece) => sum + piece.shotsLeft, 0);
  });

/* ------------------------------------------------- the switch on the settings screen */

const FIELD = "#field-combat\\.autofire";
const storedSwitch = (page) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw)["combat.autofire"] : null;
  }, KEY);

let page = await open("config.html");
const field = page.locator(FIELD);
check((await field.count()) === 1, "the settings screen has no automatic-fire field");
if (await field.count()) {
  check((await field.inputValue()) === "1", "automatic fire must start on");
  const label = (await page.locator(".settings-row", { has: field }).locator(".settings-label").textContent())?.trim() ?? "";
  check(/disparo autom/i.test(label), `the Spanish label is wrong: "${label}"`);
  await field.fill("0");
  await page.locator("#settings-apply").click();
  await page.waitForTimeout(300);
  check((await storedSwitch(page)) === 0, "turning the switch off was not saved");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  check((await page.locator(FIELD).inputValue()) === "0", "the switch came back on after a reload");
  await page.locator(FIELD).fill("1");
  await page.locator("#settings-apply").click();
  await page.waitForTimeout(300);
  check((await storedSwitch(page)) === 1, "turning the switch on was not saved");
}
await page.close();

page = await open("config.html", { locale: "en" });
const english = (await page.locator(".settings-row", { has: page.locator(FIELD) }).locator(".settings-label").textContent().catch(() => ""))?.trim() ?? "";
check(/fire/i.test(english), `the English label is wrong: "${english}"`);
await page.close();

/* ------------------------------------------------- at sea, with the check on */

page = await open("sea.html"); // nothing stored: the default is on
await page.waitForTimeout(3500);
const afterOn = await roundsLeft(page);
// 6 minions with 25 rounds each: the first broadside goes off the moment the sea opens.
check(afterOn < INITIAL_ROUNDS, `automatic fire is on but the captain never fired (rounds ${INITIAL_ROUNDS} -> ${afterOn})`);
await page.close();

/* ------------------------------------------------- at sea, with the check off */

page = await open("sea.html", { stored: "0" });
await page.waitForTimeout(3500);
const afterOff = await roundsLeft(page);
check(afterOff === INITIAL_ROUNDS, `automatic fire is off but the captain fired by herself (rounds ${INITIAL_ROUNDS} -> ${afterOff})`);
// the keys still work by hand
await page.keyboard.press("e");
await page.waitForTimeout(400);
const manual = await roundsLeft(page);
check(manual < afterOff, `firing by hand (E) stopped working with the check off (rounds ${afterOff} -> ${manual})`);
await page.close();

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
assert.deepEqual(failures, [], failures.join("\n"));
console.log("SMOKE OK: the settings switch persists, and the captain fires by herself only while it is on");
