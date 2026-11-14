/**
 * Browser smoke for rigging and speed (S89), driven through the sea screen.
 *
 * The rule was declared in the combat model since S5 and nothing applied it: a ship whose
 * sails were shredded still made her full speed, which is what the player reported. The
 * check is the one thing that matters — with the same hull, the same throttle and the same
 * water, a dismasted captain must be slower than a whole one.
 */

import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

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

const browser = await chromium.launch();
const failures = [];
const errors = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

/** Sail straight at full throttle for a while and report the speed reached. */
async function speedWith(rigging, flag) {
  const world = {
    v: 1, seed: 7, rngState: 7, nextId: 900, gold: 0, timeS: 0,
    ship: { x: 2600, y: 2600, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
    escorts: [],
    encounters: [],
  };
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ([fleetJson, gameJson, rig, seed]) => {
      localStorage.setItem(seed, "1");
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", gameJson);
    },
    [
      JSON.stringify({ v: 1, captainId: ship.id, ships: [{ ...ship, condition: { hull: 100, rigging, crew: 100, morale: 100 } }] }),
      JSON.stringify({
        gold: 500,
        world: JSON.stringify(world),
        combat: { player: { condition: { hull: 100, rigging, crew: 100, morale: 100 }, crew: { marino: 34, artillero: 10, soldado: 26 }, pieces: [] } },
      }),
      rigging,
      flag,
    ],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  // Full sail, no turning: hold W for a few seconds of wall clock.
  for (let press = 0; press < 6; press += 1) await page.keyboard.press("w");
  await page.waitForTimeout(4000);
  const hud = await page.locator("#hud-speed").textContent();
  const speed = Number.parseFloat(String(hud).replace(",", "."));
  await page.close();
  return speed;
}

const whole = await speedWith(100, "barcos:smoke-rig-1");
const shredded = await speedWith(0, "barcos:smoke-rig-2");

check(whole > 1, `the captain never got under way with a whole rig (${whole} kn)`);
// The curve combat.js declares is 0.3 + 0.7 * rigging/100, so a dismasted hull keeps 30 %
// of her speed. The threshold sits well inside that: the old behaviour left her at ~33 %
// (the sea's own acceleration lag, with the rule disconnected), so a loose "slower than
// whole" check would pass without the fix and prove nothing.
const share = shredded / whole;
check(
  share <= 0.2,
  `a shredded rig is not paying for it: ${whole} kn whole vs ${shredded} kn shredded (${(share * 100).toFixed(0)} % of her speed, S89 wants about 30 %)`,
);

await browser.close();
if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
console.log(JSON.stringify({ whole, shredded, failures }, null, 2));
if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("SMOKE OK: a shredded rig really does slow the hull");
