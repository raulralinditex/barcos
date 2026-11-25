import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { SHIPYARDS } from "../src/data/naval-data.js";

/**
 * Browser smoke: clicking a yard's anchor at sea opens that yard on its fleet (needs the local
 * server on 8765).
 *
 * User report (verbatim, Spanish): "cuando entro a un astillero quiere ver el tab de flota
 * abierto, ahora veo el de comprar buque". The sea used to hand the player to the buy room
 * (S109); the captain's own yard should open on her fleet (S154).
 */

const home = SHIPYARDS.find((entry) => entry.home);
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
  { name: "Capitana" },
);
captain.yardId = null;
const fleet = { v: 1, captainId: captain.id, ships: [captain] };
// The captain sits on her home yard's anchor, so the camera is centred on it.
const world = {
  v: 1,
  seed: 7,
  rngState: 7,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: home.x, y: home.y, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  escorts: [],
  encounters: [],
};

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
await page.addInitScript(
  ([f, w]) => {
    if (sessionStorage.getItem("yard-from-sea")) return;
    sessionStorage.setItem("yard-from-sea", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", f);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: w }));
  },
  [JSON.stringify(fleet), JSON.stringify(world)],
);
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const box = await page.evaluate(() => {
  const r = document.querySelector("#sea-canvas").getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2);
await page.waitForURL(/index\.html/, { timeout: 5000 }).catch(() => {});
await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);

const url = page.url();
const panel = await page.evaluate(() => document.querySelector(".screen-panel.is-active")?.dataset.screenPanel ?? null);
check(/index\.html#flota/.test(url), `the anchor must open the yard on her fleet, the page is ${url}`);
check(panel === "flota", `the yard must show the Flota tab, it shows ${panel}`);

await browser.close();

if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log(`SMOKE OK: the anchor opens the yard on the fleet (${url})`);
