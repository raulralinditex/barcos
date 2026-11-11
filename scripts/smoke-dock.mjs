import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { REPAIR } from "../src/model/repair.js";

/**
 * Browser smoke for the dock dialog (S25), driven through the UI only.
 *
 * The question is asked once per arrival: on entering the port radius from outside,
 * and on opening the sea already inside it with something damaged. It lists the
 * damaged segments of every hull (captain included), repairs with the same rules as
 * S22/S24, and never comes back while the ship stays in port. The shipyard asks the
 * same question with the shop's purse, and its repair must survive the saved combat
 * of the last voyage, which the sea prefers on boot.
 */

const build = (overrides = {}) =>
  toRuntimeShip(
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
        ...overrides,
      },
      12000,
    ),
    { name: "Golden Hind" },
  );

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const PORT = "http://localhost:8765";
const HURT = { hull: 42, rigging: 61, crew: 60, morale: 70 };
const HURT_CREW = { marino: 20, artillero: 6, soldado: 14 };

const seaWorld = (ship, { x = 0, y = 0, heading = 0 } = {}) => ({
  v: 1,
  seed: 424242,
  rngState: 424242,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x, y, heading, currentSpeedKn: 0, speedKn: ship.speedKn },
  encounters: [],
});

/** One page per scenario, seeded once per browser context through an init flag. */
async function openPage({ path = "sea.html", ships, world, gold, locale = "es", combat, flag }) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([seed, listJson, worldJson, purse, lang, combatJson]) => {
      // The seed must survive a reload of the same page: re-seeding on every
      // navigation would hide exactly what this smoke is checking.
      if (localStorage.getItem(seed) === "1") return;
      localStorage.setItem(seed, "1");
      localStorage.setItem("barcos:lang:v1", lang);
      const list = JSON.parse(listJson);
      localStorage.setItem(
        "barcos:fleet:v1",
        JSON.stringify({ v: 1, ships: list, captainId: list[0].id }),
      );
      const record = { gold: purse };
      // The sea saves its world as a JSON string; seed the same shape.
      if (worldJson) record.world = worldJson;
      if (combatJson) record.combat = { player: JSON.parse(combatJson) };
      localStorage.setItem("barcos:game:v1", JSON.stringify(record));
    },
    [
      flag,
      JSON.stringify(ships),
      world ? JSON.stringify(world) : null,
      gold,
      locale,
      combat ? JSON.stringify(combat) : null,
    ],
  );
  await page.goto(`${PORT}/${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  return page;
}

const fleetOf = (page) =>
  page.evaluate(() => {
    const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return { fleet, game };
  });

const hurtCaptain = () => {
  const captain = build();
  captain.condition = { ...HURT };
  captain.crewAlive = { ...HURT_CREW };
  return captain;
};

/* ------------------------------------------- 1: boot inside the port, captain damaged */

const captain = hurtCaptain();
let page = await openPage({
  ships: [captain],
  world: seaWorld(captain),
  gold: 5000,
  flag: "barcos:smoke-dock-1",
});

const dialogShown = await page.locator("#dock-dialog").isVisible();
check(dialogShown, "the dock dialog did not open on boot inside the port with a damaged hull");

const rows = await page.evaluate(() =>
  [...document.querySelectorAll("#dock-list .dock-ship")].map((row) => ({
    id: row.dataset.shipId,
    text: row.textContent.replace(/\s+/g, " ").trim(),
    button: row.querySelector("button")?.textContent.trim() ?? "",
  })),
);
check(rows.length === 1, `the dialog does not list exactly the damaged hull (${rows.length})`);
check(rows[0]?.text.includes("42"), `the dialog does not show the hull percentage: "${rows[0]?.text}"`);
check(rows[0]?.text.includes("61"), `the dialog does not show the rigging percentage: "${rows[0]?.text}"`);
check(
  rows[0]?.text.includes("40/70"),
  `the dialog does not show the crew alive out of the complement: "${rows[0]?.text}"`,
);
check(
  /42|61/.test(rows[0]?.text ?? "") && /casco/i.test(rows[0]?.text ?? ""),
  `the dialog does not say what needs mending: "${rows[0]?.text}"`,
);
check(
  rows[0]?.button.includes(String(REPAIR.fee)),
  `the dialog does not show the flat fee: "${rows[0]?.button}"`,
);
check(
  /Reparar/i.test(rows[0]?.button ?? ""),
  `the repair button is not labelled in Spanish: "${rows[0]?.button}"`,
);

// "Ahora no" closes it, and the question does not come back while she stays in port
await page.locator("#dock-later").click();
await page.waitForTimeout(400);
check(await page.locator("#dock-dialog").isHidden(), "Ahora no did not close the dialog");
await page.waitForTimeout(2000);
check(
  await page.locator("#dock-dialog").isHidden(),
  "the dialog came back after Ahora no while the ship stayed in port",
);
// the previous repair surfaces keep working (S22, S24)
check(await page.locator("#port-panel").isVisible(), "the port panel disappeared behind the dialog");
await page.close();

/* ------------------------------------------- 2: outside the port, and entering it */

page = await openPage({
  ships: [hurtCaptain()],
  world: seaWorld(hurtCaptain(), { x: 900, y: 0 }),
  gold: 5000,
  flag: "barcos:smoke-dock-2",
});
check(
  await page.locator("#dock-dialog").isHidden(),
  "the dock dialog opened with the ship away from port",
);
await page.close();

// seeded just outside the radius, heading for the origin: sailing in asks the question
const inbound = hurtCaptain();
page = await openPage({
  ships: [inbound],
  world: seaWorld(inbound, { x: 260, y: 0, heading: Math.PI }),
  gold: 5000,
  flag: "barcos:smoke-dock-3",
});
check(
  await page.locator("#dock-dialog").isHidden(),
  "the dock dialog opened before the hull entered the port radius",
);
for (let press = 0; press < 4; press += 1) await page.keyboard.press("w");
let appeared = false;
for (let waited = 0; waited < 40; waited += 1) {
  await page.waitForTimeout(500);
  if (await page.locator("#dock-dialog").isVisible()) {
    appeared = true;
    break;
  }
}
check(appeared, "the dock dialog did not open on entering the port radius");
// Escape closes it and the game keys keep working afterwards
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check(await page.locator("#dock-dialog").isHidden(), "Escape did not close the dock dialog");
await page.keyboard.press("w");
await page.waitForTimeout(300);
const throttleAfterEscape = await page.locator("#hud-throttle").textContent();
check(
  Number.parseInt(throttleAfterEscape, 10) > 0,
  `the game keys stopped working after the dialog (throttle "${throttleAfterEscape}")`,
);
await page.close();

/* ------------------------------------------- 3: repair the captain from the dialog */

page = await openPage({
  ships: [hurtCaptain()],
  world: seaWorld(hurtCaptain()),
  gold: 5000,
  flag: "barcos:smoke-dock-4",
});
await page.locator("#dock-list button[data-ship-id]").click();
await page.waitForTimeout(600);

const repaired = await fleetOf(page);
check(
  repaired.fleet.ships[0].condition.hull === 100,
  `the captain's hull was not repaired from the dialog: ${repaired.fleet.ships[0].condition.hull}`,
);
check(
  repaired.fleet.ships[0].condition.rigging === 100,
  `the rigging was not repaired: ${repaired.fleet.ships[0].condition.rigging}`,
);
check(
  repaired.fleet.ships[0].crewAlive.marino === 34,
  `the crew was not brought back to its complement: ${JSON.stringify(repaired.fleet.ships[0].crewAlive)}`,
);
check(
  repaired.game.gold === 5000 - REPAIR.fee,
  `the fee was not charged exactly once: gold=${repaired.game.gold}`,
);
check(
  await page.locator("#dock-dialog").isHidden(),
  "the dialog stayed open with nothing left to repair",
);
check(
  (await page.locator("#hud-hull").textContent()).startsWith("100"),
  "the HUD still shows damage after the repair",
);
await page.close();

/* ------------------------------------------- 4: no gold, nothing changes */

page = await openPage({
  ships: [hurtCaptain()],
  world: seaWorld(hurtCaptain()),
  gold: 10,
  flag: "barcos:smoke-dock-5",
});
const poorButton = page.locator("#dock-list button[data-ship-id]").first();
check(
  (await poorButton.getAttribute("class"))?.includes("is-short"),
  "the unaffordable repair button is not marked",
);
await poorButton.click();
await page.waitForTimeout(600);
const poor = await fleetOf(page);
check(poor.fleet.ships[0].condition.hull === 42, `a repair happened without paying: ${poor.fleet.ships[0].condition.hull}`);
check(poor.game.gold === 10, `gold was taken without a repair: ${poor.game.gold}`);
const note = await page.locator("#dock-note").textContent();
check(
  note.includes(String(REPAIR.fee - 10)),
  `the dialog does not say how much is missing: "${note}"`,
);
await page.close();

/* ------------------------------------------- 5: a sound fleet is not asked */

const sound = build();
page = await openPage({
  ships: [sound],
  world: seaWorld(sound),
  gold: 5000,
  flag: "barcos:smoke-dock-6",
});
check(
  await page.locator("#dock-dialog").isHidden(),
  "the dock dialog opened with nothing damaged",
);
await page.close();

/* ------------------------------------------- 6: the shipyard, and the saved combat trap */

const yardCaptain = hurtCaptain();
const yardCombat = {
  condition: { ...HURT },
  crew: { ...HURT_CREW },
  pieces: [{ shotsLeft: 25, reloadTimer: 0 }],
};
page = await openPage({
  path: "index.html",
  ships: [yardCaptain],
  gold: 5000,
  combat: yardCombat,
  flag: "barcos:smoke-dock-7",
});
check(
  await page.locator("#dock-dialog").isVisible(),
  "the shipyard did not ask about a damaged fleet on opening",
);
const yardRows = await page.locator("#dock-list .dock-ship").count();
check(yardRows === 1, `the shipyard lists the wrong number of hulls (${yardRows})`);
const purseBefore = await page.locator("#gold-value").textContent();
await page.locator("#dock-list button[data-ship-id]").click();
await page.waitForTimeout(600);

const yard = await fleetOf(page);
check(
  yard.fleet.ships[0].condition.hull === 100,
  `the shipyard did not repair the captain's fleet entry: ${yard.fleet.ships[0].condition.hull}`,
);
check(
  yard.game.gold === 5000 - REPAIR.fee,
  `the shipyard purse was not charged once: gold=${yard.game.gold}`,
);
check(
  yard.game.combat?.player?.condition?.hull === 100,
  `the saved combat of the last voyage still carries the damage: ${JSON.stringify(yard.game.combat?.player?.condition)}`,
);
const purseAfter = await page.locator("#gold-value").textContent();
check(
  purseAfter !== purseBefore && purseAfter.includes(String(5000 - REPAIR.fee)),
  `the displayed purse was not updated ("${purseBefore}" -> "${purseAfter}")`,
);

// and the sea must not undo the repair through its fresher-looking combat save
await page.goto(`${PORT}/sea.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const hudHull = await page.locator("#hud-hull").textContent();
check(hudHull.startsWith("100"), `the sea undid the shipyard repair: HUD hull "${hudHull}"`);
await page.close();

/* ------------------------------------------- 7: both languages */

page = await openPage({
  ships: [hurtCaptain()],
  world: seaWorld(hurtCaptain()),
  gold: 5000,
  locale: "en",
  flag: "barcos:smoke-dock-8",
});
const english = await page.evaluate(() => ({
  title: document.querySelector("#dock-dialog h2")?.textContent.trim() ?? "",
  later: document.querySelector("#dock-later")?.textContent.trim() ?? "",
  row: document.querySelector("#dock-list .dock-ship")?.textContent.replace(/\s+/g, " ").trim() ?? "",
  button: document.querySelector("#dock-list button")?.textContent.trim() ?? "",
}));
check(/repair/i.test(english.title), `the English title is not translated: "${english.title}"`);
check(/Not now/i.test(english.later), `the English close button is not translated: "${english.later}"`);
check(/Hull/i.test(english.row), `the English hull line is not translated: "${english.row}"`);
check(/Crew/i.test(english.row), `the English crew line is not translated: "${english.row}"`);
check(/Repair/i.test(english.button), `the English repair button is not translated: "${english.button}"`);
await page.close();

page = await openPage({
  path: "index.html",
  ships: [hurtCaptain()],
  gold: 5000,
  locale: "en",
  flag: "barcos:smoke-dock-9",
});
const englishYard = await page.evaluate(() => ({
  title: document.querySelector("#dock-dialog h2")?.textContent.trim() ?? "",
  row: document.querySelector("#dock-list .dock-ship")?.textContent.replace(/\s+/g, " ").trim() ?? "",
}));
check(/repair/i.test(englishYard.title), `the English shipyard title is not translated: "${englishYard.title}"`);
check(/Hull/i.test(englishYard.row), `the English shipyard row is not translated: "${englishYard.row}"`);
await page.close();

await browser.close();

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
console.log(JSON.stringify({ rows: rows.length, note, english, failures }, null, 2));
if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("SMOKE OK: the dock dialog asks once per arrival, lists the damage and repairs");
