/**
 * The fog of war (S167).
 *
 * The player asked for it (verbatim): "ahora vamos a hacer niebla, todo el mapa tiene niebla y
 * no se ve ningun barco, segun van navegando tus barcos vas descubriendo el mapa, lo
 * implementamos con una flag en configuraciones niebla si o no". And when asked what is seen
 * in discovered water, she chose BOTH rules, "elegibles en la configuracion", with the reveal
 * radius "configurable, con un valor de partida".
 *
 * The rule, in one line: the sea starts dark, your ships light it as they sail, and what you
 * have seen you keep. Whether a hull in lit water is visible depends on the rule the player
 * picked — anywhere in the light, or only while close to one of her ships.
 *
 * Pure and UI-free. The screen asks; the sea only carries the record.
 */

export const FOG = {
  /**
   * Whether the fog is on at all. Off by default, so a save written before this rule keeps
   * the sea it had: everything visible, exactly as it was.
   */
  enabled: 0,
  /** How much sea one hull lights as she sails, in metres. A starting point, tunable. */
  revealRadiusM: 700,
  /**
   * Which visibility rule is in force, as the settings screen can carry it: the whole
   * settings system is numeric (S33), so the rule is a flag rather than a string.
   * 0 = `revelado` (a hull is seen anywhere in lit water), 1 = `contacto` (only while it is
   * also near one of the player's hulls). `visibilityRule` turns it into the name.
   */
  rule: 0,
  /** How near counts as contact, in metres, when the rule is `contacto`. */
  contactM: 600,
  /**
   * The side of one cell of the discovery grid, in metres. The record is a list of cells, not
   * of points: a voyage that crosses the whole sea would otherwise store thousands of
   * coordinates, and the save is written every three seconds.
   */
  cellM: 200,
};

/** Whether the fog is on. A broken or missing value is off, never on. */
export function fogEnabled(options = FOG) {
  return Number(options?.enabled) > 0;
}

/**
 * A discovery record as a list of cell keys.
 *
 * The record never claims the whole sea is known, whatever the save says. The fog is opt-in:
 * with it off nothing is hidden, so an old save loses nothing, and a player who switches it on
 * is asking to see it. Treating an old save as "fully discovered" made the switch do nothing
 * on a voyage in progress, because the first autosave wrote that record for good.
 */
export function normaliseDiscovered(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { complete: false, cells: [] };
  const cells = Array.isArray(value.cells)
    ? value.cells.filter((cell) => typeof cell === "string" && cell.length > 0)
    : [];
  return { complete: false, cells };
}

/** The grid cell a point of the sea falls in. */
export function cellOf(point, cellM = FOG.cellM) {
  const size = Number(cellM);
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(size) || size <= 0) return null;
  return `${Math.floor(x / size)}:${Math.floor(y / size)}`;
}

/**
 * The record with the cells a hull lights added to it.
 *
 * The cells are collected in a Set and handed back sorted, so the same voyage always writes
 * the same record: a save that shuffles its own bytes every three seconds is a save that
 * cannot be compared or diffed.
 */
export function revealAround(known, point, radiusM = FOG.revealRadiusM) {
  const base = normaliseDiscovered(known);
  if (base.complete) return base;
  const radius = Number(radiusM);
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return base;
  const cells = new Set(base.cells);
  const size = FOG.cellM;
  const fromX = Math.floor((x - radius) / size);
  const toX = Math.floor((x + radius) / size);
  const fromY = Math.floor((y - radius) / size);
  const toY = Math.floor((y + radius) / size);
  for (let cx = fromX; cx <= toX; cx += 1) {
    for (let cy = fromY; cy <= toY; cy += 1) {
      // The cell is lit only if some part of it is within reach: its centre is the cheap
      // test, and half a cell of slack keeps the edge from looking bitten.
      const centre = { x: cx * size + size / 2, y: cy * size + size / 2 };
      if (Math.hypot(centre.x - x, centre.y - y) <= radius + size / 2) cells.add(`${cx}:${cy}`);
    }
  }
  return { complete: false, cells: [...cells].sort() };
}

/** The record with every hull of the fleet revealing around herself. */
export function discoveredWith(known, hulls, radiusM = FOG.revealRadiusM) {
  let record = normaliseDiscovered(known);
  for (const hull of Array.isArray(hulls) ? hulls : []) {
    record = revealAround(record, hull, radiusM);
    if (record.complete) return record;
  }
  return record;
}

/** Whether a point of the sea has been discovered. */
export function isDiscovered(known, point) {
  const record = normaliseDiscovered(known);
  if (record.complete) return true;
  const cell = cellOf(point);
  return cell !== null && record.cells.includes(cell);
}

/**
 * Whether the player may see a hull, given what she knows and the rule in force.
 *
 * With the fog off nothing is hidden: that is the promise S167-A makes to every save that
 * never turns it on. With it on, a hull in the dark is never visible, and a hull in the light
 * depends on the rule the player picked.
 */
/** The visibility rule as a name: `revelado` or `contacto`. A broken value is `revelado`. */
export function visibilityRule(options = FOG) {
  const value = options?.rule;
  if (value === "contacto") return "contacto";
  if (value === "revelado") return "revelado";
  return Number(value) > 0 ? "contacto" : "revelado";
}

export function isVisible({ enabled, known, rule, hull, fleet = [], contactM = FOG.contactM } = {}) {
  // The caller says whether the fog is on. Defaulting it here to `fogEnabled()` read the
  // built-in `FOG.enabled`, which is 0 (off), so a caller that forgot the flag would have
  // got the whole sea visible and every visibility test would have passed for the wrong
  // reason. Absent means "the fog is on": this function is only asked when it matters.
  if (enabled === false) return true;
  if (!isDiscovered(known, hull)) return false;
  const inForce = rule === undefined ? visibilityRule() : rule === "contacto" || Number(rule) > 0 ? "contacto" : "revelado";
  if (inForce !== "contacto") return true;
  const reach = Number(contactM);
  const x = Number(hull?.x);
  const y = Number(hull?.y);
  if (!Number.isFinite(reach) || reach <= 0 || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  return (Array.isArray(fleet) ? fleet : []).some((ship) => {
    const sx = Number(ship?.x);
    const sy = Number(ship?.y);
    return Number.isFinite(sx) && Number.isFinite(sy) && Math.hypot(sx - x, sy - y) <= reach;
  });
}

/** A discovery record the save can carry: the cells and whether the map is complete. */
export function serializeDiscovered(known) {
  const record = normaliseDiscovered(known);
  return { complete: record.complete, cells: [...record.cells] };
}

/**
 * How dark the veil is over every cell of the chart, with a soft edge.
 *
 * Painting the veil cell by cell left the border of what the player had lit as a staircase of
 * 200 m squares. The mask is the same grid turned into a number per cell (0 clear, 1 solid)
 * and then feathered: a few passes of a small blur across the grid, so the border between lit
 * and dark water becomes a gradient the screen can stretch smoothly.
 *
 * The blur only ever mixes a cell with its neighbours using non-negative weights, so lighting
 * more sea can never darken any cell. That matters on screen: a fleet that sails must make the
 * fog lift, not make its edge flicker.
 *
 * `holes` are points the fog must open around, in metres: a hostile already in the fight is
 * never hidden, so the veil leaves a clearing around her. `softness` is how many blur passes
 * to run, and 0 gives the hard grid back.
 */
export function fogMask({ known, radiusM, softness = 2, holes = [], cellM = FOG.cellM } = {}) {
  const size = Number(cellM) > 0 ? Number(cellM) : FOG.cellM;
  const radius = Number(radiusM);
  if (!Number.isFinite(radius) || radius <= 0) {
    return { x0: 0, y0: 0, n: 0, cellM: size, alpha: new Float32Array(0) };
  }

  const lo = Math.floor(-radius / size);
  const hi = Math.floor(radius / size);
  const n = hi - lo + 1;
  const lit = new Set(normaliseDiscovered(known).cells);
  const clearings = (Array.isArray(holes) ? holes : []).filter(
    (hole) => Number.isFinite(Number(hole?.x)) && Number.isFinite(Number(hole?.y)),
  );

  let dark = new Float32Array(n * n);
  const outside = new Uint8Array(n * n);
  for (let iy = 0; iy < n; iy += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const cx = lo + ix;
      const cy = lo + iy;
      const centre = { x: cx * size + size / 2, y: cy * size + size / 2 };
      const at = iy * n + ix;
      // The chart is a circle: the corners of its bounding box are not sea and are never
      // painted, however the blur reaches them.
      if (Math.hypot(centre.x, centre.y) > radius + size) outside[at] = 1;
      dark[at] = lit.has(`${cx}:${cy}`) ? 0 : 1;
    }
  }

  // Feather: a [1 2 1] / 4 pass along each axis, repeated. Edges repeat the nearest cell, so
  // the rim of the chart does not fade to clear just because the grid stops there.
  const passes = Math.max(0, Math.min(6, Math.floor(Number(softness) || 0)));
  for (let pass = 0; pass < passes; pass += 1) {
    const horizontal = new Float32Array(n * n);
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const left = dark[iy * n + Math.max(0, ix - 1)];
        const mid = dark[iy * n + ix];
        const right = dark[iy * n + Math.min(n - 1, ix + 1)];
        horizontal[iy * n + ix] = (left + 2 * mid + right) / 4;
      }
    }
    const vertical = new Float32Array(n * n);
    for (let iy = 0; iy < n; iy += 1) {
      for (let ix = 0; ix < n; ix += 1) {
        const up = horizontal[Math.max(0, iy - 1) * n + ix];
        const mid = horizontal[iy * n + ix];
        const down = horizontal[Math.min(n - 1, iy + 1) * n + ix];
        vertical[iy * n + ix] = (up + 2 * mid + down) / 4;
      }
    }
    dark = vertical;
  }

  // The clearings go in AFTER the feathering. A clearing is a handful of cells wide, and the
  // blur erodes anything that small: measured, a 4-cell clearing came out only 39 % open, so a
  // hostile in the fight would still have been under the veil. Each one is its own round
  // gradient instead, fully open within 1.5 cells and fading back to the fog by 3.5.
  for (let iy = 0; iy < n; iy += 1) {
    for (let ix = 0; ix < n; ix += 1) {
      const at = iy * n + ix;
      if (outside[at]) {
        dark[at] = 0;
        continue;
      }
      if (clearings.length === 0) continue;
      const cx = (lo + ix) * size + size / 2;
      const cy = (lo + iy) * size + size / 2;
      let open = 1;
      for (const hole of clearings) {
        const d = Math.hypot(Number(hole.x) - cx, Number(hole.y) - cy);
        const t = Math.max(0, Math.min(1, (d - size * 1.5) / (size * 2)));
        open = Math.min(open, t * t * (3 - 2 * t));
      }
      dark[at] *= open;
    }
  }
  return { x0: lo, y0: lo, n, cellM: size, alpha: dark };
}
