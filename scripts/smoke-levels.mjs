import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";

/**
 * S140: levels, end to end in the browser.
 *
 * User request (verbatim): "vamos a hacer niveles, cuando se reinicia, aparecen una serie
 * de enemigos, cuando conseguimos undir o capturar todos, pasamos al siguiente nivel y
 * aparecen mas barcos enemigos que la primera vez, el nivel aparece en el header de los
 * astilleros".
 *
 * What is proven here, through the UI and the saves only:
 *   1. a fresh game shows "Nivel 1" in the header of the shipyard;
 *   2. the sea holds exactly three enemies, which is level 1's quota;
 *   3. sinking every one of them advances the level to 2 and seeds five enemies;
 *   4. the level survives a reload, because it lives in the sea save.
 */

const runtime = toRuntimeShip(
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
    12000,
  ),
  { name: "Capitana" },
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

/* ------------------------------------------------- 1: a fresh game opens at level 1 */

const yard = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
attach(yard);
await yard.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await yard.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("barcos:lang:v1", "es");
});
await yard.reload({ waitUntil: "networkidle" });
await yard.waitForTimeout(300);

const chip = () => yard.locator("#brand-level").textContent();
check((await yard.locator("#brand-level").count()) === 1, "S140: the header has no #brand-level chip");
check(/nivel\s*1/i.test(await chip()), `S140: a fresh game must show Nivel 1, the chip reads "${await chip()}"`);
// The chip is next to the yard's name and not inside a room, so every tab shows it.
const nextToTitle = await yard.evaluate(() => {
  const level = document.querySelector("#brand-level");
  const title = document.querySelector("#brand-yard");
  return Boolean(level && title && level.parentElement === title.parentElement);
});
check(nextToTitle, "S140: the level chip must sit next to the yard's name");
for (const room of ["flota", "astillero", "mercado", "configuracion", "comprar"]) {
  await yard.click(`.screen-tab[data-screen="${room}"]`);
  const visible = await yard.locator("#brand-level").isVisible();
  check(visible, `S140: the level chip is not visible in the ${room} tab`);
  check(/nivel\s*1/i.test(await chip()), `S140: the chip left level 1 in the ${room} tab`);
}
await yard.close();

/* ------------------------------------------------- 2: the sea holds level 1's quota */

const sea = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: "es-AR" });
attach(sea);
await sea.addInitScript(
  ([shipJson]) => {
    if (localStorage.getItem("barcos:fleet:v1")) return;
    const ship = JSON.parse(shipJson);
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000 }));
  },
  [JSON.stringify(runtime)],
);
await sea.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await sea.waitForTimeout(700);

/** The sea saves on a timer; every read flushes it first. */
const flush = () => sea.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
const savedSea = async () => {
  await flush();
  return sea.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
    return game?.world ? JSON.parse(game.world) : null;
  });
};

const first = await savedSea();
const enemiesOf = (world) => (world?.encounters ?? []).filter((entry) => entry.type === "enemy");
check(first?.level === 1, `S140: a fresh sea must be level 1, the save says ${first?.level}`);
check(enemiesOf(first).length === 3, `S140: level 1 holds three enemies, the sea holds ${enemiesOf(first).length}`);
check(
  (first?.levelEnemies ?? []).length === 3,
  `S140: the sea save must carry the level's quota, it carries ${(first?.levelEnemies ?? []).length}`,
);
await sea.close();

/* ------------------------------------------------- 3: clearing advances to level 2 */

const fight = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: "es-AR" });
attach(fight);
// A sea on level 1 whose three sails have already gone down: the clear is what this part
// watches, not the gunnery (that is smoke-combat.mjs).
const sunk = (id) => ({
  id,
  type: "enemy",
  x: 210 + id * 40,
  y: 470,
  hullId: "patache",
  zoneId: "costera",
  drift: { heading: 0, speedKn: 1 },
  level: 1,
  combat: {
    status: "sunk",
    condition: { hull: 0, rigging: 60, crew: 0, morale: 10 },
    crew: { marino: 0, artillero: 0, soldado: 0 },
    initialCrew: 10,
    pieces: [],
  },
});
const clearedWorld = {
  v: 1,
  seed: 424242,
  rngState: 424242,
  nextId: 950,
  gold: 0,
  timeS: 0,
  level: 1,
  // S150: a level is cleared by victories, so the save carries the count. The player chose
  // "Por cantidad de victorias" (verbatim); level 1 asks for three.
  levelVictories: 3,
  levelEnemies: [901, 902, 903],
  ship: { x: 210, y: 70, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  escorts: [],
  encounters: [sunk(901), sunk(902), sunk(903)],
};
await fight.addInitScript(
  ([shipJson, worldJson]) => {
    if (localStorage.getItem("barcos:fleet:v1")) return;
    const ship = JSON.parse(shipJson);
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify(runtime), JSON.stringify(clearedWorld)],
);
await fight.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await fight.waitForTimeout(1200);

const flushFight = () => fight.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
const next = await (async () => {
  await flushFight();
  return fight.evaluate(() => {
    const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
    return game?.world ? JSON.parse(game.world) : null;
  });
})();
const nextEnemies = enemiesOf(next);
check(next?.level === 2, `S150: reaching the victories must advance the level, the save says ${next?.level}`);
check(next?.levelVictories === 0, `S150: the new level starts at no victories, it carries ${next?.levelVictories}`);
check(nextEnemies.length === 5, `S150: level 2 holds five enemies, the sea holds ${nextEnemies.length}`);
check(
  (next?.levelEnemies ?? []).length === 5,
  `S150: the next quota must be seeded, it holds ${(next?.levelEnemies ?? []).length}`,
);
// The banner names the new level (S140-G). It waits its turn behind the banner of the
// fights that cleared the level, so it is polled instead of read once.
const bannerShows = async (pattern, timeoutMs = 12_000) => {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const text = await fight.locator("#banner").textContent();
    if (pattern.test(text ?? "")) return text;
    await fight.waitForTimeout(200);
  }
  return await fight.locator("#banner").textContent();
};
const banner = await bannerShows(/nivel\s*2/i);
check(/nivel\s*2/i.test(banner ?? ""), `S150: the advance must be announced, the banner reads "${banner}"`);
await fight.close();

/* --------------------- 3b: a captain who never fires a shot never advances (S150) */

// The reported bug (verbatim): "los barcos enemigos siguen apareciendo con el tiempo sin
// ningun limite". Before S150 the level advanced when its sails vanished from `encounters`,
// and a sail that merely drifted past `despawnRadiusM` vanished: the captain climbed levels
// without winning a single fight while the sea kept filling.
//
// The sea is seeded with the sails a fresh level 1 has, exactly the scenario of the report,
// so the sails that drift out of range are real sails and not an empty sea.
const idle = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: "es-AR" });
attach(idle);
const idleSail = (id) => ({
  id,
  type: "enemy",
  x: 210 + id * 120,
  y: 900,
  hullId: "patache",
  zoneId: "costera",
  drift: { heading: Math.PI / 2, speedKn: 2 },
  level: 1,
});
const idleWorld = {
  v: 1,
  seed: 424242,
  rngState: 424242,
  nextId: 950,
  gold: 0,
  timeS: 0,
  level: 1,
  levelVictories: 0,
  levelEnemies: [901, 902, 903],
  ship: { x: 210, y: 70, heading: 0, currentSpeedKn: 0, speedKn: runtime.speedKn },
  escorts: [],
  encounters: [idleSail(901), idleSail(902), idleSail(903)],
};
await idle.addInitScript(
  ([shipJson, worldJson]) => {
    if (localStorage.getItem("barcos:fleet:v1")) return;
    const ship = JSON.parse(shipJson);
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify(runtime), JSON.stringify(idleWorld)],
);
await idle.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
// Long enough for sails to drift past the despawn radius several times over, which is what
// used to empty the level. The captain never fires a shot.
await idle.waitForTimeout(9000);
await idle.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
const idled = await idle.evaluate(() => {
  const game = JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null");
  return game?.world ? JSON.parse(game.world) : null;
});
check(idled?.level === 1, `S150: an idle captain must stay on level 1, the save says ${idled?.level}`);
check(
  (idled?.levelVictories ?? 0) === 0,
  `S150: an idle captain has no victories, the save says ${idled?.levelVictories}`,
);
const idledEnemies = enemiesOf(idled);
check(
  idledEnemies.length <= 3,
  `S150: level 1 caps the costera at three sails, the sea holds ${idledEnemies.length}`,
);
await idle.close();

/* ------------------------------------------------- 4: the level survives a reload */

const reload = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
attach(reload);
await reload.addInitScript(
  ([shipJson, worldJson]) => {
    if (localStorage.getItem("barcos:fleet:v1")) return;
    const ship = JSON.parse(shipJson);
    localStorage.setItem("barcos:lang:v1", "es");
    localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships: [ship], captainId: ship.id }));
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
  },
  [JSON.stringify(runtime), JSON.stringify({ ...clearedWorld, level: 2, levelEnemies: [950, 951, 952, 953, 954] })],
);
await reload.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await reload.waitForTimeout(400);
const reloadedChip = await reload.locator("#brand-level").textContent();
check(
  /nivel\s*2/i.test(reloadedChip ?? ""),
  `S140: the level must survive a reload, the chip reads "${reloadedChip}"`,
);
// S150: the tooltip names the victories the level asks for, not "sink every enemy",
// because that instruction stopped being the rule.
const reloadedTitle = await reload.locator("#brand-level").getAttribute("title");
check(
  /5 victorias/i.test(reloadedTitle ?? ""),
  `S150: the chip must name the victories level 2 asks for, it reads "${reloadedTitle}"`,
);
await reload.close();

/* ------------------------------------------------- the report */

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
await browser.close();

if (failures.length) {
  for (const failure of failures) console.error(`✖ ${failure}`);
  process.exit(1);
}
console.log("✔ S140/S150: levels — a fresh sea is level 1 with 3 sails, the victories advance to level 2 with 5, an idle captain never advances, and the level survives a reload");
