/**
 * Where the sea screen is looking (S166).
 *
 * The player asked for it (verbatim): "en el mar, tenemos un panel redondo con una miniatura
 * de todo el mapa, cuando en ese panel cliqueas un punto, mostrar esa parte del mapa en
 * pantalla". So the camera stops being welded to the captain: a click on the chart looks at
 * that piece of sea, and the helm keeps steering the same hull from wherever it is.
 *
 * The distinction matters: the CAPTAIN is where the voyage is, the CAMERA is where the player
 * is looking. Looking somewhere else must never move the hull, spend her supply or change her
 * course. This module keeps that rule pure and testable; the screen only reads it.
 */

/**
 * The point the sea should be drawn around.
 *
 * `camera` is null while the view follows the captain, which is the default and the only
 * state a save ever needs to record: a player who reloads looks at her ship.
 */
export function cameraFor({ ship, camera } = {}) {
  const hull = { x: Number(ship?.x), y: Number(ship?.y) };
  const safeShip = {
    x: Number.isFinite(hull.x) ? hull.x : 0,
    y: Number.isFinite(hull.y) ? hull.y : 0,
  };
  if (!isPoint(camera)) return safeShip;
  return { x: camera.x, y: camera.y };
}

/** Whether the view is still following the captain (no camera picked). */
export function isFollowingCaptain({ camera } = {}) {
  return !isPoint(camera);
}

/**
 * A camera clamped to the known sea, so a click near the rim of the chart cannot leave the
 * player looking at empty canvas with nothing on it.
 */
export function clampCamera(camera, radiusM) {
  const radius = Number(radiusM);
  if (!isPoint(camera) || !Number.isFinite(radius) || radius <= 0) return { x: 0, y: 0 };
  return {
    x: Math.max(-radius, Math.min(radius, camera.x)),
    y: Math.max(-radius, Math.min(radius, camera.y)),
  };
}

/** A camera value as a real point, or null. */
function isPoint(value) {
  if (!value || typeof value !== "object") return false;
  return Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y));
}
