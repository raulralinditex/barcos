/**
 * The danger number of a hull (S142): one informational value, the same scale for every
 * ship, so the player can compare two vessels at a glance.
 *
 * The player asked for it (verbatim): "vamos a valorar los buques a la hora de la batalla
 * para poderlos comparar, calcularemos un valor segun sus propiedades que cuando comparemos
 * ese valor entre dos buques, el mayor tendra mas probabilida...". His decision (verbatim):
 * "Sólo informativo: se muestra y no cambia el combate". The properties, verbatim:
 * "Estado vivo (casco, aparejo, tripulación)", "Artillería y munición" and
 * "Tamaño, velocidad y maniobra".
 *
 * Pure and UI-free, like every other model: this file answers one question (how dangerous
 * is this hull, as a whole number) and nothing else. No roll, no rule and no combat
 * function reads it; the sea only paints it (S142-B).
 *
 * The weights are one declared block, so the settings screen can move every one of them
 * (S79/S142-D). `dangerValue` reads them live, so a value changed on the screen reaches
 * the next frame without a reload.
 */

import { CONVENTIONS, pieceById } from "../data/naval-data.js";
import { COMBAT } from "./combat.js";
import { TURNING, turnRateFactor } from "./turning.js";

/**
 * The danger weights, as one block (S79/S142-D).
 *
 * The three groups are separable on purpose: the live condition is worth what her crew,
 * her rig and her hull are still worth; the gunnery is what she can still throw; the hull
 * is what she is, whatever state she is in.
 */
export const DANGER = {
  /** Whether the number is painted on the sea (0/1). Visible by default (S142-D). */
  show: 1,
  /** Live hull condition at 100 %, in danger points. */
  hull: 150,
  /** Live rigging condition at 100 %: shredded sails are a slower, weaker ship. */
  rigging: 60,
  /** Live crew condition at 100 %: a beaten deck cannot work the guns. */
  crew: 60,
  /** Each useful gun of a broadside (a gun with rounds left on the stronger side). */
  gun: 8,
  /** Each kg of shot of the mean broadside gun, per kg. */
  calibre: 10,
  /** A full magazine, in danger points: the rounds still aboard, as a share. */
  rounds: 25,
  /** Rounds per gun that count as a full magazine. */
  roundsFull: 25,
  /** Displacement of the reference hull, in kg: the size share is read against it. */
  referenceKg: 500_000,
  /** A hull at the reference displacement is worth this much size. */
  displacement: 80,
  /** Speed of the reference hull, in knots: the speed share is read against it. */
  referenceKn: 8,
  /** A hull that makes the reference speed is worth this much speed. */
  speed: 40,
  /** How well she answers the helm, worth this much at the reference turn rate. */
  manoeuvre: 30,
};

/** A finite number or `null`, so a broken field is skipped instead of poisoning the sum. */
const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** The quickest turn the model allows, so a boat's manoeuvre share lands in 0..1. */
const maxTurn = () => {
  const cap = finite(TURNING.maxFactor);
  return cap !== null && cap > 0 ? cap : 1;
};

/** A weight read as a real number, falling back to 0 for a broken block. */
const weight = (key) => finite(DANGER[key]) ?? 0;

/** A condition percentage read as 0..100; anything broken reads as 0. */
const share100 = (value) => clamp(finite(value) ?? 0, 0, 100) / 100;

/**
 * The displacement of a hull, in kg. A combatant that carries it is read as it is; the
 * rest are read through the endurance the combat model already computed
 * (`hullToughness` is `arqueo / COMBAT.referenceArqueo`), so the size group works with
 * the combatants the game actually builds, without this file inventing a second one.
 */
function displacementOf(combatant) {
  const carried = finite(combatant.displacementKg);
  if (carried !== null && carried > 0) return carried;
  const toughness = finite(combatant.hullToughness);
  if (toughness === null || toughness <= 0) return 0;
  const arqueo = toughness * COMBAT.referenceArqueo;
  return arqueo * CONVENTIONS.displacementPerArqueoTon * 1000;
}

/**
 * The useful guns of one beam: a gun with rounds left and a piece the catalogue knows.
 * A piece whose id the catalogue does not have still counts as a gun (it is mounted),
 * with no calibre and no rounds of its own.
 */
function gunsOf(combatant, side) {
  const pieces = Array.isArray(combatant.pieces) ? combatant.pieces : [];
  let guns = 0;
  let shotKg = 0;
  let rounds = 0;
  for (const piece of pieces) {
    if (!piece || typeof piece !== "object") continue;
    if (piece.side !== side) continue;
    const shots = finite(piece.shotsLeft);
    if (shots !== null && shots <= 0) continue;
    guns += 1;
    // The combatant's pieces carry the id, not the calibre: the catalogue owns the shot
    // mass, so the danger of a gun is read from the piece it is, never invented here.
    const carried = finite(piece.shotKg);
    const kg = carried ?? finite(pieceById(piece.pieceId)?.shotKg);
    if (kg !== null && kg > 0) shotKg += kg;
    rounds += shots !== null ? Math.max(0, shots) : 0;
  }
  return { guns, shotKg, rounds };
}

/**
 * The danger of one hull, as a whole number of at least 0 (S142-A).
 *
 * Never throws and never writes: a broken input is worth 0, and a hull that has sunk or
 * struck her colours is worth 0 too, because she is not a ship to compare any more.
 */
export function dangerValue(combatant) {
  if (!combatant || typeof combatant !== "object") return 0;
  if (combatant.status && combatant.status !== "fighting") return 0;

  const condition = combatant.condition;
  if (!condition || typeof condition !== "object") return 0;

  const hullShare = share100(condition.hull);
  if (hullShare <= 0) return 0;

  // Group 1: what she still is. A beaten hull, a stripped rig and a broken crew all
  // lower the number, which is the comparison the player asked for.
  const live =
    weight("hull") * hullShare +
    weight("rigging") * share100(condition.rigging) +
    weight("crew") * share100(condition.crew);

  // Group 2: what she can still throw. Both beams count, so a ship armed on one side
  // only is worth less than a ship of the same size armed on both.
  const babor = gunsOf(combatant, "babor");
  const estribor = gunsOf(combatant, "estribor");
  const guns = babor.guns + estribor.guns;
  const shotKg = babor.shotKg + estribor.shotKg;
  const rounds = babor.rounds + estribor.rounds;
  const fullRounds = Math.max(1, weight("roundsFull"));
  const magazine = guns > 0 ? clamp(rounds / (guns * fullRounds), 0, 1) : 0;
  const gunnery =
    weight("gun") * guns +
    weight("calibre") * shotKg +
    weight("rounds") * magazine;

  // Group 3: what she is. Size, speed and how she answers the helm, read against the
  // declared references so the scale is the same for a patache and a ship of the line.
  const displacement = displacementOf(combatant);
  const speed = finite(combatant.maxSpeedKn) ?? 0;
  // A hull with no size on record has no helm to read: manoeuvring is measured from her
  // weight, and a weight of zero would read as the nimblest boat afloat. A light hull is
  // handier than a heavy one, so her share of the rudder rate is an advantage, read
  // against the quickest turn the model allows.
  const turn = displacement > 0 ? clamp(turnRateFactor(displacement), 0, maxTurn()) : 0;
  const hull =
    weight("displacement") * clamp(displacement / Math.max(1, weight("referenceKg")), 0, 1) +
    weight("speed") * clamp(speed / Math.max(0.1, weight("referenceKn")), 0, 1) +
    weight("manoeuvre") * turn;

  const total = live + gunnery + hull;
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round(total);
}
