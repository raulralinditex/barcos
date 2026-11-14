/**
 * Pictures of each hull (S34, S76).
 *
 * The shipyard shows a historical image of the hull the player has selected, so the
 * catalogue stops being a list of names. The images are bundled with the game under
 * `assets/ships/`, one per hull id, with their licence recorded next to them.
 *
 * Two rules matter more than the picture itself:
 *   - a missing image is normal, not an error: the hull still renders its silhouette;
 *   - the credit is always shown, because these are other people's work.
 */

/** Where the bundled hull pictures live, relative to the screen that shows them. */
export const SHIP_IMAGE_DIR = "./assets/ships/";

/** Only the ids the game itself uses: no path traversal, no absolute paths. */
const usableId = (value) => typeof value === "string" && value.trim() !== "" && /^[a-z0-9-]+$/.test(value);

/**
 * The picture path for a hull, or null when the id is unusable.
 *
 * `index` picks one of a hull's several pictures (S76): the first one is the bare
 * `<id>.jpg`, the next are `<id>-2.jpg`, `<id>-3.jpg` and so on, so a hull with one
 * picture keeps exactly the path it always had and nothing on disk has to move.
 */
export function shipImagePath(hullId, index = 0) {
  if (!usableId(hullId)) return null;
  const slot = Math.max(0, Math.floor(Number(index) || 0));
  return `${SHIP_IMAGE_DIR}${hullId}${slot === 0 ? "" : `-${slot + 1}`}.jpg`;
}

/**
 * Every picture a hull has, in the order they are shown (S76).
 *
 * The credits map is the list of what exists: a hull with a single entry has a single
 * picture, and a hull with `pictures` gets all of them. Reading the inventory from the
 * credits keeps one source of truth, so a picture can never be shown without its author.
 */
export function shipImagePaths(credits, hullId) {
  if (!usableId(hullId)) return [];
  const entry = credits?.[hullId];
  if (!entry || typeof entry !== "object") return [];
  // `pictures` is the multi-picture form; the old single form is a hull with one.
  const list = Array.isArray(entry.pictures) ? entry.pictures : [entry];
  return list
    .map((picture, index) => {
      const credit = creditOf(picture);
      if (!credit) return null;
      return { path: shipImagePath(hullId, index), ...credit };
    })
    .filter(Boolean);
}

/** One credit, or null when it is not complete: author, licence and source all matter. */
function creditOf(entry) {
  if (!entry || typeof entry !== "object") return null;
  const author = typeof entry.author === "string" ? entry.author.trim() : "";
  const license = typeof entry.license === "string" ? entry.license.trim() : "";
  const source = typeof entry.source === "string" ? entry.source.trim() : "";
  if (!author || !license || !source) return null;
  // The contract stays exactly what it was: author, licence and source, nothing else.
  return { author, license, source };
}

/**
 * The credit line for one hull, from the bundled credits map. Returns null when the
 * hull has no picture, so the screen knows to hide the caption instead of showing a
 * half-empty one.
 */
export function shipImageCredit(credits, hullId, index = 0) {
  const paths = shipImagePaths(credits, hullId);
  if (paths.length === 0) return null;
  const slot = Math.max(0, Math.floor(Number(index) || 0)) % paths.length;
  const { path, ...credit } = paths[slot];
  return credit;
}

/**
 * The picture to show after one click (S76): the next one, wrapping back to the first.
 * A hull with no pictures, or one, simply stays where it is.
 */
export function nextImageIndex(current, count) {
  const total = Math.floor(Number(count) || 0);
  if (total <= 1) return 0;
  const at = Math.floor(Number(current) || 0);
  return ((at % total) + total + 1) % total;
}
