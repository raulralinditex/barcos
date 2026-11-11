/**
 * Sea screen: real-time sailing over the zone world.
 *
 * All rules live in ../model/world.js; this file only renders the world, reads the
 * keyboard and autosaves. Spanish labels (S10), English identifiers (S10).
 */

import { hullById } from "../data/naval-data.js";
import {
  WORLD,
  ZONE_BANDS,
  createWorld,
  deserializeWorld,
  nearestEncounter,
  serializeWorld,
  updateWorld,
  zoneAtRadius,
} from "../model/world.js";

const SHIP_KEY = "barcos:current-ship:v1";
const GAME_KEY = "barcos:game:v1";

const PX_PER_M = 0.4; // camera scale: 1 px on screen = 2.5 m of sea
const MINIMAP_RADIUS = 85;

const ZONE_PAINT = {
  costera: { deep: "#2e6f8e", shallow: "#3d87a8", ring: "rgba(255,255,255,0.16)" },
  abierto: { deep: "#1b4a70", shallow: "#245d86", ring: "rgba(255,255,255,0.12)" },
  abismo: { deep: "#131f36", shallow: "#1c2a4a", ring: "rgba(200,180,255,0.10)" },
};

const $ = (selector) => document.querySelector(selector);

const els = {
  canvas: $("#sea-canvas"),
  minimap: $("#minimap"),
  name: $("#hud-ship-name"),
  gold: $("#hud-gold"),
  zone: $("#hud-zone"),
  throttle: $("#hud-throttle"),
  speed: $("#hud-speed"),
  heading: $("#hud-heading"),
  hull: $("#hud-hull"),
  banner: $("#banner"),
};

const fmtInt = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const fmtOne = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

/* ---------------------------------------------------------------- boot state */

function loadRuntimeShip() {
  try {
    const ship = JSON.parse(localStorage.getItem(SHIP_KEY));
    if (ship && Number.isFinite(ship.speedKn)) return ship;
  } catch {
    /* fall through */
  }
  return null;
}

function loadSavedGame() {
  try {
    const game = JSON.parse(localStorage.getItem(GAME_KEY));
    if (game && Number.isFinite(game.gold)) return game;
  } catch {
    /* fall through */
  }
  return null;
}

const runtimeShip = loadRuntimeShip();

const ui = {
  throttle: 0,
  rudder: 0,
  keys: new Set(),
  trail: [],
  bannerUntil: 0,
  lastEnemyWarning: 0,
};

let world = null;
let gold = 0;
let goldEarned = 0;

/* ---------------------------------------------------------------- persistence */

function saveGame() {
  if (!world) return;
  try {
    world = { ...world, gold: goldEarned };
    localStorage.setItem(
      GAME_KEY,
      JSON.stringify({ gold, world: serializeWorld(world) }),
    );
  } catch {
    /* storage disabled: the voyage continues in memory */
  }
}

/* ---------------------------------------------------------------- input */

const THROTTLE_STEP = 0.25;

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
  }
  if (key === "arrowup" || key === "w") {
    ui.throttle = Math.min(1, ui.throttle + THROTTLE_STEP);
  } else if (key === "arrowdown" || key === "s") {
    ui.throttle = Math.max(0, ui.throttle - THROTTLE_STEP);
  }
  ui.keys.add(key);
});

window.addEventListener("keyup", (event) => {
  ui.keys.delete(event.key.toLowerCase());
});

function readInput() {
  const left = ui.keys.has("arrowleft") || ui.keys.has("a");
  const right = ui.keys.has("arrowright") || ui.keys.has("d");
  return {
    turn: (right ? 1 : 0) - (left ? 1 : 0),
    throttle: ui.throttle,
  };
}

/* ---------------------------------------------------------------- banner */

function showBanner(text, kind = "info", ms = 2200) {
  els.banner.textContent = text;
  els.banner.className = `sea-banner is-visible banner-${kind}`;
  ui.bannerUntil = performance.now() + ms;
}

function hideBannerIfDue(now) {
  if (ui.bannerUntil && now > ui.bannerUntil) {
    els.banner.classList.remove("is-visible");
    ui.bannerUntil = 0;
  }
}

/* ---------------------------------------------------------------- drawing */

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  els.canvas.width = Math.round(window.innerWidth * dpr);
  els.canvas.height = Math.round(window.innerHeight * dpr);
  els.canvas.style.width = `${window.innerWidth}px`;
  els.canvas.style.height = `${window.innerHeight}px`;
  const ctx = els.canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}



function drawSea(ctx) {
  const zone = zoneAtRadius(Math.hypot(world.ship.x, world.ship.y));
  const paint = ZONE_PAINT[zone.id] ?? ZONE_PAINT.costera;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const gradient = ctx.createRadialGradient(
    width / 2, height / 2, height * 0.1,
    width / 2, height / 2, height * 0.85,
  );
  gradient.addColorStop(0, paint.shallow);
  gradient.addColorStop(1, paint.deep);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(PX_PER_M, PX_PER_M);
  ctx.translate(-world.ship.x, -world.ship.y);

  // zone boundary rings and the edge of the known world
  for (const band of ZONE_BANDS) {
    ctx.beginPath();
    ctx.arc(0, 0, band.maxRadiusM, 0, Math.PI * 2);
    ctx.strokeStyle = paint.ring;
    ctx.lineWidth = 14;
    ctx.setLineDash([90, 60]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.arc(0, 0, WORLD.radiusM, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(190,80,60,0.4)";
  ctx.lineWidth = 22;
  ctx.stroke();

  // home port at the origin
  ctx.beginPath();
  ctx.arc(0, 0, 110, 0, Math.PI * 2);
  ctx.fillStyle = "#8a7a55";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 70, 0, Math.PI * 2);
  ctx.fillStyle = "#a9955f";
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "600 90px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("⚓", 0, 32);

  drawEncounters(ctx);
  drawWake(ctx);
  drawPlayerShip(ctx);

  ctx.restore();
}

function drawEncounters(ctx) {
  const now = performance.now();
  for (const encounter of world.encounters) {
    if (encounter.type === "treasure") {
      const pulse = 14 + Math.sin(now / 350 + encounter.id) * 5;
      ctx.beginPath();
      ctx.arc(encounter.x, encounter.y, 26, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(224,168,21,0.28)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(encounter.x, encounter.y, pulse, 0, Math.PI * 2);
      ctx.fillStyle = "#e0a815";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(encounter.x - 3, encounter.y - 4, pulse * 0.35, 0, Math.PI * 2);
      ctx.fillStyle = "#fff3c4";
      ctx.fill();
    } else {
      drawEnemySail(ctx, encounter);
    }
  }
}

function drawEnemySail(ctx, encounter) {
  ctx.save();
  ctx.translate(encounter.x, encounter.y);
  ctx.rotate(encounter.drift.heading);

  ctx.beginPath();
  ctx.moveTo(46, 0);
  ctx.lineTo(-34, -20);
  ctx.lineTo(-46, 0);
  ctx.lineTo(-34, 20);
  ctx.closePath();
  ctx.fillStyle = "#20242c";
  ctx.fill();
  ctx.strokeStyle = "rgba(161,60,44,0.9)";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(0, 26);
  ctx.strokeStyle = "#3a4048";
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.restore();
}

function drawWake(ctx) {
  const trail = ui.trail;
  if (trail.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(trail[0].x, trail[0].y);
  for (const point of trail.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 26;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function drawPlayerShip(ctx) {
  const ship = world.ship;
  const hull = hullById(runtimeShip.hullId);
  const lengthRatio = hull ? Math.min(1.5, Math.max(0.7, hull.lengthM / 25)) : 1;
  const len = 70 * lengthRatio;
  const beam = 26 * lengthRatio;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.heading);

  ctx.beginPath();
  ctx.moveTo(len * 0.5, 0);
  ctx.lineTo(len * 0.1, -beam * 0.5);
  ctx.lineTo(-len * 0.5, -beam * 0.42);
  ctx.quadraticCurveTo(-len * 0.56, 0, -len * 0.5, beam * 0.42);
  ctx.lineTo(len * 0.1, beam * 0.5);
  ctx.closePath();
  ctx.fillStyle = "#3c5a7a";
  ctx.fill();
  ctx.strokeStyle = "#101c2a";
  ctx.lineWidth = 3;
  ctx.stroke();

  // masts
  ctx.strokeStyle = "#d9d2c2";
  ctx.lineWidth = 4;
  for (const t of [-0.2, 0.05, 0.22]) {
    ctx.beginPath();
    ctx.moveTo(len * t, -beam * 0.34);
    ctx.lineTo(len * t, beam * 0.34);
    ctx.stroke();
  }

  // rudder indicator
  if (readInput().turn !== 0) {
    ctx.strokeStyle = "rgba(224,168,21,0.9)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, 0);
    ctx.lineTo(-len * 0.62, readInput().turn * beam * 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMinimap() {
  const ctx = els.minimap.getContext("2d");
  const size = els.minimap.width;
  const center = size / 2;
  const scale = (MINIMAP_RADIUS - 6) / WORLD.radiusM;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(center, center, MINIMAP_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(16,28,42,0.82)";
  ctx.fill();
  ctx.strokeStyle = "rgba(201,189,164,0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, MINIMAP_RADIUS - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(center, center);
  ctx.scale(scale, scale);

  for (const band of ZONE_BANDS) {
    ctx.beginPath();
    ctx.arc(0, 0, band.maxRadiusM, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 60;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(0, 0, 120, 0, Math.PI * 2);
  ctx.fillStyle = "#a9955f";
  ctx.fill();

  for (const encounter of world.encounters) {
    ctx.beginPath();
    ctx.arc(encounter.x, encounter.y, 90, 0, Math.PI * 2);
    ctx.fillStyle = encounter.type === "treasure" ? "#e0a815" : "#d0503c";
    ctx.fill();
  }

  // player arrow
  ctx.save();
  ctx.translate(world.ship.x, world.ship.y);
  ctx.rotate(world.ship.heading);
  ctx.beginPath();
  ctx.moveTo(220, 0);
  ctx.lineTo(-140, -120);
  ctx.lineTo(-140, 140);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

/* ---------------------------------------------------------------- HUD */

function updateHud() {
  const zone = zoneAtRadius(Math.hypot(world.ship.x, world.ship.y));
  els.name.textContent = `${runtimeShip.name} — ${runtimeShip.hullName}`;
  els.gold.textContent = fmtInt.format(gold);
  els.zone.textContent = zone.name;
  els.zone.style.color = zone.id === "abismo" ? "#c9a9ff" : zone.id === "abierto" ? "#9fc7e8" : "#bfe3c9";
  els.throttle.textContent = `${fmtInt.format(ui.throttle * 100)} %`;
  els.speed.textContent = `${fmtOne.format(world.ship.currentSpeedKn)} kn`;
  const degrees = ((world.ship.heading * 180) / Math.PI + 360) % 360;
  els.heading.textContent = `${String(Math.round(degrees)).padStart(3, "0")}°`;
  els.hull.textContent = `${fmtInt.format(runtimeShip.condition?.hull ?? 100)} %`;
}

/* ---------------------------------------------------------------- main loop */

let lastTime = performance.now();

function frame(now) {
  if (!world) return;
  const dt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const before = goldEarned;
  world = updateWorld(world, readInput(), dt);
  goldEarned = world.gold;
  if (goldEarned > before) {
    gold += goldEarned - before;
    showBanner(`+${fmtInt.format(goldEarned - before)} doblones · tesoro rescatado`, "gold");
  }

  // wake trail, thinned to keep it cheap
  if (world.ship.currentSpeedKn > 0.3) {
    const last = ui.trail[ui.trail.length - 1];
    const moved =
      !last || Math.hypot(world.ship.x - last.x, world.ship.y - last.y) > 30;
    if (moved) {
      ui.trail.push({ x: world.ship.x, y: world.ship.y });
      if (ui.trail.length > 40) ui.trail.shift();
    }
  } else if (ui.trail.length) {
    ui.trail.shift();
  }

  // enemy proximity warning, at most every 6 s
  const nearest = nearestEncounter(world, "enemy");
  if (nearest && nearest.distance < 380 && now - ui.lastEnemyWarning > 6000) {
    ui.lastEnemyWarning = now;
    showBanner(
      `Vela hostil a ${fmtInt.format(Math.round(nearest.distance))} m — el combate llega en la próxima etapa`,
      "danger",
      2600,
    );
  }

  const ctx = els.canvas.getContext("2d");
  drawSea(ctx);
  drawMinimap();
  updateHud();
  hideBannerIfDue(now);

  requestAnimationFrame(frame);
}

function boot() {
  const savedGame = loadSavedGame();
  const savedWorld = savedGame?.world ? deserializeWorld(savedGame.world) : null;

  const worldSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  world =
    savedWorld && Math.abs(savedWorld.ship.speedKn - runtimeShip.speedKn) < 1
      ? savedWorld
      : createWorld(worldSeed, { speedKn: runtimeShip.speedKn }, 0);

  gold = savedGame?.gold ?? 0;
  goldEarned = world.gold;

  setInterval(saveGame, 3000);
  window.addEventListener("beforeunload", saveGame);
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();
  updateHud();
  showBanner(`Zarpa el ${runtimeShip.name}. Buen viento, capitán.`, "info", 2800);
  requestAnimationFrame(frame);
}

if (runtimeShip) {
  boot();
} else {
  // No ship in the water: the sea has nothing to sail. Back to the shipyard.
  window.location.replace("./index.html");
}
