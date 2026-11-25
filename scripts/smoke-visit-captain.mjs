import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke: visiting another yard does not keep the captain on screen (needs the local
 * server on 8765).
 *
 * User report (verbatim, Spanish): "cuando en el selector de astillero, voy de visita a otro
 * astillero, sigo viendo la capitana en todos los astilleros, cuando solo la debería de ver en
 * uno, en el que está físicamente". The captain sits at puerto-casa. Visiting ensenada-abierta
 * must not leave her name and loadout in the rig editor.
 */

const mk = (name) =>
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
        cargoKg: 6000,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      12000,
    ),
    { name },
  );

const captain = mk("Capitana");
captain.yardId = "puerto-casa";
captain.commandId = captain.id;
const fleet = { v: 1, captainId: captain.id, ships: [captain] };

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
await page.addInitScript(([f]) => {
  if (sessionStorage.getItem("visit-captain")) return;
  sessionStorage.setItem("visit-captain", "1");
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", f);
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000 }));
}, [JSON.stringify(fleet)]);
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const homeName = await page.$eval("#ship-name", (el) => el.value);
check(homeName === "Capitana", `at home the editor should hold the captain, shows "${homeName}"`);

await page.selectOption("#yard-select", "ensenada-abierta");
await page.waitForTimeout(350);

const visitName = await page.$eval("#ship-name", (el) => el.value);
check(visitName !== "Capitana", `visiting another yard must not keep the captain's name in the editor: "${visitName}"`);

await browser.close();

if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log("SMOKE OK: visiting another yard leaves the captain out of the rig editor");
