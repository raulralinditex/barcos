import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke: the Flota tab's avisos follow the repair (needs the local server on 8765).
 *
 * User report (verbatim): "cuando en el tab de flota un buque tiene avisos y le das a
 * reparar, actualizar los avisos". The captain sits at her home yard with too few sailors
 * and ten days of provisions. Repair hires the men and stores the days; the chips must say
 * so, not keep the pre-repair warnings on screen.
 */

const home = "puerto-casa";
const captain = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 8, artillero: 10, soldado: 26 },
      days: 10,
      cargoKg: 6000,
      ballastKg: 3000,
      equipmentKg: 2500,
      reserveKg: 1500,
    },
    12000,
  ),
  { name: "Captain" },
);
captain.condition = { ...captain.condition, hull: 60 };
captain.yardId = home;
const fleet = { v: 1, captainId: captain.id, ships: [captain] };

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
await page.addInitScript(([f]) => {
  if (sessionStorage.getItem("repair-warnings")) return;
  sessionStorage.setItem("repair-warnings", "1");
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", f);
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000 }));
}, [JSON.stringify(fleet)]);
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

await page.click("#fleet-list > *:first-child button, #fleet-list > *:first-child");
await page.waitForTimeout(250);

const before = await page.$eval("#verdict-issues", (el) => el.innerText);
check(before.includes("Faltan marinos"), "before repair: the sailor warning should show");
check(before.includes("10 días de provisión"), "before repair: the provisions warning should show");

await page.click("#fleet-repair-btn");
await page.waitForTimeout(350);

const after = await page.evaluate(() => {
  const ship = JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships[0];
  return {
    verdict: document.querySelector("#verdict-issues")?.innerText ?? "",
    marino: ship.crew.marino,
    days: ship.days,
    hull: ship.condition.hull,
  };
});

check(after.marino >= 25, `repair should hire the sailors, saved crew is ${after.marino}`);
check(after.days >= 25, `repair should stock the provisions, saved days is ${after.days}`);
check(after.hull === 100, `repair should mend the hull, saved hull is ${after.hull}`);
check(!after.verdict.includes("Faltan marinos"), `after repair the chips still say "Faltan marinos": ${after.verdict}`);
check(!after.verdict.includes("10 días de provisión"), `after repair the chips still say "10 días de provisión": ${after.verdict}`);

await browser.close();

if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log(`SMOKE OK: after repair the avisos follow the repaired ship (crew ${after.marino}, days ${after.days}, hull ${after.hull})`);
