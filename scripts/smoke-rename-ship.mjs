import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke: renaming a ship in the yard's panel is saved even when her loadout is not
 * feasible (needs the local server on 8765).
 *
 * User report (verbatim, Spanish): "en el panel buque del astillero en el editor nombre, no me
 * cambia el nombre cuando le pongo otro valor". The captain has too few sailors, so her
 * loadout is not feasible; the name typed must still reach the fleet. The invalid loadout is
 * not saved, and that stays true.
 */

const captain = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 8, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 6000,
      ballastKg: 3000,
      equipmentKg: 2500,
      reserveKg: 1500,
    },
    12000,
  ),
  { name: "Capitana" },
);
captain.yardId = "puerto-casa";
captain.commandId = captain.id;
const fleet = { v: 1, captainId: captain.id, ships: [captain] };

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
await page.addInitScript(
  ([f]) => {
    if (sessionStorage.getItem("rename-ship")) return;
    sessionStorage.setItem("rename-ship", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", f);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000 }));
  },
  [JSON.stringify(fleet)],
);
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

await page.click("#fleet-list > *:first-child button, #fleet-list > *:first-child");
await page.waitForTimeout(250);

await page.fill("#ship-name", "Perla Negra");
await page.keyboard.press("Tab");
await page.waitForTimeout(400);

const saved = await page.evaluate(() => {
  const ship = JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships[0];
  return { name: ship.name, marino: ship.crew.marino };
});
check(saved.name === "Perla Negra", `the new name must be saved even with an infeasible loadout, saved "${saved.name}"`);
check(saved.marino === 8, `the infeasible loadout must not be saved, sailors saved ${saved.marino}`);

const listed = await page.$$eval("#fleet-list > *", (els) => els.map((e) => e.innerText.split("\n")[1]));
check(listed.includes("Perla Negra"), `the fleet list must show the new name, it shows ${JSON.stringify(listed)}`);

await browser.close();

if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log("SMOKE OK: the rename is saved, the infeasible loadout is not");
