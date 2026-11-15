import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { repairCost } from "../src/model/repair.js";

/**
 * Browser smoke for repairing a fleet, driven through the UI only.
 *
 * The rule changed with S86: arriving at the home port no longer repairs anything or
 * spends a doublón, and the shipyard no longer asks. Repairing is a button on each fleet
 * entry, and this smoke pins both halves of that:
 *
 *   - arriving saves and opens the shipyard, with the damage and the purse untouched;
 *   - the button on a fleet entry repairs that hull, charges once, and patches the saved
 *     combat of the last voyage so the sea does not undo it on boot.
 *
 * The sea's own repair in port (the R key, S22/S24) is a different offer and is pinned
 * here too, because it must keep working.
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

/**
 * The repair button for one hull, as the player sees it (S108): she picks the hull from
 * the list, and the panel under it carries the repair and sell actions.
 */
async function repairButton(page, shipId) {
  await page.locator(`.fleet-item[data-ship-id="${shipId}"] [data-refit]`).click();
  return page.locator("#fleet-repair-btn");
}

async function sailIn(page) {
  for (let press = 0; press < 4; press += 1) await page.keyboard.press("w");
  await page.waitForURL("**/index.html*", { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  // Arriving opens the buy room (S109); the fleet list lives in hers (S105).
  await page.click('.screen-tab[data-screen="flota"]');
  await page.waitForTimeout(200);
}

/* ------------------------------------------- 1: arriving repairs nothing and costs nothing */

const captain = hurtCaptain();
let page = await openPage({
  ships: [captain], world: seaWorld(captain, { x: 115, heading: Math.PI }),
  gold: 5000, flag: "barcos:smoke-dock-1",
});
check(await page.locator("#dock-dialog").count() === 0, "sea still contains a dock dialog");
await sailIn(page);
let saved = await fleetOf(page);
check(
  saved.game.gold === 5000,
  `arriving charged the purse (${saved.game.gold}, expected 5000): repair is manual now (S86)`,
);
check(
  saved.fleet.ships[0].condition.hull === 42,
  `arriving repaired the captain (${saved.fleet.ships[0].condition.hull}): repair is manual now (S86)`,
);
check(
  await page.locator("#dock-dialog").isHidden(),
  "the shipyard opened the repair dialog by itself: repairing is the player's decision (S86)",
);
await page.close();

/* ------------------------------------------- 2: the button repairs the hull the player picks */

const lead = hurtCaptain();
const escort = hurtCaptain();
escort.name = "Escort";
const leadCost = repairCost(lead);
page = await openPage({
  path: "index.html", ships: [lead, escort], gold: 5000, flag: "barcos:smoke-dock-2",
});
// The flota room owns the fleet strip now (S105).
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(150);
const leadButton = await repairButton(page, lead.id);
check(await leadButton.count() === 1, "the captain has no repair button in the fleet panel");
check(await leadButton.isEnabled(), "a damaged captain's repair button is disabled");
const purseBefore = await page.locator("#gold-value").textContent();
await leadButton.click();
await page.waitForTimeout(600);

saved = await fleetOf(page);
check(
  saved.fleet.ships[0].condition.hull === 100,
  `the button did not repair the captain's fleet entry: ${saved.fleet.ships[0].condition.hull}`,
);
check(
  saved.fleet.ships[1].condition.hull === HURT.hull,
  `repairing one hull repaired another: escort at ${saved.fleet.ships[1].condition.hull}`,
);
check(
  saved.game.gold === 5000 - leadCost,
  `the purse was not charged once: gold=${saved.game.gold}, expected ${5000 - leadCost}`,
);
const purseAfter = await page.locator("#gold-value").textContent();
check(
  purseAfter !== purseBefore && purseAfter.includes(String(5000 - leadCost)),
  `the displayed purse was not updated ("${purseBefore}" -> "${purseAfter}")`,
);
check(
  await (await repairButton(page, lead.id)).isDisabled(),
  "a sound hull still offers a repair",
);

// The sea must not undo the repair through its fresher-looking combat save.
await page.goto(`${PORT}/sea.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const hudHull = await page.locator("#hud-hull").textContent();
check(hudHull.startsWith("100"), `the sea undid the shipyard repair: HUD hull "${hudHull}"`);
await page.close();

/* ------------------------------------------- 3: a short purse buys part of the repair */

const poorCaptain = hurtCaptain();
page = await openPage({
  path: "index.html", ships: [poorCaptain], gold: 10, flag: "barcos:smoke-dock-3",
});
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(150);
const poorButton = await repairButton(page, poorCaptain.id);
check(await poorButton.isEnabled(), "the repair button is disabled with a short but non-empty purse");
await poorButton.click();
await page.waitForTimeout(500);
saved = await fleetOf(page);
const partialHull = HURT.hull + ((100 - HURT.hull) * 10) / repairCost(poorCaptain);
check(
  Math.abs(saved.fleet.ships[0].condition.hull - partialHull) < 1e-9,
  `the short purse did not buy a proportional repair: ${saved.fleet.ships[0].condition.hull} vs ${partialHull}`,
);
check(saved.game.gold === 0, `the short purse was not exhausted: ${saved.game.gold}`);
// With an empty purse the button stays clickable on purpose: the model refuses and
// nothing is charged, so the player sees why instead of a dead control.
await (await repairButton(page, poorCaptain.id)).click();
await page.waitForTimeout(300);
const afterEmpty = await fleetOf(page);
check(afterEmpty.game.gold === 0, "an empty purse was charged by a second click");
check(
  Math.abs(afterEmpty.fleet.ships[0].condition.hull - partialHull) < 1e-9,
  "a second click with an empty purse repaired more than the purse could pay for",
);
await page.close();

/* ------------------------------------------- 4: the sea's own repair in port still works */

// This is a different offer from the arrival: the R key inside the port (S22/S24). It
// must keep working, so it is pinned here.
const stale = hurtCaptain();
stale.condition = { hull: 80, rigging: 61, crew: 57, morale: 70 };
const live = { ...HURT, crew: 57 };
const liveCombat = {
  condition: { ...live },
  crew: { ...HURT_CREW },
  pieces: [{ shotsLeft: 25, reloadTimer: 0 }],
};
page = await openPage({
  ships: [stale], world: seaWorld(stale), gold: 10, combat: liveCombat,
  flag: "barcos:smoke-dock-4",
});
const cost = repairCost({ ...stale, condition: live });
const panel = await page.locator("#port-cost").textContent();
const share = ((100 * 10) / cost).toFixed(1).replace(".", ",");
check(
  panel.includes("10 doblones") && panel.includes(`${share} %`),
  `the port quote ignores the live damage: "${panel}"`,
);
await page.keyboard.press("r");
await page.waitForTimeout(500);
saved = await fleetOf(page);
const expectedHull = live.hull + ((100 - live.hull) * 10) / cost;
const expectedCrew = live.crew + ((100 - live.crew) * 10) / cost;
check(
  Math.abs(saved.fleet.ships[0].condition.hull - expectedHull) < 1e-9,
  `the port repair ignored the live hull: ${saved.fleet.ships[0].condition.hull}`,
);
check(
  Math.abs(saved.fleet.ships[0].condition.crew - expectedCrew) < 1e-9,
  `the port repair got the crew wrong: ${saved.fleet.ships[0].condition.crew}`,
);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(500);
const reloaded = await page.evaluate(() => {
  window.dispatchEvent(new Event("beforeunload"));
  return JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships[0].condition;
});
check(
  Math.abs(reloaded.crew - expectedCrew) < 1e-9,
  `the partial crew was lost on reload: ${reloaded.crew}`,
);
await page.close();

/* ------------------------------------------- 5: both languages on the repair button */

const englishCaptain = hurtCaptain();
page = await openPage({
  path: "index.html", ships: [englishCaptain], gold: 5000, locale: "en",
  flag: "barcos:smoke-dock-5",
});
// S108: the repair action lives in the panel under the list, for the picked hull.
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(150);
await page.locator(`.fleet-item[data-ship-id="${englishCaptain.id}"] [data-refit]`).click();
const english = await page.evaluate(() => ({
  button: document.querySelector("#fleet-repair-btn")?.textContent.trim() ?? "",
  title: document.querySelector("#fleet-repair-btn")?.title ?? "",
  dialog: document.querySelector("#dock-dialog")?.classList.contains("is-hidden"),
}));
check(/repair/i.test(english.button), `the English repair button is not translated: "${english.button}"`);
check(/doubloons/i.test(english.title), `the English repair title is not translated: "${english.title}"`);
check(english.dialog === true, "the English shipyard opened the repair dialog by itself");
await page.close();

await browser.close();

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
console.log(JSON.stringify({ english, failures }, null, 2));
if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("SMOKE OK: arriving repairs nothing, and the fleet button repairs the hull the player picks");
