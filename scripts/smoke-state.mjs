import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { REPAIR } from "../src/model/repair.js";
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
const costText = await page.locator("#port-cost").textContent();
check(
  costText.includes(String(REPAIR.fee)),
  `the panel does not show the flat fee ${REPAIR.fee}: "${costText}"`,
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
  afterRepair.gold === 5000 - REPAIR.fee,
  `the flat fee was not charged: gold=${afterRepair.gold}`,
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

/* ---------------------------------------------------------------- 7: no gold, no repair */

const poor = build();
poor.condition = { hull: 30, rigging: 30, crew: 30, morale: 30 };
page = await newSea({ ship: poor, world: seaWorld(poor), gold: 10 });
await page.keyboard.press("r");
await page.waitForTimeout(400);
const poorResult = await page.evaluate(() => {
  const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return { hull: fleet.ships[0].condition.hull, gold: game.gold };
});
check(poorResult.hull === 30, `a repair happened without paying (hull=${poorResult.hull})`);
check(poorResult.gold === 10, `gold was taken without a repair (gold=${poorResult.gold})`);
const shortBanner = await page.locator("#banner").textContent();
check(/doblones/i.test(shortBanner), `the player was not told the price: "${shortBanner}"`);
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
console.log("SMOKE OK: state bars follow the hulls, repair works only in port for a flat fee");
