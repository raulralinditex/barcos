import { chromium } from "playwright";

/**
 * S107: every friendly hull draws her own gun range, not only the captain.
 *
 * The smoke counts the arcs the sea paints around the allied hulls. Each hull draws one
 * arc per beam with a gun in it, so the captain with two loaded beams gives two, and a
 * two-beam escort adds two more.
 */

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// Instrument the canvas so the smoke can count the range arcs the sea actually strokes.
await page.addInitScript(() => {
  localStorage.setItem("barcos:lang:v1", "es");
  const mk = (id, name, sails) => ({
    id, name, hullId: "galeon-pequeno", hullName: "Galeón pequeño", sails,
    condition: { hull: 100, rigging: 100, crew: 100, morale: 100 },
    crewAlive: { marino: 34, artillero: 10, soldado: 26 },
    crew: { marino: 34, artillero: 10, soldado: 26 },
    batteries: [
      { pieceId: "minion", qty: 3, side: "babor", shotsPerPiece: 25, ammoId: "bala-hierro" },
      { pieceId: "minion", qty: 3, side: "estribor", shotsPerPiece: 25, ammoId: "bala-hierro" },
    ],
    days: 45, cargoKg: 6000, ballastKg: 3000, equipmentKg: 2500, reserveKg: 1500, speedKn: 6,
  });
  const ships = [mk("cap", "Capitana", true), mk("esc1", "Escolta Uno", true), mk("esc2", "Escolta Dos", true)];
  localStorage.setItem("barcos:fleet:v1", JSON.stringify({ v: 1, ships, captainId: "cap" }));
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 50000 }));

  // Record only the strokes the range arcs make: the sea gives them a wide line and a
  // dash pattern, while the yard anchor and the minimap use neither. Counting by radius
  // alone would count those too, which is how a smoke ends up proving nothing.
  window.__arcs = [];
  const originalArc = CanvasRenderingContext2D.prototype.arc;
  const originalStroke = CanvasRenderingContext2D.prototype.stroke;
  let pendingArc = null;
  CanvasRenderingContext2D.prototype.arc = function (x, y, r, a0, a1, ccw) {
    pendingArc = { x: Math.round(x), y: Math.round(y), r: Math.round(r) };
    return originalArc.call(this, x, y, r, a0, a1, ccw);
  };
  CanvasRenderingContext2D.prototype.stroke = function (...args) {
    // The range arcs are the only wide strokes the sea puts on an arc: the yard ring is
    // width 16 and the minimap is width 1.5, both on full circles, not on a beam arc.
    if (pendingArc && this.lineWidth >= 3 && this.lineWidth <= 10) {
      window.__arcs.push(pendingArc);
    }
    pendingArc = null;
    return originalStroke.apply(this, args);
  };
});

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const result = await page.evaluate(() => {
  const arcs = window.__arcs ?? [];
  // Range arcs are the big ones: a hull is tens of metres, the guns reach hundreds.
  const big = arcs.filter((a) => a.r > 100);
  const byOrigin = new Map();
  for (const a of big) {
    const key = `${Math.round(a.x / 40) * 40},${Math.round(a.y / 40) * 40}`;
    byOrigin.set(key, (byOrigin.get(key) ?? 0) + 1);
  }
  return {
    totalBigArcs: big.length,
    origins: [...byOrigin.values()],
    radii: [...new Set(big.map((a) => a.r))].sort((x, y) => x - y),
  };
});

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
// The captain always draws hers.
check(result.totalBigArcs >= 2, `the captain's two beams must draw arcs, saw ${result.totalBigArcs}`);
// With two escorts in the line, the arcs must come from more than one hull.
check(result.origins.length >= 2, `escorts must draw their own range, arcs came from ${result.origins.length} hull(s)`);
check(result.origins.every((n) => n >= 2), `every hull in the line should draw both beams, got counts ${result.origins.join(",")}`);
check(errors.length === 0, `console errors: ${errors.join(" | ")}`);

console.log(failures.length === 0
  ? `SMOKE OK: the captain and ${result.origins.length - 1} escorts draw their gun range (S107)`
  : `SMOKE FAILED:\n- ${failures.join("\n- ")}`);
await browser.close();
if (failures.length) process.exit(1);
