import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S167: the fog of war.
 *
 * The player asked for it (verbatim): "ahora vamos a hacer niebla, todo el mapa tiene niebla
 * y no se ve ningun barco, segun van navegando tus barcos vas descubriendo el mapa, lo
 * implementamos con una flag en configuraciones niebla si o no". Then she reported the first
 * build (verbatim): "cuando activo la niebla no la veo".
 *
 * That report is the shape of this smoke. It walks the player's own road: an OLD save (no
 * discovery record, like a voyage in progress), the switch turned on in Configuración, and
 * the sea. The first build opened such a save "fully discovered", wrote that to disk on the
 * first autosave, and the switch did nothing.
 *
 * The claims, measured through the screen and the saves:
 *   1. the switch exists in Configuración and is stored;
 *   2. an old save opens DARK, not "complete";
 *   3. the water far from the fleet is actually painted over (a pixel of the canvas);
 *   4. sailing lights more of the sea, and what was lit stays lit;
 *   5. with the fog off nothing is hidden and nothing is recorded.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [],
      crew: { marino: 20 },
      days: 45,
      cargoKg: 0,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    12000,
  ),
  { name: "Alfa" },
);

/** A voyage in progress, written before the fog existed: no `discovered` field at all. */
const oldWorld = () => ({
  v: 1,
  seed: 4,
  rngState: 4,
  nextId: 500,
  gold: 20000,
  timeS: 0,
  ship: { x: 900, y: 300, heading: 0, currentSpeedKn: 0, speedKn: ship.speedKn },
  escorts: [],
  level: 1,
  levelEnemies: [],
  levelVictories: 0,
  order: { throttle: 0, turn: 0 },
  squadrons: [],
  encounters: [],
  activeId: ship.id,
});

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const open = async () => {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, locale: "es-AR" });
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(
    ([fleetJson, worldJson]) => {
      if (localStorage.getItem("barcos:fleet:v1")) return;
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 20000, world: worldJson }));
    },
    [
      JSON.stringify({ v: 1, captainId: ship.id, ships: [{ ...ship, commandId: ship.id, yardId: null }] }),
      JSON.stringify(oldWorld()),
    ],
  );
  return { page, context };
};

/** The discovery record the sea wrote, flushed first. */
const discovered = async (page) => {
  await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
  return page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
    const world = game?.world ? JSON.parse(game.world) : null;
    return world?.discovered ?? null;
  });
};

/** Whether the sea canvas is painted dark at a corner far from the ship: the fog itself. */
const cornerIsDark = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("#sea-canvas");
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    // The bottom-left corner: the fleet is in the middle, so this is water it has not lit.
    const [r, g, b] = ctx.getImageData(Math.round(8 * dpr), Math.round((window.innerHeight - 8) * dpr), 1, 1).data;
    return r + g + b < 120;
  });

/* ------------------------- 1: the switch, turned on the way the player does */

const on = await open();
await on.page.goto("http://localhost:8765/config.html", { waitUntil: "networkidle" });
await on.page.waitForTimeout(900);
const switchBox = on.page.locator('input[id="field-fog.enabled"]');
check((await switchBox.count()) === 1, "S167-A: Configuración must have the fog switch");
check(
  (await on.page.locator('label[for="field-fog.enabled"]').textContent())?.trim() === "Niebla de guerra",
  "S167-H: the fog switch must be named, not a raw key",
);
check((await on.page.locator('input[id="field-fog.rule"]').count()) === 1, "S167-D: the visibility rule must be a setting");
check(
  (await on.page.locator('input[id="field-fog.revealRadiusM"]').count()) === 1,
  "S167-C: the reveal radius must be a setting",
);
await switchBox.check({ force: true });
await on.page.locator("#settings-apply").click();
await on.page.waitForTimeout(400);
check(
  await on.page.evaluate(() => (localStorage.getItem("barcos:settings:v1") ?? "").includes('"fog.enabled":1')),
  "S167-A: turning the switch on must be stored",
);

/* ------------------------- 2 and 3: an old save opens dark, and the sea is painted over */

await on.page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await on.page.waitForTimeout(1500);
const opened = await discovered(on.page);
check(opened !== null, "S167-F: the sea save must carry a discovery record");
check(opened?.complete === false, "S167-F: an old save must open dark, not 'fully discovered'");
check(
  (opened?.cells?.length ?? 0) > 0 && opened.cells.length < 400,
  `S167-C: the fleet must light the water around it and no more, it lit ${opened?.cells?.length} cells`,
);
check(await cornerIsDark(on.page), "S167-B: the water far from the fleet must be painted over by the fog");

/* ------------------------- 4: sailing lights more, and keeps what it lit */

const before = opened.cells.length;
await on.page.keyboard.down("w");
await on.page.waitForTimeout(6000);
await on.page.keyboard.up("w");
const after = await discovered(on.page);
check(after.cells.length > before, `S167-C: sailing must light more sea, it went ${before} → ${after.cells.length} cells`);
check(
  opened.cells.every((cell) => after.cells.includes(cell)),
  "S167-B: what was discovered must stay discovered",
);
check(await cornerIsDark(on.page), "S167-B: the far corner must still be dark after a short sail");
await on.context.close();

/* ------------------------- 5: with the fog off nothing is hidden or recorded */

const off = await open();
await off.page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await off.page.waitForTimeout(1500);
check(!(await cornerIsDark(off.page)), "S167-A: with the fog off the corner must be plain sea");
const record = await discovered(off.page);
check(
  (record?.cells?.length ?? 0) === 0,
  `S167-A: with the fog off nothing must be recorded, it recorded ${record?.cells?.length} cells`,
);
await off.context.close();

await browser.close();

if (errors.length > 0) {
  console.error("Console errors:");
  for (const error of errors) console.error(`  - ${error}`);
}
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("smoke-fog: all checks passed");
