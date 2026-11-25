import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke: the Carga of a ship already in the fleet shows what she has left at sea,
 * the same number the sea shows, and cannot be edited there (needs the local server on 8765).
 *
 * User report (verbatim, Spanish): "sobre el valor de suministros, debe de ser el mismo que
 * vemos en el mar". The captain bought with 45 days has burned down to 30 at sea; the
 * shipyard must show 30, read-only, because restocking is the Repair button's job.
 */

const captain = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
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
  { name: "Captain" },
);
captain.yardId = "puerto-casa";
const fleet = { v: 1, captainId: captain.id, ships: [captain] };
// 30 game days left at sea, 100 seconds per game day.
const burnedSeconds = 30 * 100;

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
await page.addInitScript(
  ([f, seconds, id]) => {
    if (sessionStorage.getItem("supply-sea")) return;
    sessionStorage.setItem("supply-sea", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", f);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, supplyByHull: { [id]: seconds } }));
  },
  [JSON.stringify(fleet), burnedSeconds, captain.id],
);
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

await page.click("#fleet-list > *:first-child button, #fleet-list > *:first-child");
await page.waitForTimeout(250);
await page.click('.tab[data-tab="supply"]');
await page.waitForTimeout(150);

const days = await page.$eval("#supply-list input[data-supply=days]", (el) => ({
  value: el.value,
  disabled: el.disabled,
}));
check(days.value === "30", `the shipyard should show the sea's 30 days, shows ${days.value}`);
check(days.disabled === true, "a ship already in the fleet must not edit her days at the shipyard");

await browser.close();

if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log(`SMOKE OK: the shipyard shows the sea's ${days.value} days, read-only for a ship in the fleet`);
