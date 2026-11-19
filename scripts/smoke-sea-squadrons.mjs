import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S155-C/D/E/F/G: several captains afloat, choosing one, and the two
 * orders she can be given.
 *
 * The save is written with two captains and one escort each, both at sea, so the screen boots
 * into the sea the feature is about. The smoke then measures, through the real UI only:
 *
 *   - the HUD says how many captains are afloat and whose helm the player has;
 *   - a click on the other captain takes her helm, and the first one keeps sailing;
 *   - C cycles the helm back;
 *   - a double click gives a destination, the squadron makes way towards it, and taking the
 *     wheel with A cancels the order;
 *   - G gives the pick-up order, and it ends when the sea has no golden buoy left.
 */

const starter = () =>
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 0,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    8000,
  );

const first = starter();
const second = starter();
if (!first?.feasible || !second?.feasible) {
  console.error("smoke setup failed: the starter ship no longer builds");
  process.exit(1);
}

const a = toRuntimeShip(first, { name: "Santa Ana" });
const b = toRuntimeShip(second, { name: "Numancia" });
const aEscort = { ...a, id: `${a.id}-escort`, name: "Aviso", commandId: a.id, speedKn: a.speedKn };
const bEscort = { ...b, id: `${b.id}-escort`, name: "Guarda", commandId: b.id, speedKn: b.speedKn };

// Both captains at sea, each with one hull under her command.
const fleet = {
  v: 1,
  captainId: a.id,
  ships: [
    { ...a, commandId: a.id, yardId: null },
    { ...aEscort, yardId: null },
    { ...b, commandId: b.id, yardId: null },
    { ...bEscort, yardId: null },
  ],
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.addInitScript(
  ([fleetJson, goldValue]) => {
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.removeItem("barcos:current-ship:v1");
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: goldValue }));
  },
  [JSON.stringify(fleet), 5000],
);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
// The sea autosaves every three seconds; the smoke reads the save, so it waits for the first
// one instead of racing it.
await page.waitForFunction(() => {
  try {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return Boolean(game?.world);
  } catch {
    return false;
  }
}, null, { timeout: 8000 });
await page.waitForTimeout(400);

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const hudName = () => page.locator("#hud-ship-name").textContent();
const banner = () => page.locator("#banner").textContent();

// The HUD names the captain under the helm and how many are afloat (S155-D).
const title = await hudName();
check(/Santa Ana/.test(title), `S155-D: the helm must open on the fleet captain, HUD said "${title}"`);
check(/2\D+(capitanas|captains)/.test(title), `S155-D: the HUD must count the captains afloat, HUD said "${title}"`);

// Both captains are in the sea save, each with her own formation (S155-C).
const saved = await page.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  const world = JSON.parse(game.world);
  return {
    activeId: world.activeId,
    squadrons: (world.squadrons ?? []).map((squadron) => ({
      id: squadron.id,
      escorts: (squadron.escorts ?? []).map((escort) => escort.id),
    })),
  };
});
check(saved.squadrons.length === 1, `S155-C: one squadron must be parked while the other holds the helm, got ${saved.squadrons.length}`);
check(
  saved.squadrons[0]?.escorts?.length === 1,
  "S155-C: the parked squadron must carry her own escort",
);

// A click on the other captain takes her helm (S155-E). She is the parked one, so her
// position comes from the save the screen just wrote.
const otherId = saved.squadrons[0].id;
const otherAt = await page.evaluate((id) => {
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  const world = JSON.parse(game.world);
  const squadron = (world.squadrons ?? []).find((entry) => entry.id === id);
  return squadron ? { x: squadron.ship.x, y: squadron.ship.y } : null;
}, otherId);
check(Boolean(otherAt), "S155-E: the parked captain must have a position on the sea");

if (otherAt) {
  // Convert her world position to the screen: the camera follows the active captain.
  const activeAt = await page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return JSON.parse(game.world).ship;
  });
  const PX_PER_M = 0.4;
  const px = 1500 / 2 + (otherAt.x - activeAt.x) * PX_PER_M;
  const py = 950 / 2 + (otherAt.y - activeAt.y) * PX_PER_M;
  if (px > 0 && px < 1500 && py > 0 && py < 950) {
    await page.mouse.click(px, py);
    await page.waitForTimeout(400);
    const after = await hudName();
    check(/Numancia/.test(after), `S155-E: the click must take the other helm, HUD said "${after}"`);
  } else {
    failures.push(`S155-E: the parked captain is off screen at ${Math.round(px)},${Math.round(py)}`);
  }
}

// C cycles the helm back (S155-E, keyboard).
await page.keyboard.press("c");
await page.waitForTimeout(400);
const cycled = await hudName();
check(/Santa Ana/.test(cycled), `S155-E: C must cycle back to the first captain, HUD said "${cycled}"`);

// A double click gives a destination (S155-F) and the squadron makes way.
await page.mouse.dblclick(1100, 300);
await page.waitForTimeout(300);
const ordered = await banner();
check(/Rumbo puesto|Course set/.test(ordered), `S155-F: the banner must name the course, said "${ordered}"`);

const before = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world).ship);
// The speed the HUD prints is live, so it proves the order is sailing her now; the save is
// written every three seconds, so the position needs a longer window than one write.
await page.waitForTimeout(1600);
const speedText = await page.locator("#hud-speed").textContent();
const speedKn = Number(String(speedText).replace(",", ".").replace(/[^\d.]/g, ""));
check(speedKn > 2, `S155-F: the squadron must make way on her order, HUD said "${speedText}"`);
await page.waitForTimeout(3500);
const moving = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world).ship);
const travelled = Math.hypot(moving.x - before.x, moving.y - before.y);
check(travelled > 40, `S155-F: the squadron must make way on her order, she moved ${Math.round(travelled)} m`);

// Taking the wheel cancels the order (S155-F).
await page.keyboard.down("a");
await page.waitForTimeout(250);
await page.keyboard.up("a");
const cancelled = await banner();
check(/cancelada|cancelled/.test(cancelled), `S155-F: the helm must cancel the order, banner said "${cancelled}"`);

// G gives the pick-up order (S155-G), and it can be abandoned with G again.
await page.keyboard.press("g");
await page.waitForTimeout(350);
const collecting = await banner();
check(
  /bolas amarillas|golden buoys|ninguna bola|no golden buoy/.test(collecting),
  `S155-G: G must start the pick-up or say there is nothing to pick, banner said "${collecting}"`,
);
if (/bolas amarillas|golden buoys/.test(collecting)) {
  await page.keyboard.press("g");
  await page.waitForTimeout(300);
  const abandoned = await banner();
  check(/abandona|abandons/.test(abandoned), `S155-G: a second G must abandon it, banner said "${abandoned}"`);
}

await page.screenshot({ path: "/tmp/sea-squadrons.png" });

console.log(JSON.stringify({ errors, failures, title, saved }, null, 2));
await browser.close();
if (failures.length > 0) process.exit(1);
