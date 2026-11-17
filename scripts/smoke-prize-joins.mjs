import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * S139: a captured hull appears as ours at once.
 *
 * User report (verbatim): "cuando un buque enemigo es capturado, aparece en la pantalla
 * como nuestro, ahora no aparece hasta que llega al astillero"
 *
 * The sea seeds one enemy already surrendered next to the captain, so the capture happens
 * in the first seconds of the voyage. The proof is that the fleet gains her AND the live
 * squadron draws her, without reloading the sea.
 */

const captain = {
  ...toRuntimeShip(
    buildShip(
      {
        hullId: "galeon-pequeno",
        batteries: [
          { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 0,
        ballastKg: 3000,
        equipmentKg: 2500,
        reserveKg: 1500,
      },
      12000,
    ),
    { name: "Capitana" },
  ),
  id: "captain",
  yardId: null,
};

// A hostile that has already struck her colours, close enough to be resolved at once.
const encounter = {
  id: 7,
  type: "enemy",
  x: 260,
  y: 90,
  heading: 0,
  hullId: "patache",
  zoneId: "costera",
  drift: { heading: 0, speedKn: 1 },
  combat: {
    status: "surrendered",
    condition: { hull: 40, rigging: 50, crew: 10, morale: 20 },
    crew: { marino: 8, artillero: 2, soldado: 2 },
    initialCrew: 12,
    pieces: [{ pieceId: "minion", side: "babor", ammoId: "bala-hierro", shotsLeft: 4, reloadTimer: 0 }],
  },
};
const world = {
  v: 1, seed: 31, rngState: 31, nextId: 40, gold: 0, timeS: 0,
  ship: { x: 210, y: 70, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  escorts: [],
  encounters: [encounter],
};

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.addInitScript(
  ([fleetJson, worldJson]) => {
    if (localStorage.getItem("barcos:fleet:v1")) return;
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 20000, world: worldJson }));
  },
  [JSON.stringify({ v: 1, captainId: captain.id, ships: [captain] }), JSON.stringify(world)],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
// The sea tops the zone's enemy density up on every tick, so a captured hull is replaced by
// a fresh hostile. The capture is what this smoke watches, not the spawner: read it early.
await page.waitForTimeout(400);

// The sea saves on a three-second timer, so every read flushes it first.
const flush = () =>
  page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));

const fleetIds = () =>
  page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    return saved.ships.map((ship) => ship.id);
  });
const savedEscorts = () =>
  page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const sea = game.world ? JSON.parse(game.world) : null;
    return (sea?.escorts ?? []).map((escort) => escort.id);
  });
const bannerText = () => page.locator("#banner").textContent();

// The fleet gained her...
await flush();
const ids = await fleetIds();
check(ids.length >= 2, `S139: the captured hull must join the fleet, the fleet holds ${ids.length}`);
check(/captur/i.test(await bannerText()), `S139: the capture must be announced, the banner reads "${await bannerText()}"`);

// ...and the live squadron draws her, without a reload.
await flush();
const drawn = await savedEscorts();
check(
  drawn.length >= 1 && drawn.every((id) => ids.includes(id)),
  `S139: the captured hull must sail with the captain at once, the squadron holds ${JSON.stringify(drawn.slice(0, 3))}`,
);
// Every hull in the squadron is a prize of that same captured enemy, which is what the
// player sees: she is ours now. The spawner may have produced more than one capture in the
// window this smoke reads, so the count is a lower bound, not an equality.
check(
  ids.filter((id) => id.startsWith("prize-7-")).length >= 1,
  `S139: the captured hull must be the prize of enemy 7, the fleet holds ${ids.slice(-3).join(", ")}`,
);
check(
  await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return Boolean(game.supplyByHull && Object.keys(game.supplyByHull).length >= 2);
  }),
  "S139: the captured hull must carry her own supply reserve",
);

// She is ours now. The zone's density is topped up by the spawner on every tick, so the
// hostile list keeps its size and the same encounter id can be reused for a NEW sail; what
// this checks is that she left it as a defeated hull and that her prize is in the fleet.
await flush();
const capturedGone = await page.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  const sea = game.world ? JSON.parse(game.world) : null;
  const same = (sea?.encounters ?? []).filter((entry) => entry.id === 7);
  return same.every((entry) => entry.type !== "enemy" || !entry.combat || entry.combat.status === "fighting");
});
check(capturedGone, "S139: the defeated enemy must not stay on the sea as a beaten hull");

check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
await browser.close();

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: a captured hull joins the fleet and the squadron without a reload");
