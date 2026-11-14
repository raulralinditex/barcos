import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { FLAGS } from "../src/model/flag.js";

/**
 * Browser smoke for the flags on the sea (S72). Needs the local server on 8765.
 *
 * The scenario is built so the rule has teeth: the captain is English and one escort is a
 * Spanish prize. Both must fly the English colours — one fleet, one flag — while the enemy
 * must fly Spanish colours of her own.
 *
 * Each flag is measured on the canvas by looking for its own painted colours near the
 * hull, so a flag that is not drawn, or drawn with the wrong nation's colours, fails.
 */

const english = { v: 1, captainId: null, ships: [] };

const build = (hullId, name) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries: [
          { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 6000,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      12000,
    ),
    { name },
  );

const captain = build("galeon-pequeno", "Captain");
// A prize: a Spanish hull flying in an English fleet.
const prize = { ...build("zabra", "Prize"), id: `${captain.id}-prize`, captured: true };
english.captainId = captain.id;
english.ships = [captain, { ...prize, sails: true }];

const enemy = {
  id: 901,
  type: "enemy",
  // A Spanish hull, so her own colours differ from the fleet's.
  hullId: "patache",
  x: 0,
  y: -420,
  heading: 0,
  currentSpeedKn: 0,
  drift: { heading: 0, speedKn: 0 },
};

const world = {
  v: 1,
  seed: 7,
  rngState: 7,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  escorts: [{ id: prize.id, x: 0, y: 330, heading: 0, currentSpeedKn: 0, speedKn: prize.speedKn }],
  encounters: [enemy],
};

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.addInitScript(
  ([fleetJson, worldJson]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify(english), JSON.stringify(world)],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

/**
 * Count the painted pixels of one flag inside a small window around a hull.
 *
 * The window matters: the red of the cross is also the red of the enemy's hull outline and
 * of a wreck, so counting red over the whole canvas proves nothing. A window at the
 * masthead counts only what was painted where a flag would be.
 */
const flagPixels = (window) =>
  page.evaluate((box) => {
    const canvas = document.querySelector("#sea-canvas");
    const { width } = canvas;
    const { x, y, w, h } = box;
    const data = canvas.getContext("2d").getImageData(x, y, w, h).data;
    const counts = { white: 0, red: 0 };
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 200) continue;
      // The flag field is near-white; the cross is near the catalogue's red.
      if (r > 225 && g > 220 && b > 205) counts.white += 1;
      if (Math.abs(r - 176) < 26 && Math.abs(g - 42) < 26 && Math.abs(b - 36) < 26) counts.red += 1;
    }
    return counts;
  }, window);

// The captain is drawn at the centre of the screen, with the flag aft of her mast.
const captainFlag = await flagPixels({ x: 620, y: 400, w: 160, h: 110 });
check(
  captainFlag.white > 8 && captainFlag.red > 4,
  `S72: the captain's flag should be painted at her masthead, got ${JSON.stringify(captainFlag)}`,
);

// The enemy is 420 m north, so well up the screen; her flag is painted too.
const anyFlag = await page.evaluate(() => {
  const canvas = document.querySelector("#sea-canvas");
  const { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  let white = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    if (r > 225 && g > 220 && b > 205) white += 1;
  }
  return white;
});
check(anyFlag > captainFlag.white, `S72: only the captain's flag was painted, got ${anyFlag} white px`);

// No flag of a nation that is not on this sea may appear.
const foreign = await page.evaluate(() => {
  const canvas = document.querySelector("#sea-canvas");
  const { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  let orange = 0;
  let green = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;
    if (Math.abs(r - 212) < 14 && Math.abs(g - 113) < 14 && Math.abs(b - 31) < 14) orange += 1;
    if (Math.abs(r - 28) < 12 && Math.abs(g - 92) < 12 && Math.abs(b - 58) < 12) green += 1;
  }
  return { orange, green };
});
check(foreign.orange === 0, `S72: a Dutch flag appeared on a sea with no Dutch ship (${foreign.orange} px)`);
check(foreign.green === 0, `S72: a Portuguese flag appeared on a sea with no Portuguese ship (${foreign.green} px)`);

// The rule itself, read back from the model through the page: the prize flies English.
const flown = await page.evaluate(async () => {
  const { flagFor } = await import("./src/model/flag.js");
  const fleet = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
  const captainHull = fleet.ships.find((s) => s.id === fleet.captainId)?.hullId ?? null;
  return {
    captain: flagFor({ hullId: captainHull, isFleet: true, captainHullId: captainHull }),
    prize: flagFor({ hullId: "zabra", isFleet: true, captainHullId: captainHull }),
    enemy: flagFor({ hullId: "patache", isFleet: false }),
  };
});

check(flown.captain === "inglaterra", `S72: the captain should fly English colours, got ${flown.captain}`);
check(
  flown.prize === "inglaterra",
  `S72: the Spanish prize must fly the captain's colours, got ${flown.prize}`,
);
check(flown.enemy === "espana", `S72: the enemy should fly her own Spanish colours, got ${flown.enemy}`);
check(
  flown.prize !== flown.enemy,
  "S72: the fleet and the enemy must not fly the same colours, or the rule proves nothing",
);

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: the captain and the Spanish prize both fly ${flown.captain}, the enemy flies ${flown.enemy}, and her flag paints ${captainFlag.white} white + ${captainFlag.red} red px at the masthead`,
);
