import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * Browser smoke for S175: losing the whole squadron ends the voyage, and the voyage stays
 * ended.
 *
 * The player reported it (verbatim): "cuando se me hunde una capitana, me sale el dialogo el
 * barco se hunchio, volver al astillero, y cuando vuelvo, veo a la capitana sin poderla
 * areglar, y cuando creo mas naves, y le doy a zarpar, en vez de salir del astillero, aparezco
 * donde se hundio la capitana, pero sin los barcos que cree, y me vuelve a salir el dialogo de
 * se hunchio la capitana volver al astillero. lo que quiero es que cuand no me quedan ningun
 * barco, se salga el dialogo se hundio la capitana, volver al astillero, pero en el astillero
 * no hay ningun barco hundido, puedo crear mas barcos y cuando zarpo, salgo del astillero no
 * del punto donde me hundi".
 *
 * The claims, through the screen and the saves:
 *   1. the sinking dialog comes up when nothing is left to sail;
 *   2. going back leaves no sunk hull in the shipyard;
 *   3. the dead voyage is not written again on the way out;
 *   4. a new ship sails from the shipyard, not from where the captain went down.
 */

const design = buildShip(
  { hullId: "galeon-pequeno", batteries: [], crew: { marino: 25, artillero: 4, soldado: 6 }, days: 45 },
  12000,
);
if (!design?.feasible) throw new Error("smoke setup failed: the ship is not feasible");
const flagship = { ...toRuntimeShip(design, { name: "Alfa" }), id: "smoke-flagship", yardId: null };
const escort = { ...toRuntimeShip(design, { name: "Beta" }), id: "smoke-escort", yardId: null };
/** A hull bought after the disaster: it starts in the home yard. */
const bought = { ...toRuntimeShip(design, { name: "Gamma" }), id: "smoke-bought", yardId: "puerto-casa" };

const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
try {
  /* ---------------------------------- 1. the whole squadron goes down */

  const sea = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  sea.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  sea.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await sea.addInitScript(([flagship, escort]) => {
    if (sessionStorage.getItem("gameover-seeded")) return;
    sessionStorage.setItem("gameover-seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({
      v: 1, captainId: flagship.id, ships: [flagship, escort],
    }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({
      gold: 5000,
      combat: {
        player: { condition: { hull: 0, rigging: 100, crew: 100, morale: 100 } },
        escorts: { [escort.id]: { condition: { hull: 0, rigging: 100 }, crew: escort.crew } },
      },
    }));
  }, [flagship, escort]);
  await sea.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await sea.waitForTimeout(2500);

  const shown = await sea.evaluate(() =>
    !document.querySelector("#gameover-overlay")?.classList.contains("is-hidden"));
  check(shown, "S175: losing the whole squadron must show the sinking dialog");

  /* ----------------- 2 and 3. going back leaves no sunk hull and no dead voyage */

  await sea.click("#gameover-back");
  await sea.waitForTimeout(1200);

  const back = await sea.evaluate(() => ({
    url: location.href,
    fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1") ?? "null"),
    game: localStorage.getItem("barcos:game:v1"),
  }));
  check(/#comprar/.test(back.url), `S175: the player must land in the shipyard, she is at ${back.url}`);

  const sunk = (back.fleet?.ships ?? []).filter((ship) => (ship.condition?.hull ?? 100) <= 0);
  check(
    sunk.length === 0,
    `S175: no sunk hull may wait in the shipyard, found ${JSON.stringify(sunk.map((s) => s.id))}`,
  );

  // The unload handler used to write the dead voyage back on the way out, which is what put
  // the player at the sinking point on the next sail and brought the dialog back.
  check(back.game === null, "S175: the dead voyage must not be written again on the way out");

  /* ------------------- 4. a new ship sails from the shipyard, not from the wreck */

  const fresh = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  fresh.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  fresh.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await fresh.addInitScript(([bought]) => {
    if (sessionStorage.getItem("fresh-seeded")) return;
    sessionStorage.setItem("fresh-seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    // What the shipyard leaves after the player buys a hull: only the new one, in port.
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, captainId: bought.id, ships: [bought] }));
  }, [bought]);
  await fresh.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  // The sea autosaves every three seconds, so the record is written after the screen is up.
  // Waiting for it is waiting for the same write a player would get by sailing a moment.
  await fresh.waitForTimeout(4000);

  const sailed = await fresh.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
    const world = game?.world ? JSON.parse(game.world) : null;
    return {
      ship: world?.ship ? { x: world.ship.x, y: world.ship.y, id: world.ship.id } : null,
      overlayHidden: document.querySelector("#gameover-overlay")?.classList.contains("is-hidden"),
    };
  });
  check(Boolean(sailed.ship), "S175: a new voyage must have a sea");
  if (sailed.ship) {
    // The home port sits at the origin; the sea opens just outside it. The sinking point was
    // 210,70 only by coincidence in the seed used to report the bug, so the check is the
    // distance from the yard, not a pair of coordinates.
    const radius = Math.hypot(sailed.ship.x, sailed.ship.y);
    check(radius < 400, `S175: a new voyage must open at the shipyard, it opened ${radius.toFixed(0)} m away`);
    check(sailed.ship.id === bought.id, `S175: the sea must steer the new ship, it steers ${sailed.ship.id}`);
  }
  check(sailed.overlayHidden === true, "S175: a new voyage must not open on the sinking dialog");

  if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the voyage ends once, the shipyard holds no sunk hull, and a new ship sails from port");
