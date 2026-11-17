import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { GAME_TIME } from "../src/model/game-time.js";

/**
 * Browser smoke for the per-hull crew supply (S132).
 *
 * The rule: every hull at sea burns her own reserve, seeded from her own `days` of
 * provisions, so a captain with 45 days and an escort with 20 days end the same stretch
 * of sea time on different reserves — the escort's lower. The panel shows the squadron
 * figure (the worst hull, plus how many are at zero), and the hull that reaches zero
 * raises a banner naming her.
 *
 * Measured against the model, not against a magic number: the expected reserves come from
 * the same `days` the shipyard sells and the same day length the sea charges.
 */

const dayLength = 10;
GAME_TIME.gameSecondsPerDay = dayLength;

const build = (hullId, name, days) =>
  toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries: [
          { pieceId: "minion", qty: 1, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 1, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days,
        cargoKg: 0,
        ballastKg: 0,
        equipmentKg: 0,
        reserveKg: 0,
      },
      12000,
    ),
    { name },
  );

const captain = { ...build("galeon-pequeno", "Capitana", 45), yardId: null };
const escort = { ...build("barca-costera", "Escolta", 20), yardId: null };
const fleet = { v: 1, ships: [captain, escort], captainId: captain.id };

const world = {
  v: 1,
  seed: 2026132,
  rngState: 2026132,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 1200, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captain.speedKn },
  encounters: [],
};

const browser = await chromium.launch();
const failures = [];
const errors = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, locale: "es-AR" });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

  // A save written before the rule: one single reserve for the whole squadron, no map.
  await page.addInitScript(({ fleet, world, dayLength }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:settings:v1", JSON.stringify({ "time.gameSecondsPerDay": dayLength }));
    localStorage.setItem("barcos:fleet:v1", JSON.stringify(fleet));
    localStorage.setItem(
      "barcos:game:v1",
      JSON.stringify({ gold: 50000, supplyLeftS: 45 * dayLength, world: JSON.stringify(world) }),
    );
  }, { fleet, world, dayLength });

  const readSave = () =>
    page.evaluate(() => {
      window.dispatchEvent(new Event("beforeunload"));
      const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
      const text = (id) => document.querySelector(id)?.textContent?.trim() ?? "";
      return {
        reserves: game?.supplyByHull ?? null,
        supplyLeftS: game?.supplyLeftS ?? null,
        days: text("#voyage-days"),
        worst: text("#voyage-worst"),
        dry: text("#voyage-dry"),
        panel: document.querySelector("#voyage-panel")?.textContent ?? "",
      };
    });

  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await page.waitForFunction(() => Boolean(document.querySelector("#voyage-panel")), null, { timeout: 8000 });
  await page.waitForTimeout(3600); // one autosave round

  /* -------------------------- S132 / S-E: the old single reserve seeds the captain */

  const seeded = await readSave();
  check(Boolean(seeded.reserves), "S132: the sea save carries a per-hull reserve map");
  if (seeded.reserves) {
    check(
      seeded.reserves[captain.id] > 0 && seeded.reserves[captain.id] <= 45 * dayLength,
      `S132: the old single 45-day reserve loads onto the captain, reads ${seeded.reserves[captain.id]}`,
    );
    check(
      seeded.reserves[escort.id] > 0 && seeded.reserves[escort.id] <= 20 * dayLength,
      `S132: the escort seeds from her own 20 days, reads ${seeded.reserves[escort.id]}`,
    );
    check(
      seeded.reserves[escort.id] < seeded.reserves[captain.id],
      `S132: the 20-day escort must start below the 45-day captain, ${seeded.reserves[escort.id]} vs ${seeded.reserves[captain.id]}`,
    );
  }

  /* -------------------------------------- S132: sea time charges each hull her own */

  await page.keyboard.press("t");
  await page.keyboard.press("t");
  await page.keyboard.press("t"); // ×8
  const firstDays = Number(seeded.days);
  await page.waitForFunction(
    (target) => Number(document.querySelector("#voyage-days")?.textContent) < target,
    firstDays,
    { timeout: 25000 },
  );
  const spent = await readSave();
  if (spent.reserves && seeded.reserves) {
    check(
      spent.reserves[captain.id] < seeded.reserves[captain.id],
      `S132: the captain burns her own reserve, ${seeded.reserves[captain.id]} -> ${spent.reserves[captain.id]}`,
    );
    check(
      spent.reserves[escort.id] < seeded.reserves[escort.id],
      `S132: the escort burns her own reserve, ${seeded.reserves[escort.id]} -> ${spent.reserves[escort.id]}`,
    );
    check(
      spent.reserves[escort.id] < spent.reserves[captain.id],
      `S132: the escort must stay lower than the captain, ${spent.reserves[escort.id]} vs ${spent.reserves[captain.id]}`,
    );
  }

  /* ------------------------------------- S132 / S-D: the panel shows the squadron */

  check(Boolean(spent.worst), "S132: the panel names the shortest hull");
  check(
    spent.worst === "Escolta",
    `S132: the panel must name the worst hull, the 20-day escort, reads "${spent.worst}"`,
  );
  check(spent.dry === "0", `S132: no hull is dry yet, the panel reads "${spent.dry}"`);
  const worstDays = Math.ceil(Number(spent.reserves?.[escort.id]) / dayLength);
  check(
    spent.days === String(worstDays),
    `S132: the panel days are the worst hull's ${worstDays}, reads "${spent.days}"`,
  );
  check(spent.panel.includes("Suministros"), "S132: the panel keeps its Spanish label");

  /* ------------------------- S132 / S-C: the hull that runs dry is named in the banner */

  // A fresh page (its own storage) opens with the escort nearly out of provisions: her own
  // reserve is what runs out while the captain's stays full, and the warning must name her
  // and the shipyard. The save cannot be rewritten from the running page: its `beforeunload`
  // autosave would overwrite the edit on reload.
  await page.close();
  const dryPage = await browser.newPage({ viewport: { width: 1500, height: 900 }, locale: "es-AR" });
  dryPage.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  dryPage.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await dryPage.addInitScript(({ fleet, world, dayLength, captainId, escortId }) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:settings:v1", JSON.stringify({ "time.gameSecondsPerDay": dayLength }));
    localStorage.setItem("barcos:fleet:v1", JSON.stringify(fleet));
    localStorage.setItem(
      "barcos:game:v1",
      JSON.stringify({
        gold: 50000,
        supplyLeftS: 45 * dayLength,
        supplyByHull: { [captainId]: 45 * dayLength, [escortId]: dayLength * 0.5 },
        world: JSON.stringify(world),
      }),
    );
  }, { fleet, world, dayLength, captainId: captain.id, escortId: escort.id });

  await dryPage.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  await dryPage.waitForFunction(() => Boolean(document.querySelector("#voyage-panel")), null, { timeout: 8000 });

  const banner = await dryPage
    .waitForFunction(
      () => {
        const node = document.querySelector("#banner");
        if (!node || !node.classList.contains("is-visible")) return null;
        const text = node.textContent ?? "";
        return text.includes("Escolta") && text.includes("astillero") ? text : null;
      },
      null,
      { timeout: 30000, polling: 50 },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  check(Boolean(banner), "S132: a hull reaching zero must raise a banner naming her and the shipyard");

  const dry = await dryPage.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    const game = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const text = (id) => document.querySelector(id)?.textContent?.trim() ?? "";
    return {
      reserves: game?.supplyByHull ?? null,
      dry: text("#voyage-dry"),
      worst: text("#voyage-worst"),
    };
  });
  check(dry.reserves?.[escort.id] === 0, `S132: the escort's reserve is spent, reads ${dry.reserves?.[escort.id]}`);
  check(Number(dry.reserves?.[captain.id]) > 0, `S132: the captain is still supplied, reads ${dry.reserves?.[captain.id]}`);
  check(dry.dry === "1", `S132: the panel counts one hull at zero, reads "${dry.dry}"`);
  check(dry.worst === "Escolta", `S132: the dry escort is the worst hull, reads "${dry.worst}"`);
  await dryPage.close();
} catch (error) {
  errors.push(error.stack ?? String(error));
} finally {
  await browser.close();
}

console.log(JSON.stringify({ failures, errors }, null, 2));
process.exit(failures.length || errors.length ? 1 : 0);
