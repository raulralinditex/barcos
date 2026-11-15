import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for the fleet sailing in formation (S35, S36), driven through the UI.
 *
 * The claims that matter and cannot be checked from a screenshot:
 *   - a hull whose check is off stays in port; the marked ones put to sea;
 *   - the escorts actually follow the captain, they do not sit at the harbour mouth;
 *   - an escort is a real target and a real gun: it can be hit, and it can be lost;
 *   - losing the captain ends the voyage, losing an escort does not.
 */

const build = (overrides = {}, name = "Golden Hind") =>
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
    { name },
  );

const captain = build({}, "Golden Hind");
const escort = build({ hullId: "zabra" }, "Santa Ana");
escort.id = `${escort.id}-escort`;
const ashore = build({ hullId: "jacht" }, "Stays in port");
ashore.id = `${ashore.id}-ashore`;

const seaWorld = () => ({
  v: 1,
  seed: 2,
  rngState: 2,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  encounters: [],
});

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const attach = (page) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
};

async function openSea(ships, { flag }) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  attach(page);
  await page.addInitScript(
    ([shipsJson, worldJson, seedFlag]) => {
      if (window.__seeded) return;
      window.__seeded = true;
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", shipsJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
      localStorage.setItem("barcos:smoke-flag", seedFlag);
    },
    [JSON.stringify(ships), JSON.stringify(seaWorld()), flag],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  return page;
}

const savedWorld = (page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return JSON.parse(game.world);
  });

/* ------------------------------------------------- 1: only the marked hulls put to sea */

const fleet = {
  v: 1,
  captainId: captain.id,
  ships: [captain, { ...escort, sails: true }, { ...ashore, sails: false }],
};

let page = await openSea(fleet, { flag: "barcos:smoke-formation-1" });
let world = await savedWorld(page);
const sailing = world.escorts ?? [];
check(
  sailing.length === 1,
  `expected exactly the marked escort at sea, got ${sailing.map((e) => e.id).join(", ") || "none"}`,
);
check(
  sailing[0]?.id === escort.id,
  `the wrong hull put to sea: ${sailing[0]?.id}`,
);
check(
  !sailing.some((e) => e.id === ashore.id),
  "a hull whose check was off still put to sea",
);

/* ------------------------------------------------- 2: the escort follows the captain */

for (let i = 0; i < 14; i += 1) await page.keyboard.press("w");
await page.waitForTimeout(6000);
world = await savedWorld(page);
const captainPos = world.ship;
const escortPos = (world.escorts ?? []).find((e) => e.id === escort.id);
const gap = escortPos ? Math.hypot(escortPos.x - captainPos.x, escortPos.y - captainPos.y) : Infinity;
check(captainPos.currentSpeedKn > 1, `the captain did not get under way (${captainPos.currentSpeedKn})`);
check(
  Number.isFinite(gap) && gap > 20 && gap < 400,
  `the escort is not holding formation: ${gap.toFixed(0)} m from the captain`,
);
// The escort was born 120 m astern of the captain at the origin (-120, 0). A hull that
// follows has moved away from that spot while the captain sails on (it needs time to
// get up to speed: about 95 m after the 6 s of this scenario).
check(
  Math.hypot((escortPos?.x ?? -120) + 120, escortPos?.y ?? 0) > 50,
  "the escort never left its starting station: it is not following at all",
);
await page.close();

/* ------------------------------------------------- 3: an escort can be hit and lost */

// A hostile right on top of the escort, so the fight is about her and not the captain.
const hostileWorld = seaWorld();
hostileWorld.ship = { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn };
hostileWorld.escorts = [
  { id: escort.id, x: 0, y: -160, heading: 0, currentSpeedKn: 0, speedKn: escort.speedKn },
];
hostileWorld.encounters = [
  {
    id: 901,
    type: "enemy",
    // A light hull: the escort now sails and fights for real, so a warship could sink it
    // within the smoke's window by chance and the save would no longer list it.
    hullId: "patache",
    x: 0,
    y: -260,
    heading: 0,
    currentSpeedKn: 0,
    drift: { heading: 0, speedKn: 0 },
  },
];

page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
attach(page);
await page.addInitScript(
  ([shipsJson, worldJson]) => {
    if (window.__seeded) return;
    window.__seeded = true;
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", shipsJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify(fleet), JSON.stringify(hostileWorld)],
);
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(9000);

const fought = await page.evaluate(() => {
  window.dispatchEvent(new Event("beforeunload"));
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  const saved = JSON.parse(game.world);
  return {
    escorts: (saved.escorts ?? []).map((e) => e.id),
    enemy: saved.encounters.filter((e) => e.type === "enemy").length,
    gameOverVisible: !document.querySelector("#gameover-overlay")?.classList.contains("is-hidden"),
    escortCombat: game.combat?.escorts ?? null,
  };
});
check(
  fought.escortCombat && Object.keys(fought.escortCombat).length > 0,
  "the escort's damage was never written to the save: it is not taking part in the fight",
);
check(
  !fought.gameOverVisible,
  "the voyage ended while the captain was still afloat",
);
await page.close();

/* ------------------------------------------------- 4: the checks in the shipyard */

page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
attach(page);
await page.addInitScript((shipsJson) => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", shipsJson);
}, JSON.stringify(fleet));
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const checks = await page.evaluate(() =>
  [...document.querySelectorAll(".fleet-check")].map((box) => ({
    id: box.dataset.sail,
    checked: box.checked,
    disabled: box.disabled,
  })),
);
check(checks.length === 3, `expected one check per hull, got ${checks.length}`);
check(
  checks.find((c) => c.id === captain.id)?.disabled === true,
  "the captain's check can be turned off: she is the ship the player sails",
);
check(
  checks.find((c) => c.id === captain.id)?.checked === true,
  "the captain's check is not on",
);
check(
  checks.find((c) => c.id === escort.id)?.checked === true,
  "the escort's check should be on",
);
check(
  checks.find((c) => c.id === ashore.id)?.checked === false,
  "the hull left in port is still checked",
);

// Turning a check off must be saved with the fleet.
// The flota room owns this control now (S105).
await page.click('.screen-tab[data-screen="flota"]').catch(() => {});

await page.locator(`.fleet-check[data-sail="${escort.id}"]`).click();
await page.waitForTimeout(300);
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")));
const afterToggle = stored.ships.find((s) => s.sails === false && s.id !== ashore.id);
check(
  Boolean(afterToggle),
  `unchecking a hull was not saved with the fleet: ${JSON.stringify(stored.ships.map((s) => [s.id, s.sails]))}`,
);
await page.close();

/* ------------------------------------------------- 5: only the captain's loss ends it */

const sunkEscortFleet = {
  v: 1,
  captainId: captain.id,
  ships: [captain, { ...escort, sails: true }],
};
const doomedWorld = seaWorld();
// The escort is written into the sea save already wrecked, which is what a reload of a
// voyage that went badly looks like.
const sunkEscortSave = {
  gold: 5000,
  world: JSON.stringify(doomedWorld),
  combat: {
    player: { condition: { hull: 100, rigging: 100, crew: 100, morale: 100 }, crew: { marino: 34 }, pieces: [] },
    escorts: {
      [escort.id]: { condition: { hull: 0, rigging: 0, crew: 0, morale: 0 }, crew: { marino: 0 } },
    },
  },
};

page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
attach(page);
await page.addInitScript(
  ([shipsJson, gameJson]) => {
    if (window.__seeded) return;
    window.__seeded = true;
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", shipsJson);
    localStorage.setItem("barcos:game:v1", gameJson);
  },
  [JSON.stringify(sunkEscortFleet), JSON.stringify(sunkEscortSave)],
);
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const lostEscort = await page.evaluate(() => ({
  overlay: !document.querySelector("#gameover-overlay")?.classList.contains("is-hidden"),
  fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.map((s) => s.id),
}));
check(
  !lostEscort.overlay,
  "a sunk escort ended the voyage: only the captain may do that",
);
check(
  !lostEscort.fleet.includes(escort.id),
  `a sunk escort is still in the fleet: ${lostEscort.fleet.join(", ")}`,
);
await page.close();

await browser.close();

const result = { errors, sailingCount: sailing.length, gap, fought, checks, lostEscort, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the marked hulls sail in formation, fight, and can be lost");
