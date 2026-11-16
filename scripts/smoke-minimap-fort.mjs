import assert from "node:assert/strict";
import { chromium } from "playwright";
import { buildShip, toRuntimeShip } from "../src/model/shipyard.js";
import { SHIPYARDS } from "../src/data/naval-data.js";
import { WORLD } from "../src/model/world.js";

/**
 * Browser smoke for the shipyard on the minimap (S123). Needs the local server on 8765.
 *
 * The pendiente this closes: the yard fights for real — she has guns, a garrison, she can
 * be taken and retaken — but on the chart she was only the ring of the port. The player
 * could not tell whether she was ours, whether she was under siege, or how much fight the
 * occupiers had left, without sailing home to look.
 *
 * Three states are pinned, read off the minimap pixels:
 *   ours        the yard's mark is the harbour colour and there is no bar over her;
 *   taken       the mark turns hostile and her garrison bar appears;
 *   half beaten the bar is drawn as long as the garrison left, so a siege shows progress.
 */

const ship = toRuntimeShip(
  buildShip(
    {
      hullId: "galeon-pequeno",
      batteries: [
        { pieceId: "minion", qty: 2, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
        { pieceId: "minion", qty: 2, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      ],
      crew: { marino: 34, artillero: 10, soldado: 26 },
      days: 45,
      cargoKg: 0,
      ballastKg: 0,
      equipmentKg: 0,
      reserveKg: 0,
    },
    12000,
  ),
  { name: "Capitana" },
);

const fleet = { v: 1, ships: [ship], captainId: ship.id };
const home = SHIPYARDS.find((yard) => yard.home);
const scale = 79 / WORLD.radiusM; // (MINIMAP_RADIUS - 6) / WORLD.radiusM in sea.js

/**
 * The yard sits at the centre of the chart, so the mark is the middle of the canvas and
 * the garrison bar is the strip right above it: 46 × 6 screen pixels, lifted 9.
 */
const barWindow = (size) => {
  const center = size / 2;
  return { x0: center - 30, x1: center + 30, y0: center - 20, y1: center - 2 };
};

const browser = await chromium.launch();
try {
  const read = async (fort, size = 170) => {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, locale: "es-AR" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const world = {
      v: 1,
      seed: 777,
      rngState: 777,
      nextId: 900,
      gold: 0,
      timeS: 0,
      ship: { x: 300, y: 0, heading: Math.PI, currentSpeedKn: 0, speedKn: ship.speedKn },
      encounters: [],
    };
    await page.addInitScript(
      ({ fleet, world, fort }) => {
        if (sessionStorage.getItem("seeded")) return;
        sessionStorage.setItem("seeded", "1");
        localStorage.setItem("barcos:lang:v1", "es");
        localStorage.setItem("barcos:fleet:v1", JSON.stringify(fleet));
        localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 5000, world: JSON.stringify(world), fort }));
      },
      { fleet, world, fort },
    );
    await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
    await page.waitForTimeout(700);

    const pixels = await page.evaluate((window) => {
      const canvas = document.querySelector("#minimap");
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const seen = new Map();
      let hostile = 0;
      let bar = 0;
      for (let y = window.y0; y <= window.y1; y += 1) {
        for (let x = window.x0; x <= window.x1; x += 1) {
          const i = (y * canvas.width + x) * 4;
          const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
          if (data[i] === 208 && data[i + 1] === 80 && data[i + 2] === 60) bar += 1;
        }
      }
      // The yard's own mark, straight at the centre of the chart.
      const c = Math.floor(canvas.width / 2);
      const ci = (c * canvas.width + c) * 4;
      const mark = `${data[ci]},${data[ci + 1]},${data[ci + 2]}`;
      return { mark, barPixels: bar, seen: [...seen.keys()] };
    }, barWindow(size));

    await page.close();
    return { ...pixels, errors };
  };

  /* ------------------------------------------------------------ ours: no bar at all */

  const ours = await read({ status: "fighting", condition: { hull: 100, crew: 100 } });
  assert.equal(ours.mark, "169,149,95", `an open yard is the harbour colour: ${ours.mark}`);
  assert.equal(ours.barPixels, 0, `an open yard has no garrison bar over her: ${ours.barPixels} px`);

  /* ---------------------------------------- taken: hostile mark and a garrison bar */

  const taken = await read({
    status: "surrendered",
    condition: { hull: 0, crew: 100 },
    occupation: { condition: { hull: 100, crew: 100 }, crew: { soldado: 40 }, initialCrew: 40 },
  });
  assert.equal(taken.mark, "208,80,60", `a taken yard turns hostile on the chart: ${taken.mark}`);
  assert.ok(taken.barPixels > 0, "a taken yard shows the fight her occupiers have left");
  const fullGarrison = taken.barPixels;

  /* ------------------------------- half beaten: the bar is as long as the garrison left */

  const half = await read({
    status: "surrendered",
    condition: { hull: 0, crew: 100 },
    occupation: { condition: { hull: 100, crew: 50 }, crew: { soldado: 20 }, initialCrew: 40 },
  });
  assert.ok(
    half.barPixels > 0 && half.barPixels < fullGarrison * 0.75,
    `half the garrison is a visibly shorter bar: ${half.barPixels} px against ${fullGarrison}`,
  );

  // The scale constant above is what the bar is sized with: keep it honest against the
  // chart the screen actually draws.
  assert.ok(scale > 0 && Number.isFinite(scale), "the chart scale is readable");

  for (const [name, state] of [["ours", ours], ["taken", taken], ["half", half]]) {
    assert.deepEqual(state.errors, [], `${name} threw: ${state.errors.join(" | ")}`);
  }

  console.log(
    `smoke-minimap-fort OK — ours ${ours.barPixels} px, taken ${fullGarrison} px, half ${half.barPixels} px`,
  );
} finally {
  await browser.close();
}
