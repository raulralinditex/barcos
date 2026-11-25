import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke: a yard shows only the ships moored at it, even while her captain sails
 * (needs the local server on 8765).
 *
 * User report (verbatim, Spanish): "tengo la flota en el mar, clicleo en astillero, y veo la
 * flota que tengo en el mar". The captain and her escort sail; another hull is moored at
 * ensenada-abierta. Entering puerto-casa must list none of them.
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
captain.yardId = null;
captain.commandId = captain.id;
const escort = mk("EscoltaMar");
escort.yardId = null;
escort.commandId = captain.id;
const moored = mk("EnEnsenada");
moored.yardId = "ensenada-abierta";
moored.commandId = moored.id;
const fleet = { v: 1, captainId: captain.id, ships: [captain, escort, moored] };

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
await page.addInitScript(
  ([f]) => {
    if (sessionStorage.getItem("sea-fleet-yard")) return;
    sessionStorage.setItem("sea-fleet-yard", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", f);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000 }));
  },
  [JSON.stringify(fleet)],
);
// The entry the sea writes when a yard is clicked (S163-A): the captain is at sea.
await page.goto("http://localhost:8765/index.html#flota:puerto-casa", { waitUntil: "networkidle" });
await page.waitForTimeout(400);

const listed = await page.$$eval("#fleet-list > *", (els) => els.map((e) => e.innerText));
const names = listed.join(" | ");
check(!/Capitana|EscoltaMar|EnEnsenada/.test(names), `the yard must list only the ships moored at it, it lists: ${JSON.stringify(listed)}`);

// Nothing is moored here while the fleet exists: the list says so, not the first-ship hint.
const emptyNote = await page.$eval(".fleet-empty", (el) => el.textContent.trim()).catch(() => null);
check(emptyNote === "Ninguna nave atracada aquí.", `an empty yard must say no ship is moored here, it says "${emptyNote}"`);

await browser.close();

if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log("SMOKE OK: a yard lists only the ships moored at it while the captain sails");
