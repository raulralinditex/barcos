import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { ownWreck } from "../src/model/sinking.js";

/**
 * Browser smoke for S169: a sunk hull of ours leaves a wreck in the water.
 *
 * The player's rule (verbatim): "barco nuestro hundido, no aparece en el astillero, quitamos
 * la opcion de 'Un barco hundido queda como naufragio' y siempre queda como naufragio, y
 * desaparece en el astillero". Her decisions (verbatim): the hull leaves "un pecio en el
 * mar", and an old save's yard wreck is discarded "al cargar".
 *
 * The claims, measured through the screen and the saves:
 *   1. the wreck switch is gone from Configuración, and no block is named "Naufragio";
 *   2. an old save holding a yard wreck does not list that hull in the fleet;
 *   3. the sea keeps a wreck encounter with the prize the model quotes for that hull;
 *   4. sailing over it pays the gold and the wreck is gone from the water.
 */

const design = buildShip(
  {
    hullId: "galeon-pequeno",
    batteries: [],
    crew: { marino: 25, artillero: 4, soldado: 6 },
    days: 45,
  },
  12000,
);
if (!design?.feasible) throw new Error("smoke setup failed: the ship is not feasible");
const captain = { ...toRuntimeShip(design, { name: "Alfa" }), id: "smoke-captain", yardId: null };
const drowned = { ...toRuntimeShip(design, { name: "Beta" }), id: "smoke-drowned" };

const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
try {
  /* ------------------------------------ 1. the switch is gone from the screen */

  const settings = await browser.newPage({ viewport: { width: 1500, height: 1200 }, locale: "es-AR" });
  settings.on("pageerror", (err) => errors.push(`settings pageerror: ${err.message}`));
  await settings.goto("http://localhost:8765/config.html", { waitUntil: "networkidle" });
  await settings.waitForTimeout(700);
  const switchCount = await settings.locator("#field-sinking\\.keepWreck").count();
  check(switchCount === 0, `S169-A: the wreck switch is still on the settings screen (${switchCount} found)`);
  const blockNames = await settings.locator(".settings-card h2").allTextContents();
  check(
    !blockNames.some((name) => /Naufragio/i.test(name)),
    `S169-A: a sinking block is still mounted: ${blockNames.join(", ")}`,
  );
  await settings.close();

  /* ------------------------- 2. an old save's yard wreck is discarded on load */

  const oldSave = {
    v: 1,
    seed: 4,
    rngState: 4,
    nextId: 500,
    gold: 20000,
    timeS: 0,
    ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
    escorts: [],
    level: 1,
    levelEnemies: [],
    levelVictories: 0,
    order: { throttle: 0, turn: 0 },
    squadrons: [],
    encounters: [],
    activeId: captain.id,
  };

  const yard = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
  yard.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  yard.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await yard.addInitScript(([captain, ghost, world]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    // The ghost is exactly what S117 wrote: a hull waiting in the home yard as a wreck.
    const wreck = { ...ghost, yardId: "puerto-casa", wreck: true, sails: false };
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, captainId: captain.id, ships: [captain, wreck] }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000, world: JSON.stringify(world) }));
  }, [captain, drowned, oldSave]);
  await yard.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await yard.click('.screen-tab[data-screen="flota"]');
  check(
    (await yard.locator('.fleet-item[data-ship-id="smoke-drowned"]').count()) === 0,
    "S169-E: a wreck left in a yard by an old save is still listed in the fleet",
  );
  await yard.close();

  /* ------------------------ 3. the sea keeps the wreck, and 4. it pays out */

  // The wreck is seeded in the water one pickup radius ahead of the bow, so the captain
  // reaches it by sailing straight: the same rule an enemy's wreck obeys.
  const zone = { id: "costera", lootFactor: 1 };
  const wreck = ownWreck(drowned, { x: 0, y: 40 }, zone, 501);
  const withWreck = { ...oldSave, encounters: [wreck] };

  const sea = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: "es-AR" });
  sea.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  sea.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await sea.addInitScript(([captain, world]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, captainId: captain.id, ships: [captain] }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 0, world: JSON.stringify(world) }));
  }, [captain, withWreck]);
  await sea.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });

  const saved = () => sea.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    return JSON.parse(game.world);
  });
  const before = await saved();
  const kept = (before.encounters ?? []).find((entry) => entry.type === "wreck");
  check(Boolean(kept), `S169-C: the sea must keep the wreck, got ${JSON.stringify(before.encounters)}`);
  if (kept) {
    check(kept.gold === wreck.gold, `S169-C: the wreck must pay ${wreck.gold}, it pays ${kept.gold}`);
    check(kept.x === wreck.x && kept.y === wreck.y, "S169-C: the wreck must sit where it was seeded");
  }

  // Sail north for the wreck. The throttle key is held until the prize is taken or time
  // runs out: a wreck is collected by proximity, so there is nothing else to press.
  await sea.keyboard.down("w");
  let paid = 0;
  for (let i = 0; i < 40 && paid === 0; i += 1) {
    await sea.waitForTimeout(250);
    paid = await sea.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1")).gold ?? 0);
  }
  await sea.keyboard.up("w");
  check(paid >= (wreck.gold ?? 0), `S169-C: sailing over the wreck must pay its prize, the purse reads ${paid}`);
  const after = await saved();
  check(
    !(after.encounters ?? []).some((entry) => entry.type === "wreck" && entry.id === wreck.id),
    "S169-C: the wreck must be gone from the water once it is collected",
  );

  if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the switch is gone, a yard wreck is discarded on load, and the sea pays the wreck of our own hull");
