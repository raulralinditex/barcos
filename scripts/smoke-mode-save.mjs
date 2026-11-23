import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S172: the game mode travels with the game.
 *
 * F1 of the refactor. The rule the player asked for (verbatim): "cuando le damos al boton
 * reiniciar seleccionariamos el tipo de juego". Before the restart screen can ask anything,
 * the choice has to survive: a sea born today must be played tomorrow in the mode it was
 * started with, and a voyage saved before modes existed must open exactly as it played.
 *
 * The claims, measured through the saves:
 *   1. a new sea born with a chosen mode is saved with that mode;
 *   2. the save keeps `v: 1`, so no old voyage is rejected;
 *   3. a saved sea keeps her own mode even when the chosen key says otherwise;
 *   4. a save with no `mode` opens as the shipped mode.
 */

const design = buildShip(
  { hullId: "galeon-pequeno", batteries: [], crew: { marino: 25, artillero: 4, soldado: 6 }, days: 45 },
  12000,
);
if (!design?.feasible) throw new Error("smoke setup failed: the ship is not feasible");
const captain = { ...toRuntimeShip(design, { name: "Alfa" }), id: "smoke-captain", yardId: null };

const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
try {
  /** Open the sea with a given fleet, game record and chosen mode; read the world back. */
  const openSea = async ({ world = null, chosenMode = null, gold = 0 }) => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    await page.addInitScript(([captain, world, chosenMode, gold]) => {
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, captainId: captain.id, ships: [captain] }));
      localStorage.setItem("barcos:game:v1", JSON.stringify(world ? { gold, world: JSON.stringify(world) } : { gold }));
      if (chosenMode !== null) localStorage.setItem("barcos:mode:v1", chosenMode);
    }, [captain, world, chosenMode, gold]);
    await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
    // The sea writes on `beforeunload` as well as on her timer, and that is the write a
    // player triggers by leaving. Sailing first is what makes the world differ from the one
    // she read, so the write is a real autosave and not a copy of the seeded record.
    await page.keyboard.down("w");
    await page.waitForTimeout(900);
    await page.keyboard.up("w");
    await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
    await page.waitForTimeout(200);
    let saved = null;
    for (let i = 0; i < 30 && !saved; i += 1) {
      await page.waitForTimeout(300);
      saved = await page.evaluate(() => {
        const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
        return game?.world ? JSON.parse(game.world) : null;
      });
    }
    await page.close();
    return saved;
  };

  /* ------------------------- 1 and 2. a new sea carries the chosen mode */

  const fresh = await openSea({ chosenMode: "batalla-por-nivel" });
  check(Boolean(fresh), "S172: a new sea must be saved");
  check(fresh?.mode === "batalla-por-nivel", `S172: the new sea lost the chosen mode, got ${fresh?.mode}`);
  check(fresh?.v === 1, `S172: the save version must stay 1, got ${fresh?.v}`);

  /* ------------------- 3. a saved sea keeps her mode over the chosen key */

  const savedOther = { ...fresh, mode: "no-such-mode" };
  const kept = await openSea({ world: savedOther, chosenMode: "batalla-por-nivel", gold: 0 });
  check(kept?.mode === "batalla-por-nivel", `S172: an unknown saved mode must fall back, got ${kept?.mode}`);

  /* ------------------- 4. a save with no mode opens as the shipped one */

  const legacy = { ...fresh };
  delete legacy.mode;
  const opened = await openSea({ world: legacy, gold: 0 });
  check(Boolean(opened), "S172: a save written before modes must still open");
  check(
    opened?.mode === "batalla-por-nivel",
    `S172: an old save must play the shipped mode, got ${opened?.mode}`,
  );

  if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the mode rides in the save, an old save opens as it played, and v stays 1");
