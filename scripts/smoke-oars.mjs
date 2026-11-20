import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * S159: the oars, end to end in the browser.
 *
 * Player request (verbatim): "los remeros los vamos a introducir en la velocidad", with the
 * accepted formula `I_total = max(I_velas, I_remos) − penalización carga y fatiga`, and three
 * decisions: "remos automaticos, tambien influyen en la maniobrabilidad, los cascos que no
 * tienen remos no aparecen en la interface esa posibilidad".
 *
 * What is proven here, through the screen and the saves only:
 *   1. a galleass under way publishes her oar reading and the HUD row says so;
 *   2. her crew spends effort while rowing, and the record survives a reload;
 *   3. a hull with no banks of oars shows no oars row at all (S159-H), and the sea save
 *      carries no effort for her.
 *
 * The model itself is covered by `test/oars.test.js` and `test/oars-sea.test.js`; this only
 * proves that the screen reads it and that a reload keeps it.
 */

const galleass = toRuntimeShip(
  buildShip(
    {
      hullId: "galeaza",
      batteries: [],
      crew: { marino: 40, artillero: 8, soldado: 20, remero: 300 },
      days: 45,
      cargoKg: 0,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    40000,
  ),
  { name: "Galeaza" },
);

/** A galleon: no banks of oars, so the screen must offer her no oars at all. */
const galleon = toRuntimeShip(
  buildShip(
    {
      hullId: "gran-galeon",
      batteries: [],
      crew: { marino: 60, artillero: 12, soldado: 30 },
      days: 45,
      cargoKg: 0,
      ballastKg: 3_000,
      equipmentKg: 2_500,
      reserveKg: 1_500,
    },
    40000,
  ),
  { name: "Galeón" },
);

const browser = await chromium.launch();
const failures = [];
const errors = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const attach = (page) => {
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
};

/**
 * A page whose fleet is the given hull, opening straight in the sea.
 *
 * `rigging` shreds the sails in the sea save. The oars are the reserve propulsion (S159-A):
 * with a whole rig and a fair wind the sail alone beats them and the crew rests, so a hull
 * that rows has to be a hull whose sail cannot carry her. Shredded rigging is exactly that
 * case, and it is the one the rule exists for.
 */
const seaWith = async (ship, { rigging = 100 } = {}) => {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: "es-AR" });
  attach(page);
  await page.addInitScript(
    ([shipJson, riggingValue]) => {
      if (localStorage.getItem("barcos:fleet:v1")) return;
      const hull = JSON.parse(shipJson);
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [hull], captainId: hull.id }));
      localStorage.setItem(
        "barcos:game:v1",
        JSON.stringify({ gold: 5000, combat: { player: { condition: { rigging: riggingValue } } } }),
      );
    },
    [JSON.stringify(ship), rigging],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  return page;
};

/** The sea saves on a timer; every read flushes it first. */
const flush = (page) => page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
const savedSea = async (page) => {
  await flush(page);
  return page.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
    return game?.world ? JSON.parse(game.world) : null;
  });
};

/* ------------------------------------- 1: a hull with banks rows and says so */

const oars = await seaWith(galleass, { rigging: 10 });
// Set the sail and let the voyage run: the oars are automatic, so there is no key to press.
await oars.keyboard.down("w");
await oars.waitForTimeout(2600);
await oars.keyboard.up("w");

const oarsRow = oars.locator("#hud-oars-row");
check((await oarsRow.count()) === 1, "S159: the HUD has no oars row");
check(await oarsRow.isVisible(), "S159: a galleass under way must show the oars row");
const oarsText = await oars.locator("#hud-oars").textContent();
check(
  /kn|esfuerzo/i.test(oarsText ?? ""),
  `S159: the oars row must say what the oars are doing, it reads "${oarsText}"`,
);

const first = await savedSea(oars);
const captainId = first?.ship?.id;
check(typeof captainId === "string", `S159: the sea save must carry the captain's id, it has ${captainId}`);
check(
  first?.ship?.hullId === "galeaza",
  `S159: the sea save must carry the captain's hull, it has ${first?.ship?.hullId}`,
);
const spent = first?.oarEffort?.[captainId];
check(
  typeof spent === "number" && spent < 1,
  `S159: a crew that rowed must have spent effort, the save says ${spent}`,
);

/* ------------------------------------- 2: the effort survives a reload */

await oars.reload({ waitUntil: "networkidle" });
await oars.waitForTimeout(700);
const after = await savedSea(oars);
check(
  typeof after?.oarEffort?.[captainId] === "number",
  `S159: the crew's effort must survive a reload, the save says ${JSON.stringify(after?.oarEffort)}`,
);
check(
  Math.abs((after?.oarEffort?.[captainId] ?? 0) - (spent ?? 0)) < 0.2,
  `S159: the reloaded effort must be the saved one, ${spent} -> ${after?.oarEffort?.[captainId]}`,
);
await oars.close();

/* ------------------------------------- 3: a hull with no banks is offered no oars */

const noBanks = await seaWith(galleon);
await noBanks.keyboard.down("w");
await noBanks.waitForTimeout(1600);
await noBanks.keyboard.up("w");

const hiddenRow = noBanks.locator("#hud-oars-row");
check(
  (await hiddenRow.count()) === 1,
  "S159-H: the oars row must exist in the markup so a hull with banks can show it",
);
check(
  !(await hiddenRow.isVisible()),
  "S159-H: a galleon has no banks of oars and must be shown no oars row",
);

const plain = await savedSea(noBanks);
const plainId = plain?.ship?.id;
check(
  !plain?.oarEffort || Object.keys(plain.oarEffort).length === 0 || !(plainId in plain.oarEffort),
  `S159-H: a hull with no banks must carry no effort, the save says ${JSON.stringify(plain?.oarEffort)}`,
);
await noBanks.close();

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
console.log("smoke-oars: 8 checks passed");
