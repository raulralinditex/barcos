import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { dangerValue } from "../src/model/danger.js";
import { createPlayerCombatant } from "../src/model/combat.js";

/**
 * S142: the danger number of a hull, driven through the UI only. Needs the local server
 * on 8765.
 *
 * The player asked for it (verbatim): "vamos a valorar los buques a la hora de la batalla
 * para poderlos comparar, calcularemos un valor segun sus propiedades que cuando comparemos
 * ese valor entre dos buques, el mayor tendra mas probabilida...". His decisions (verbatim):
 * "Sólo informativo: se muestra y no cambia el combate"; the properties are "Estado vivo
 * (casco, aparejo, tripulación)", "Artillería y munición" and "Tamaño, velocidad y maniobra";
 * it is seen in the "Panel de combate y sobre cada barco en el mar".
 *
 * What is proven here:
 *   1. the number is in the duel panel, on our row AND on the enemy's row;
 *   2. the number is painted over the ship at sea, next to her condition bars;
 *   3. the Configuración check exists, ships ON, and turning it off hides both numbers;
 *   4. the number drops when the hull is damaged, so it is a live reading, not a snapshot.
 */

const build = (hullId, name, condition = null) => {
  const runtime = toRuntimeShip(
    buildShip(
      {
        hullId,
        batteries: [
          { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "falcon", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
          { pieceId: "falcon", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        ],
        crew: { marino: 34, artillero: 10, soldado: 26 },
        days: 45,
        cargoKg: 6_000,
        ballastKg: 3_000,
        equipmentKg: 2_500,
        reserveKg: 1_500,
      },
      12_000,
    ),
    { name },
  );
  if (condition) {
    runtime.condition = condition;
    runtime.crewAlive = { marino: 24, artillero: 7, soldado: 18 };
  }
  return runtime;
};

/** The danger the panel should read, computed by the model the screen reads. */
const expectedDanger = (runtime) => dangerValue(createPlayerCombatant(runtime));

const captain = build("galeon-pequeno", "Golden Hind");
const hurtCaptain = build("galeon-pequeno", "Golden Hind", { hull: 50, rigging: 48, crew: 71, morale: 100 });

const enemy = {
  id: 901,
  type: "enemy",
  hullId: "patache",
  x: 0,
  y: 300,
  heading: 0,
  currentSpeedKn: 0,
  drift: { heading: 0, speedKn: 0 },
};

const seaWorld = (captainRuntime) => ({
  v: 1,
  seed: 7,
  rngState: 7,
  nextId: 900,
  gold: 0,
  timeS: 0,
  ship: { x: 0, y: 0, heading: 0, currentSpeedKn: 0, speedKn: captainRuntime.speedKn },
  encounters: [enemy],
});

const browser = await chromium.launch();
const failures = [];
const errors = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

/**
 * Open the sea with the given captain and settings. `settings` is the stored blob, so the
 * switch under test is the one the screen would have written.
 */
const openSea = async (captainRuntime, settings = null) => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.addInitScript(
    ([fleetJson, worldJson, settingsJson]) => {
      localStorage.setItem("barcos:lang:v1", "es");
      localStorage.setItem("barcos:autofire:v1", "0");
      localStorage.setItem("barcos:fleet:v1", fleetJson);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: worldJson }));
      // Automatic fire off, so the enemy is still afloat when the panel is read: the
      // danger number is what this smoke measures, not the fight.
      localStorage.setItem(
        "barcos:settings:v1",
        JSON.stringify({ ...JSON.parse(settingsJson ?? "{}"), "combat.autofire": 0 }),
      );
    },
    [
      JSON.stringify({ v: 1, captainId: captainRuntime.id, ships: [captainRuntime] }),
      JSON.stringify(seaWorld(captainRuntime)),
      settings,
    ],
  );
  await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
  // The sea animates on requestAnimationFrame, which a background tab throttles: bring
  // her to the front so the fight actually starts while the smoke waits for it.
  await page.bringToFront();
  // The enemy's combat entity is built lazily, on the frame she is first in gunshot, so
  // the panel fills in a moment after the page does. Poll from here instead of inside the
  // page: a throttled frame timer must not fail the wait.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if ((await page.locator(".duel-row").count()) >= 2) break;
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(400);
  return page;
};

/** The danger numbers the duel panel paints, per side. */
const panelDanger = (page) =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll(".duel-row")];
    return rows.map((row) => ({
      side: row.classList.contains("is-ours") ? "ours" : "theirs",
      name: row.querySelector(".duel-name")?.textContent ?? "",
      danger: row.querySelector(".duel-danger")?.textContent ?? null,
    }));
  });

/**
 * The danger badges painted on the sea canvas. The badge is a box of `BAR.danger`
 * (#bfe3c9) with the number drawn in the same colour, so its pixels are found and
 * grouped into one cluster per badge: one cluster, one hull carrying a number.
 */
const dangerBadges = (page) =>
  page.evaluate(() => {
    const canvas = document.querySelector("#sea-canvas");
    const { width, height } = canvas;
    const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
    const hits = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        if (
          Math.abs(data[i] - 191) <= 3 &&
          Math.abs(data[i + 1] - 227) <= 3 &&
          Math.abs(data[i + 2] - 201) <= 3
        ) {
          hits.push({ x, y });
        }
      }
    }
    // One cluster per badge: badges of different hulls never share a 50 px cell, because
    // each is centred on its own condition block.
    const clusters = new Map();
    for (const hit of hits) {
      const key = `${Math.round(hit.x / 50)}:${Math.round(hit.y / 50)}`;
      clusters.set(key, (clusters.get(key) ?? 0) + 1);
    }
    // A handful of stray pixels is antialiasing, not a badge.
    return [...clusters.entries()]
      .filter(([, pixels]) => pixels >= 12)
      .map(([key, pixels]) => ({ key, pixels }));
  });

try {
  /* ---------------------------------------------------------------- 1. the duel panel */

  let page = await openSea(captain);
  const roster = await panelDanger(page);
  check(roster.length === 2, `the panel should list both hulls, got ${JSON.stringify(roster)}`);
  const ours = roster.find((row) => row.side === "ours");
  const theirs = roster.find((row) => row.side === "theirs");
  check(Boolean(ours), "the panel must carry our row");
  check(Boolean(theirs), "the panel must carry the enemy row");
  check(
    ours?.danger === String(expectedDanger(captain)),
    `our danger should read ${expectedDanger(captain)}, got ${JSON.stringify(ours?.danger)}`,
  );
  check(
    Number(theirs?.danger) > 0,
    `the enemy's danger must be a positive number, got ${JSON.stringify(theirs?.danger)}`,
  );
  check(
    ours?.name === "Golden Hind",
    `the number must sit next to her name, got ${JSON.stringify(ours?.name)}`,
  );

  /* ---------------------------------------------------------------- 2. over the ship at sea */

  const badges = await dangerBadges(page);
  // Two hulls in gunshot, so two badges: the captain's and the enemy's.
  check(
    badges.length >= 2,
    `the danger number must be painted over each ship at sea, found ${badges.length} badges`,
  );

  /* ---------------------------------------------------------------- 4. damage lowers it */

  const hurt = await openSea(hurtCaptain);
  const hurtRoster = await panelDanger(hurt);
  const hurtOurs = hurtRoster.find((row) => row.side === "ours");
  check(
    hurtOurs?.danger === String(expectedDanger(hurtCaptain)),
    `the damaged captain's danger should read ${expectedDanger(hurtCaptain)}, got ${JSON.stringify(hurtOurs?.danger)}`,
  );
  check(
    Number(hurtOurs?.danger) < Number(ours?.danger),
    `damage must lower the number (${hurtOurs?.danger} vs ${ours?.danger})`,
  );
  await hurt.close();

  /* ---------------------------------------------------------------- 3. the switch */

  // The check exists in Configuración, ships ON, and is a checkbox like the other switches.
  const config = await browser.newPage({ viewport: { width: 1400, height: 1100 }, locale: "es-AR" });
  config.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  config.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await config.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("barcos:lang:v1", "es");
  });
  await config.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await config.waitForTimeout(300);
  await config.click('.screen-tab[data-screen="configuracion"]');
  await config.waitForTimeout(300);
  const block = await config.locator('.settings-row[data-field-id^="danger."]').count();
  check(block > 0, "the «Peligro» block must be on the settings screen");
  check(
    (await config.locator(".settings-card h2").allTextContents()).some((name) => /Peligro/i.test(name)),
    "the danger block must be named on the screen",
  );
  const showControl = config.locator("#field-danger\\.show");
  check((await showControl.count()) === 1, "the danger switch must be on the screen");
  check(
    (await showControl.getAttribute("type")) === "checkbox",
    "the danger visibility must be a check, like the other switches",
  );
  check(await showControl.isChecked(), "the danger number must ship visible");
  await config.close();

  // Switching it off must hide both the panel number and the badge at sea.
  const hidden = await openSea(captain, JSON.stringify({ "danger.show": 0 }));
  const hiddenRoster = await panelDanger(hidden);
  check(
    hiddenRoster.every((row) => row.danger === null),
    `with the check off the panel must show no number, got ${JSON.stringify(hiddenRoster)}`,
  );
  const hiddenBadges = await dangerBadges(hidden);
  check(
    hiddenBadges.length === 0,
    `with the check off no badge may be painted at sea, found ${hiddenBadges.length}`,
  );
  await hidden.close();

  // And switching it back on brings them back, so the switch is the only difference.
  const shown = await openSea(captain, JSON.stringify({ "danger.show": 1 }));
  const shownBadges = await dangerBadges(shown);
  check(shownBadges.length >= 2, `with the check on the badges must come back, found ${shownBadges.length}`);
  await shown.close();

  await page.close();
} catch (error) {
  failures.push(`smoke threw: ${error.message}`);
}

await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the danger number is in the duel panel and over each ship at sea, configurable and live");
