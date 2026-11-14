import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { repairCost } from "../src/model/repair.js";
import { createEnemyCombatant } from "../src/model/combat.js";

/**
 * Browser smoke for the floating state bars (S21) and the repair at the home port
 * (S22), driven through the UI only.
 *
 * Bars: the player's hull always carries them, an enemy only inside the gunshot
 * radius, and firing a beam moves the reload and the damage bars.
 *
 * Repair: it only happens in the home port, it charges the flat fee, it restores
 * hull/rigging/crew, and the damage lives on the fleet entry so it survives a
 * reload of the page.
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

const seaWorld = (ship, encounters = []) => ({
  v: 1,
  seed: 424242,
  rngState: 424242,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  encounters,
});

async function newSea({ ship, world, gold = 5000, locale = "es" } = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([shipJson, worldJson, purse, lang]) => {
      // The seed must survive a reload of the same page: re-seeding on every
      // navigation would hide exactly what this smoke is checking.
      if (localStorage.getItem("barcos:smoke-seeded") === "1") return;
      localStorage.setItem("barcos:smoke-seeded", "1");
      localStorage.setItem("barcos:lang:v1", lang);
      // S47: these checks are about firing by hand (Q/E) and about the bars, so the automatic fire stays off.
      localStorage.setItem("barcos:autofire:v1", "0");
      const s = JSON.parse(shipJson);
      localStorage.setItem(
        "barcos:fleet:v1",
        JSON.stringify({ v: 1, ships: [s], captainId: s.id }),
      );
      localStorage.setItem(
        "barcos:game:v1",
        JSON.stringify({ gold: purse, world: worldJson }),
      );
    },
    [JSON.stringify(ship), JSON.stringify(world), gold, locale],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  return page;
}

/**
 * Pixels in a box painted with the floating-bar palette. The sea itself is opaque,
 * so counting alpha would count everything: the bars are recognised by their own
 * colours (condition, ready, reload).
 */
const PALETTE = {
  hull: [161, 60, 44],
  rigging: [61, 111, 168],
  crew: [47, 107, 71],
  ready: [224, 168, 21],
  reload: [159, 199, 232],
};
const barPixels = (page, box, only = Object.keys(PALETTE)) =>
  page.evaluate(({ x, y, w, h, colors }) => {
    const canvas = document.querySelector("#sea-canvas");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const data = ctx.getImageData(x * dpr, y * dpr, w * dpr, h * dpr).data;
    const palette = colors;
    let painted = 0;
    for (let i = 0; i < data.length; i += 4) {
      for (const [r, g, b] of palette) {
        if (
          Math.abs(data[i] - r) < 12 &&
          Math.abs(data[i + 1] - g) < 12 &&
          Math.abs(data[i + 2] - b) < 12
        ) {
          painted += 1;
          break;
        }
      }
    }
    return painted;
  }, { ...box, colors: only.map((name) => PALETTE[name]) });

/**
 * Length in px of the longest horizontal run of one bar colour. A bar is a long
 * flat rectangle, while the same yellow also paints tracers and gold glints as
 * thin lines, so counting pixels would count the shooting as well.
 */
const barRun = (page, box, name) =>
  page.evaluate(({ x, y, w, h, color }) => {
    const canvas = document.querySelector("#sea-canvas");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(w * dpr);
    const data = ctx.getImageData(x * dpr, y * dpr, width, Math.round(h * dpr)).data;
    const near = (i) =>
      Math.abs(data[i] - color[0]) < 12 &&
      Math.abs(data[i + 1] - color[1]) < 12 &&
      Math.abs(data[i + 2] - color[2]) < 12;
    let best = 0;
    for (let row = 0; row < data.length / 4 / width; row += 1) {
      let run = 0;
      for (let col = 0; col < width; col += 1) {
        run = near((row * width + col) * 4) ? run + 1 : 0;
        if (run > best) best = run;
      }
    }
    return best / dpr;
  }, { ...box, color: PALETTE[name] });

const viewport = { width: 1400, height: 900 };

/**
 * The bars now sit around the hull: condition astern and one block on each beam.
 * The window covers a square around the ship so all three zones are measured.
 */
const around = (x, y, reach = 110) => ({
  x: Math.round(x) - reach,
  y: Math.round(y) - reach,
  w: reach * 2,
  h: reach * 2,
});
const centre = { x: viewport.width / 2, y: viewport.height / 2 };
const playerBox = around(centre.x, centre.y);

/* ---------------------------------------------------------------- 1: the player's bars */

const sound = build();
let page = await newSea({ ship: sound, world: seaWorld(sound) });
const paintedSound = await barPixels(page, playerBox);
check(paintedSound > 800, `the player's bars are missing (${paintedSound} painted px)`);

// the condition block sits astern of a hull that points east, not above her
const asternBox = around(centre.x - 85, centre.y, 40);
const paintedAstern = await barPixels(page, asternBox);
check(paintedAstern > 200, `the condition bars are not astern (${paintedAstern} painted px)`);

// and the two beams are on her sides, not in the same stack
const portBox = around(centre.x, centre.y - 39, 40);
const starboardBox = around(centre.x, centre.y + 39, 40);
const paintedPort = await barPixels(page, portBox);
const paintedStarboard = await barPixels(page, starboardBox);
check(paintedPort > 200, `the port beam bars are missing (${paintedPort} painted px)`);
check(paintedStarboard > 200, `the starboard beam bars are missing (${paintedStarboard} painted px)`);
await page.close();

/* ---------------------------------------------------------------- 2: an enemy in gunshot */

const enemyNear = {
  id: 901,
  type: "enemy",
  // on the starboard beam: a hull dead ahead bears no broadside at all
  x: 0,
  y: 300,
  hullId: "patache",
  zoneId: "costera",
  drift: { heading: 0, speedKn: 2 },
};
// A player with heavy guns against a coastal patache: the damage bars share one
// scale, so the patache's bar must be a fraction of the player's, not equally full.
const strong = build({
  batteries: [
    { pieceId: "media-culebrina-9", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    { pieceId: "media-culebrina-9", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
  ],
});
// The enemy arrives with every gun loaded, so the check does not depend on when its
// random reload clocks happen to run out.
const loadedEnemy = {
  ...enemyNear,
  heading: 0,
  combat: createEnemyCombatant(enemyNear, { id: "costera" }, 424242),
};
for (const piece of loadedEnemy.combat.pieces) piece.reloadTimer = 0;
page = await newSea({ ship: strong, world: seaWorld(strong, [loadedEnemy]) });
await page.waitForTimeout(500);

const enemyScreen = around(centre.x, centre.y + 300 * 0.4);
const paintedEnemy = await barPixels(page, enemyScreen);
check(paintedEnemy > 800, `the enemy's bars are missing inside gunshot (${paintedEnemy} painted px)`);

const readyPlayer = await barRun(page, playerBox, "ready");
// a tight window: the player's own full bar is only ~120 px away and must not be read
const readyEnemy = await barRun(page, around(centre.x, centre.y + 300 * 0.4, 60), "ready");
check(readyPlayer >= 40, `the heavy player's damage bar is not full (${readyPlayer} px)`);
check(readyEnemy >= 4, `the enemy's damage bar is empty (${readyEnemy} px)`);
check(
  readyEnemy < readyPlayer * 0.25,
  `the damage bars do not share a scale: a weak patache fills as much as a heavy player (player=${readyPlayer} enemy=${readyEnemy} px)`,
);
await page.close();

/* ---------------------------------------------------------------- 3: an enemy out of gunshot */

const enemyFar = { ...enemyNear, id: 902, x: 0, y: 1500 };
page = await newSea({ ship: sound, world: seaWorld(sound, [enemyFar]) });
await page.waitForTimeout(500);

const farScreen = around(centre.x, viewport.height / 2 + 1500 * 0.4);
const paintedFar = await barPixels(page, farScreen);
check(paintedFar === 0, `a distant enemy showed its bars (${paintedFar} painted px)`);
await page.close();

/* ---------------------------------------------------------------- 4: firing moves the bars */

page = await newSea({ ship: sound, world: seaWorld(sound, [enemyNear]) });
await page.waitForTimeout(500);
const beforeFire = await barPixels(page, playerBox);
await page.keyboard.press("e");
await page.waitForTimeout(400);
const afterFire = await barPixels(page, playerBox);
check(
  beforeFire !== afterFire,
  `firing did not change the bars (before=${beforeFire} after=${afterFire})`,
);
await page.close();

/* ---------------------------------------------------------------- 5: repair away from port */

const hurt = build();
hurt.condition = { hull: 40, rigging: 55, crew: 60, morale: 50 };
hurt.crewAlive = { marino: 20, artillero: 6, soldado: 16 };
const awayWorld = seaWorld(hurt);
awayWorld.ship.x = 900;
awayWorld.ship.y = 0;

page = await newSea({ ship: hurt, world: awayWorld, gold: 5000 });
const portHiddenAway = await page.locator("#port-panel").isHidden();
check(portHiddenAway, "the repair panel showed outside the home port");

await page.keyboard.press("r");
await page.waitForTimeout(400);
const stillHurt = await page.evaluate(() => {
  const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
  return fleet.ships[0].condition.hull;
});
check(stillHurt === 40, `a repair happened away from port (hull=${stillHurt})`);
const bannerAway = await page.locator("#banner").textContent();
check(/puerto/i.test(bannerAway), `the player was not told to go back to port: "${bannerAway}"`);
await page.close();

/* ---------------------------------------------------------------- 6: repair in port */

page = await newSea({ ship: hurt, world: seaWorld(hurt), gold: 5000 });
const portShown = await page.locator("#port-panel").isVisible();
check(portShown, "the repair panel is hidden while docked");
const expectedCost = repairCost(hurt);
const costText = await page.locator("#port-cost").textContent();
check(
  costText.includes(String(expectedCost)),
  `the panel does not show the repair cost ${expectedCost}: "${costText}"`,
);

await page.keyboard.press("r");
await page.waitForTimeout(500);

const afterRepair = await page.evaluate(() => {
  const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return {
    condition: fleet.ships[0].condition,
    crewAlive: fleet.ships[0].crewAlive,
    gold: game.gold,
  };
});
check(afterRepair.condition.hull === 100, `hull not repaired: ${afterRepair.condition.hull}`);
check(
  afterRepair.condition.rigging === 100,
  `rigging not repaired: ${afterRepair.condition.rigging}`,
);
check(afterRepair.condition.crew === 100, `crew not repaired: ${afterRepair.condition.crew}`);
check(
  afterRepair.crewAlive.marino === 34,
  `the crew was not brought back to its complement: ${JSON.stringify(afterRepair.crewAlive)}`,
);
check(
  afterRepair.gold === 5000 - expectedCost,
  `the repair cost was not charged: gold=${afterRepair.gold}, expected ${5000 - expectedCost}`,
);

const hudHull = await page.locator("#hud-hull").textContent();
check(hudHull.startsWith("100"), `the HUD still shows damage: "${hudHull}"`);

// the same hull reloaded must still be repaired: the condition lives on the ship
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
const afterReload = await page.evaluate(() => {
  const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
  return fleet.ships[0].condition.hull;
});
check(afterReload === 100, `the repair was lost on reload (hull=${afterReload})`);
await page.close();

/* ---------------------------------------------------------------- 7: a short purse buys a partial captain repair */

const poor = build();
poor.condition = { hull: 30, rigging: 30, crew: 30, morale: 30 };
page = await newSea({ ship: poor, world: seaWorld(poor), gold: 10 });
const captainOffer = await page.locator("#port-cost").textContent();
check(/parcial/i.test(captainOffer) && /%/.test(captainOffer), `missing partial offer: "${captainOffer}"`);
await page.keyboard.press("r");
await page.waitForTimeout(400);
const poorResult = await page.evaluate(() => {
  const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return { hull: fleet.ships[0].condition.hull, gold: game.gold };
});
check(Math.abs(poorResult.hull - (30 + 70 * 10 / repairCost(poor))) < 1e-9, `wrong partial hull: ${poorResult.hull}`);
check(poorResult.gold === 0, `the partial repair did not spend the purse (gold=${poorResult.gold})`);
const shortBanner = await page.locator("#banner").textContent();
check(/parcial/i.test(shortBanner) && /10 doblones/i.test(shortBanner), `missing partial price: "${shortBanner}"`);
await page.close();

/* ---------------------------------------------------------------- 8: an undamaged hull pays nothing */

page = await newSea({ ship: sound, world: seaWorld(sound), gold: 5000 });
await page.keyboard.press("r");
await page.waitForTimeout(400);
const soundResult = await page.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return game.gold;
});
check(soundResult === 5000, `an undamaged hull was charged (gold=${soundResult})`);
await page.close();

/* ---------------------------------------------------------------- 9: the rest of the fleet repairs too */

/**
 * The port list (S24): a captain plus a second hull. The seed flag keeps a reload
 * from re-seeding, so the repair can be checked across a page reload.
 */
async function newSeaFleet({ ships, gold = 5000, locale = "es" } = {}) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([shipsJson, purse, lang, worldJson]) => {
      if (localStorage.getItem("barcos:smoke-seeded-fleet") === "1") return;
      localStorage.setItem("barcos:smoke-seeded-fleet", "1");
      localStorage.setItem("barcos:lang:v1", lang);
      // S47: these checks are about firing by hand (Q/E) and about the bars, so the automatic fire stays off.
      localStorage.setItem("barcos:autofire:v1", "0");
      const list = JSON.parse(shipsJson);
      localStorage.setItem(
        "barcos:fleet:v1",
        JSON.stringify({ v: 1, ships: list, captainId: list[0].id }),
      );
      localStorage.setItem(
        "barcos:game:v1",
        JSON.stringify({ gold: purse, world: worldJson }),
      );
    },
    [JSON.stringify(ships), gold, locale, JSON.stringify(seaWorld(ships[0]))],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  return page;
}

const captain = build();
captain.condition = { hull: 80, rigging: 100, crew: 100, morale: 100 };
const second = build();
second.id = `${second.id}-consort`;
second.name = "Consort";
second.condition = { hull: 35, rigging: 60, crew: 70, morale: 55 };
second.crewAlive = { marino: 24, artillero: 7, soldado: 18 };

page = await newSeaFleet({ ships: [captain, second], gold: 5000 });
const listed = await page.evaluate(() => {
  const buttons = [...document.querySelectorAll("#port-panel button[data-ship-id]")];
  return buttons.map((b) => ({
    id: b.dataset.shipId,
    text: b.textContent.trim(),
    row: b.closest(".port-ship")?.textContent.replace(/\s+/g, " ").trim() ?? "",
  }));
});
check(listed.length === 1, `the damaged fleet ship is not listed alone (${JSON.stringify(listed)})`);
check(
  listed[0]?.id === second.id,
  `the wrong ship is listed: ${JSON.stringify(listed)}`,
);
check(
  listed[0]?.text.includes(String(repairCost(second))),
  `the fleet button does not show the repair cost: "${listed[0]?.text}"`,
);
check(
  /Reparar/i.test(listed[0]?.text ?? ""),
  `the fleet button is not labelled in Spanish: "${listed[0]?.text}"`,
);
check(
  listed[0]?.row.includes("35"),
  `the fleet row does not show the hull percentage: "${listed[0]?.row}"`,
);
check(
  listed[0]?.row.includes("Consort"),
  `the fleet row does not show the ship name: "${listed[0]?.row}"`,
);

await page.locator(`#port-panel button[data-ship-id="${second.id}"]`).click();
await page.waitForTimeout(500);

const fleetAfter = await page.evaluate(
  ([captainId, secondId]) => {
    const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const of = (id) => fleet.ships.find((s) => s.id === id);
    return {
      second: of(secondId),
      captain: of(captainId),
      gold: game.gold,
      captainId: fleet.captainId,
    };
  },
  [captain.id, second.id],
);
check(fleetAfter.second.condition.hull === 100, `the fleet ship was not repaired: hull=${fleetAfter.second.condition.hull}`);
check(fleetAfter.second.condition.rigging === 100, `the rigging was not repaired: ${fleetAfter.second.condition.rigging}`);
check(
  fleetAfter.second.crewAlive.marino === second.crew.marino,
  `the fleet ship's crew was not brought back: ${JSON.stringify(fleetAfter.second.crewAlive)}`,
);
check(
  fleetAfter.gold === 5000 - repairCost(second),
  `the repair cost was not charged exactly once: gold=${fleetAfter.gold}`,
);
check(
  fleetAfter.captain.condition.hull === 80,
  `repairing a fleet ship touched the captain: hull=${fleetAfter.captain.condition.hull}`,
);
check(fleetAfter.captainId === captain.id, "the captain changed");
const listedAfter = await page.locator("#port-panel button[data-ship-id]").count();
check(listedAfter === 0, `a repaired ship is still listed (${listedAfter} buttons)`);
const fleetBanner = await page.locator("#banner").textContent();
check(/Consort/.test(fleetBanner), `the player was not told which ship was repaired: "${fleetBanner}"`);

// the repair lives on the fleet entry, so it survives a reload
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
const reloadedHull = await page.evaluate((id) => {
  const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
  return fleet.ships.find((s) => s.id === id)?.condition.hull;
}, second.id);
check(reloadedHull === 100, `the fleet repair was lost on reload (hull=${reloadedHull})`);
await page.close();

/* ---------------------------------------------------------------- 10: a sound fleet ship is not offered */

const soundSecond = build();
soundSecond.id = `${soundSecond.id}-sound`;
page = await newSeaFleet({ ships: [captain, soundSecond], gold: 5000 });
const soundListed = await page.locator("#port-panel button[data-ship-id]").count();
check(soundListed === 0, `a sound fleet ship is offered for repair (${soundListed} buttons)`);
await page.close();

/* ---------------------------------------------------------------- 11: partial repair of a sailing escort */

const poorSecond = build();
poorSecond.id = `${poorSecond.id}-poor`;
poorSecond.condition = { hull: 20, rigging: 40, crew: 70, morale: 50 };
poorSecond.crewAlive = { marino: 20, artillero: 6, soldado: 14 };
page = await newSeaFleet({ ships: [captain, poorSecond], gold: 10 });
const poorFleetButton = page.locator(`#port-panel button[data-ship-id="${poorSecond.id}"]`);
const fleetOffer = await poorFleetButton.textContent();
check(await poorFleetButton.isEnabled() && /parcial/i.test(fleetOffer) && /%/.test(fleetOffer), `missing fleet partial offer: "${fleetOffer}"`);
await poorFleetButton.click();
await page.waitForTimeout(500);
const poorFleet = await page.evaluate(
  ([id, captainId]) => {
    const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return {
      hull: fleet.ships.find((s) => s.id === id).condition.hull,
      captainHull: fleet.ships.find((s) => s.id === captainId).condition.hull,
      gold: game.gold,
      escort: game.combat?.escorts?.[id],
    };
  },
  [poorSecond.id, captain.id],
);
const partialHull = 20 + 80 * 10 / repairCost(poorSecond);
check(Math.abs(poorFleet.hull - partialHull) < 1e-9, `wrong fleet partial hull: ${poorFleet.hull}`);
check(poorFleet.gold === 0, `the fleet repair did not spend the purse (gold=${poorFleet.gold})`);
check(poorFleet.captainHull === 80, `the captain changed: ${poorFleet.captainHull}`);
check(Math.abs(poorFleet.escort?.condition.hull - partialHull) < 1e-9, `live escort not repaired: ${JSON.stringify(poorFleet.escort)}`);
const poorBanner = await page.locator("#banner").textContent();
check(/parcial/i.test(poorBanner) && /10 doblones/i.test(poorBanner), `missing partial fleet price: "${poorBanner}"`);
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(700);
const escortReload = await page.evaluate((id) => JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.find((ship) => ship.id === id)?.condition.hull, poorSecond.id);
check(Math.abs(escortReload - partialHull) < 1e-9, `escort repair lost after reload: ${escortReload}`);
await page.close();

/* ---------------------------------------------------------------- 12: zero gold blocks repair */
page = await newSeaFleet({ ships: [captain, poorSecond], gold: 0 });
const emptyButton = page.locator(`#port-panel button[data-ship-id="${poorSecond.id}"]`);
check(await emptyButton.isDisabled(), "zero gold must disable the fleet repair");
await page.keyboard.press("r");
await page.waitForTimeout(400);
const emptyResult = await page.evaluate(() => ({
  fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")),
  gold: JSON.parse(localStorage.getItem("barcos:game:v1")).gold,
}));
check(emptyResult.gold === 0 && emptyResult.fleet.ships[0].condition.hull === 80, "zero gold repaired the captain or changed the purse");
await page.close();

await browser.close();

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
console.log(
  JSON.stringify(
    { paintedSound, readyPlayer, readyEnemy, paintedAstern, paintedPort, paintedStarboard, paintedEnemy, paintedFar, failures },
    null,
    2,
  ),
);
if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("SMOKE OK: state bars follow the hulls, repair works only in port and is charged by damage");
