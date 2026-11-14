import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { pieceById } from "../src/data/naval-data.js";

/**
 * Browser smoke for changing ammunition in the middle of a fight (S65). Needs the local
 * server on 8765.
 *
 * The hull carries two kinds of gun on purpose: minions, which take chain shot, and a
 * 32-pounder, which does not. Pressing 2 must switch the minions and leave the big gun
 * with exactly the round she had — that is the whole rule, and it is checked in the
 * saved combat record, which is what the next frame fires from.
 */

const runtime = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "medio-canon-32", qty: 1, side: "estribor", shotsPerPiece: 20, ammoId: "bala-hierro" },
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
  { name: "Golden Hind" },
);

const fleet = { v: 1, captainId: runtime.id, ships: [runtime] };
const world = {
  v: 1,
  seed: 7,
  rngState: 7,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  encounters: [],
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
  [JSON.stringify(fleet), JSON.stringify(world)],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(900);

/** The guns of the player's combatant, as the sea has them right now. */
const guns = () =>
  page.evaluate(() => {
    // The sea keeps its combat in memory; the saved record is written on every change.
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const pieces = game?.combat?.player?.pieces ?? [];
    return pieces.map((piece) => ({ pieceId: piece.pieceId, ammoId: piece.ammoId, shotsLeft: piece.shotsLeft }));
  });

const banner = () => page.locator("#banner").textContent();
const hudAmmo = () => page.locator("#hud-ammo").textContent();

const before = await guns();
check(before.length > 0, "the player should have guns at sea");
const beforeRounds = before.reduce((sum, gun) => sum + (gun.shotsLeft ?? 0), 0);

/* ------------------------------------------------- 1: the key switches what it can */

await page.keyboard.press("2");
await page.waitForTimeout(400);

const afterChain = await guns();
const minions = afterChain.filter((gun) => gun.pieceId === "minion");
const bigGun = afterChain.filter((gun) => gun.pieceId === "medio-canon-32");

check(minions.length > 0 && bigGun.length > 0, "the scenario needs both kinds of gun");
check(
  minions.every((gun) => gun.ammoId === "cadena"),
  `S65: the minions should take chain shot, they hold ${JSON.stringify(minions.map((g) => g.ammoId))}`,
);
check(
  bigGun.every((gun) => gun.ammoId === "bala-hierro"),
  `S65: the 32-pounder cannot fire chain shot and must keep her iron, she holds ${JSON.stringify(bigGun.map((g) => g.ammoId))}`,
);
check(
  afterChain.every((gun) => pieceById(gun.pieceId).ammo.includes(gun.ammoId)),
  "S65: a gun ended up holding a round it cannot fire",
);
check(
  afterChain.reduce((sum, gun) => sum + (gun.shotsLeft ?? 0), 0) === beforeRounds,
  "S65: switching ammunition must not spend rounds",
);

const mixedBanner = await banner();
check(/cadena/i.test(mixedBanner), `S65: the banner should name the round, it says "${mixedBanner}"`);
check(
  /1/.test(mixedBanner),
  `S65: the banner should say one gun kept hers, it says "${mixedBanner}"`,
);

/* ------------------------------------------------- 2: the HUD says what is loaded */

const hud = await hudAmmo();
check(/cadena/i.test(hud), `S65: the HUD should show the chain shot, it says "${hud}"`);
// Port is all chain shot; starboard is chain shot plus the 32-pounder still on iron, so
// the beam reads as mixed instead of naming one round as if the whole side had it.
check(
  /otras|others/i.test(hud),
  `S65: the mixed beam should say so instead of naming one round, it says "${hud}"`,
);

/* ------------------------------------------------- 3: a round nobody has changes nothing */

const beforeIron = await guns();
await page.keyboard.press("1");
await page.waitForTimeout(400);
const afterIron = await guns();
check(
  afterIron.filter((g) => g.pieceId === "minion").every((gun) => gun.ammoId === "bala-hierro"),
  "S65: key 1 should put the minions back on iron",
);
check(
  afterIron.filter((g) => g.pieceId === "medio-canon-32").every((gun) => gun.ammoId === "bala-hierro"),
  "S65: the big gun was already on iron and stays there",
);
check(
  afterIron.every((gun) => pieceById(gun.pieceId).ammo.includes(gun.ammoId)),
  "S65: every gun still fires a round it declares",
);
void beforeIron;

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: key 2 loaded ${minions.length} minions with chain shot and left the 32-pounder on iron, the HUD reads "${hud}"`,
);
