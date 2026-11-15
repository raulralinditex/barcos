import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { createEnemyCombatant } from "../src/model/combat.js";
import { salePrice } from "../src/model/sale.js";
import { shipValue } from "../src/model/repair.js";

/**
 * Browser smoke for selling and capturing hulls (S62, S63, S64). Needs the local server
 * on 8765.
 *
 *   S62  the shipyard sells a hull for a share of her value and takes her out of the fleet;
 *   S63  a surrendered enemy joins the player's fleet as a prize;
 *   S64  that prize can then be sold like any other hull.
 *
 * The money is checked against the model, not against a magic number: the screen and the
 * sale must agree, so the expected price is computed the same way the game computes it.
 */

const build = (hullId, name) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries: [
          { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
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
    { name },
  );

const captain = build("zabra", "Capitana");
const spare = { ...build("galeon-pequeno", "Repuesto"), id: `${captain.id}-spare` };
const fleet = { v: 1, captainId: captain.id, ships: [captain, spare] };

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

/* ------------------------------------------------- S62 + S64: selling in the shipyard */

const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.addInitScript(
  ([fleetJson, gold]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold }));
  },
  [JSON.stringify(fleet), 5000],
);

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

const purse = async () =>
  Number.parseFloat(
    String(await page.locator("#gold-value").textContent()).replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""),
  );
const fleetIds = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")).ships.map((ship) => ship.id));

const expectedSpare = salePrice(spare);
// The flota room owns this control now (S105).
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(150);
// The sell action belongs to the hull the fleet list holds (S108): pick her, then read
// the shared button in the panel under the list.
await page.locator(`.fleet-item[data-ship-id="${spare.id}"] [data-refit]`).click();
const buttonLabel = await page.locator("#fleet-sell-btn").textContent();
check(
  buttonLabel.replace(/[^\d]/g, "") === String(expectedSpare).replace(/[^\d]/g, ""),
  `S62: the sell button should offer ${expectedSpare}, it says "${buttonLabel}"`,
);

const before = await purse();
await page.locator("#fleet-sell-btn").click();
await page.waitForTimeout(400);
const after = await purse();

check(after === before + expectedSpare, `S62: the purse should go ${before} -> ${before + expectedSpare}, it went to ${after}`);
check(!(await fleetIds()).includes(spare.id), "S62: the sold hull is still in the fleet");
check((await fleetIds()).includes(captain.id), "S62: selling one hull must not touch the others");

// The last hull cannot be sold: with one left, her button is disabled and clicking it
// does nothing, so the fleet and the purse must not move.
const lastPurse = await purse();
await page.locator(`.fleet-item[data-ship-id="${captain.id}"] [data-refit]`).click();
check(
  await page.locator("#fleet-sell-btn").isDisabled(),
  "S62: the only remaining hull must not be sellable",
);
await page.locator("#fleet-sell-btn").click({ force: true }).catch(() => {});
await page.waitForTimeout(300);
check((await purse()) === lastPurse, "S62: a refused sale must not pay anything");
check((await fleetIds()).length === 1, "S62: the refused sale must leave the fleet alone");

await page.close();

/* ------------------------------------------------- S63: capturing a surrendered enemy */

const prize = {
  id: 901,
  type: "enemy",
  hullId: "galeon-guerra",
  x: 300,
  y: 0,
  heading: 0,
  currentSpeedKn: 0,
  drift: { heading: 0, speedKn: 0 },
};

// The enemy is seeded already struck: crew at zero, status surrendered, so the first
// frame the sea draws resolves her. That keeps the smoke about the capture, not about
// whether a scripted pilot can make a galleon strike.
const struck = createEnemyCombatant({ id: 901, hullId: "galeon-guerra" }, { id: "costera" }, 7);
struck.condition.crew = 0;
struck.status = "surrendered";
prize.combat = struck;

const seaWorld = {
  v: 1,
  seed: 7,
  rngState: 7,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  encounters: [prize],
};

const sea = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
sea.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
sea.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
await sea.addInitScript(
  ([fleetJson, worldJson]) => {
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", fleetJson);
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify({ v: 1, captainId: captain.id, ships: [captain] }), JSON.stringify(seaWorld)],
);
await sea.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await sea.waitForTimeout(1200);

const seaFleet = () =>
  sea.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
    return stored.ships.map((ship) => ({ id: ship.id, hullId: ship.hullId, captured: Boolean(ship.captured) }));
  });

const captured = (await seaFleet()).filter((ship) => ship.captured);
check(captured.length === 1, `S63: the prize should be in the fleet, fleet is ${JSON.stringify(await seaFleet())}`);
check(captured[0]?.hullId === "galeon-guerra", `S63: the prize should be the captured galleon, got ${captured[0]?.hullId}`);
check(
  (await seaFleet()).some((ship) => ship.id === captain.id),
  "S63: taking a prize must not displace the captain",
);

// A prize leaves no wreck behind: the player has the hull.
const wrecks = await sea.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
  const world = game?.world ? JSON.parse(game.world) : null;
  return world ? world.encounters.filter((e) => e.type === "wreck").length : 0;
});
check(wrecks === 0, `S63: a captured hull must not also leave a wreck, found ${wrecks}`);

const prizeShip = await sea.evaluate(() => {
  const stored = JSON.parse(localStorage.getItem("barcos:fleet:v1"));
  const found = stored.ships.find((ship) => ship.captured);
  return found ? { value: found.paidGold, guns: found.batteries.reduce((n, b) => n + b.qty, 0) } : null;
});
check(prizeShip?.guns > 0, "S63: the prize should come across with her guns");
check(
  prizeShip?.value === shipValue({ hullId: "galeon-guerra" }),
  "S63: a prize is worth her catalogue hull, since nothing was paid for her",
);

await sea.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: a hull sells for ${expectedSpare} (${JSON.stringify({ before, after })}), the last hull is refused, and a struck galleon joins the fleet with her guns`,
);
