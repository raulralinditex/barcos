import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { ESCORT } from "../src/model/formation.js";

/**
 * Browser smoke for retaking a shipyard the enemy holds (S93, S94). Needs the server on 8765.
 *
 * Before this rule the game had no way back: once the yard struck, `status` only travelled
 * one way and the port stayed shut for the rest of the save. The rule is that the player
 * breaks the garrison the enemy left in her.
 *
 * Pinned here, through the screen and the save the game itself writes:
 *   - a legacy save (yard taken, no occupation recorded) is given one on boot;
 *   - the yard reads as a hostile in the duel panel, with the occupiers' garrison;
 *   - firing on her wears the occupiers down and never touches her own hull;
 *   - when the garrison breaks she is ours again and the port reopens;
 *   - a half-broken occupation survives a reload half-broken.
 *
 * Geometry matters and is not incidental: `sideForBearing` puts a target dead ahead or
 * dead astern in no beam at all, so the fixture seeds the captain with the yard exactly on
 * her beam (heading -PI/2 from (300, 0)). The sea also discards a saved world whose
 * `speedKn` disagrees with the hull's by a knot or more, so the fixture seeds the real one;
 * without that the seeded position is thrown away and the test measures a fresh sea.
 */

const buildCaptain = () => {
  const batteries = [];
  for (const side of ["babor", "estribor"]) {
    batteries.push({ pieceId: "minion", qty: 8, side, shotsPerPiece: 60, ammoId: "bala-hierro" });
  }
  return toRuntimeShip(
    buildShip({
      hullId: "galeon-pequeno",
      batteries,
      crew: { marino: 40, artillero: 20, soldado: 20 },
      days: 45, cargoKg: 2000, ballastKg: 2000, equipmentKg: 1000, reserveKg: 1000,
    }, 12000),
    { name: "Golden Hind" },
  );
};

const captain = buildCaptain();
const fleet = { v: 1, captainId: captain.id, ships: [captain] };

/**
 * The yard held by the enemy, with her occupying garrison just above the surrender
 * threshold (43 % of 68 men, threshold 40). Retaking a fortress from full strength is
 * dozens of broadsides on the sea clock — measured, 45 with a mid-sized battery — which is
 * not what this smoke is for: the rule under test is the hand-over, and the siege itself is
 * pinned by the model's own tests. Below the threshold she would already be ours on boot.
 */
const held = (crew = 43) => ({
  condition: { hull: 70, rigging: 100, crew: 20, morale: 100 },
  crew: { marino: 0, artillero: 2, soldado: 6 },
  status: "surrendered",
  occupation: {
    condition: { hull: 100, rigging: 100, crew, morale: 100 },
    // The roster has to agree with the condition: `damageOccupiedFort` recomputes the
    // share from the men who are actually aboard, so a roster of 41 of 68 men with a
    // condition of 43 % is not a state the model can hold — the first volley "healed" her.
    crew: { marino: 0, artillero: 12, soldado: 17 },
    initialCrew: 68,
    crewDamagePool: 0,
  },
});

const seaWorld = (ship) => ({
  v: 1, seed: 4242, rngState: 4242, nextId: 900, gold: 0, timeS: 0,
  ship: { x: 300, y: 0, heading: -Math.PI / 2, currentSpeedKn: 0, speedKn: ship.speedKn },
  encounters: [],
});

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

/* ---------------------------------------------------------------- legacy save */

const legacy = await browser.newPage({ viewport: { width: 1200, height: 800 }, locale: "es-AR" });
legacy.on("pageerror", (e) => errors.push(`legacy pageerror: ${e.message}`));
await legacy.addInitScript(([f, ship, w]) => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", f);
  // A save written before this rule: the yard is taken and no occupiers were recorded.
  localStorage.setItem("barcos:game:v1", JSON.stringify({
    gold: 5000, victories: 0, world: JSON.stringify(w),
    fort: { condition: { hull: 70, rigging: 100, crew: 20, morale: 100 }, crew: { marino: 0, artillero: 2, soldado: 6 }, status: "surrendered" },
  }));
}, [JSON.stringify(fleet), captain, seaWorld(captain)]);
await legacy.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await legacy.waitForTimeout(4000);
const legacySave = await legacy.evaluate(() => {
  const g = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return { has: Boolean(g.fort?.occupation), crew: g.fort?.occupation?.condition?.crew ?? null };
});
check(legacySave.has, "S93: a legacy save with a taken yard was never given an occupying garrison");
check(legacySave.crew === 100, `S93: the occupiers should start whole, they read ${legacySave.crew}`);
await legacy.close();

/* ---------------------------------------------------------------- the retake */

const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, locale: "es-AR" });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.addInitScript(([f, f0, ship, w]) => {
  // `addInitScript` runs on EVERY navigation, reloads included. Without this guard the
  // reload below would re-seed the yard as held and the test would read its own fixture
  // instead of what the game saved.
  if (sessionStorage.getItem("seeded")) return;
  sessionStorage.setItem("seeded", "1");
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:fleet:v1", f);
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, fort: f0, victories: 0, world: JSON.stringify(w) }));
}, [JSON.stringify(fleet), held(), captain, seaWorld(captain)]);
await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
// The sea autosaves every 3 s; the seeded world is only readable once the first write lands.
await page.waitForTimeout(4000);

const start = await page.evaluate(() => {
  const g = JSON.parse(localStorage.getItem("barcos:game:v1"));
  const w = JSON.parse(g.world);
  return { hull: g.fort?.condition?.hull, crew: g.fort?.occupation?.condition?.crew, status: g.fort?.status,
           x: Math.round(w.ship.x), y: Math.round(w.ship.y) };
});
check(start.x === 300 && start.y === 0, `S93: the seeded sea was discarded (captain at ${start.x},${start.y})`);
check(start.status === "surrendered", `S93: the fixture should start with the yard held, status is ${start.status}`);

// The yard must read as a hostile, with her garrison, not as one of ours.
const roster = await page.evaluate(() =>
  [...document.querySelectorAll(".duel-row")].map((r) => ({
    side: r.className.includes("is-theirs") ? "theirs" : "ours",
    text: r.textContent.trim(),
  })));
check(
  roster.some((r) => r.side === "theirs" && /astillero|shipyard/i.test(r.text)),
  `S93: the held yard should be a hostile in the duel panel, roster is ${JSON.stringify(roster)}`,
);

// Fire until the occupiers break. The battery reloads on its own clock, so this is a
// matter of waiting as much as shooting.
for (let i = 0; i < 3; i += 1) await page.keyboard.press("t");
let retaken = false;
let sawOccupiersWeaken = false;
for (let i = 0; i < 160 && !retaken; i += 1) {
  // Both beams: the sea drifts and turns the hull, so which beam bears changes.
  await page.keyboard.press("q");
  await page.keyboard.press("e");
  await page.waitForTimeout(500);
  const now = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem("barcos:game:v1"));
    const w = JSON.parse(g.world);
    return { status: g.fort?.status, crew: g.fort?.occupation?.condition?.crew ?? null,
             hull: g.fort?.condition?.hull,
             at: [Math.round(w.ship.x), Math.round(w.ship.y)], h: +(w.ship.heading || 0).toFixed(2) };
  });
  if (now.crew !== null && now.crew < 43) sawOccupiersWeaken = true;
  check(now.hull === start.hull, `S93: the yard's own hull moved while she was held (${start.hull} -> ${now.hull})`);
  retaken = now.status === "fighting";
}

const after = await page.evaluate(() => {
  const g = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return { status: g.fort?.status, hull: g.fort?.condition?.hull, crew: g.fort?.condition?.crew,
           banner: document.querySelector("#banner")?.textContent?.trim() ?? "" };
});
check(sawOccupiersWeaken, "S93: firing on a taken yard never wore the occupiers down");
check(retaken, `S93: the yard was never retaken (status ${after.status})`);
check(after.hull === start.hull, `S94: retaking her rebuilt the hull (${start.hull} -> ${after.hull})`);
if (retaken) {
  check(
    after.crew > 40,
    `S94: a retaken yard must not re-surrender on the next refresh, garrison is ${after.crew}`,
  );
  check(/recuperad|retaken/i.test(after.banner), `S93: retaking her should be announced, banner says "${after.banner}"`);
}

/* ---------------------------------------------------------------- survives a reload */

await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(4000);
const reloaded = await page.evaluate(() => {
  const g = JSON.parse(localStorage.getItem("barcos:game:v1"));
  return { status: g.fort?.status, hull: g.fort?.condition?.hull };
});
check(reloaded.status === "fighting", `S93: the retaken yard did not survive a reload (status ${reloaded.status})`);
check(reloaded.hull === start.hull, `S94: the reload changed her hull (${start.hull} -> ${reloaded.hull})`);

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`SMOKE OK: a legacy save gets its occupiers, the held yard reads as a hostile, firing breaks her garrison without touching her hull, and she comes back ours with ${Math.round(after.crew)} % crew`);
