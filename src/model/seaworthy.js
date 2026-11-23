/**
 * S174: the repair button also makes the hull seaworthy.
 *
 * The player asked for it (verbatim): "en el boton de reparar, añadamos tambien la dotacion
 * minima si no la tenemos y en carga, suministro para 25 dias y la carga necesaria". Her
 * decisions (verbatim): the minimum is "el minimo del astillero", "la carga necesaria" is
 * ballast to stop her floating too high, and everything "se suma al precio".
 *
 * The three things topped up here are exactly the three the shipyard already complains
 * about, so this module borrows her criteria instead of inventing a second set:
 *
 *   - `crew-below-minimum` is an error, and `minimumShipPrice` prices a hull with
 *     `{ marino: crewMin, artillero: 2, soldado: 10 }`. That is the minimum crew.
 *   - `light-load` is the warning that says the rudder has no weight to bite (S110); the
 *     threshold is `TURNING.lightLoadThreshold`. Ballast is what takes her over it.
 *   - provisions run out on their own (S67), so the target is a declared number of days.
 *
 * Pure and storage-free: the screens ask what is missing and what it costs, then apply the
 * answer. Nothing here knows about a purse, a button or a fleet.
 */

import { CREW_ROLES, PRICES, crewRoleById, hullById } from "../data/naval-data.js";
import { ballastPrice, crewHirePrice, provisionsPrice } from "./economy.js";
import { computeBudget, crewCounts, totalCrew } from "./ship-model.js";
import { TURNING } from "./turning.js";

export const SEAWORTHY = {
  /** Days of provisions the button leaves a hull with (S174). */
  supplyDays: 25,
  /**
   * The crew the shipyard treats as the least a hull can sail with. It is the same set
   * `minimumShipPrice` uses, so a hull that passes this passes the builder's own check.
   */
  minimumCrew: { marino: null, artillero: 2, soldado: 10 },
  /**
   * The load fraction the ballast aims for. It is the shipyard's own `light-load`
   * threshold: below it the hull floats high and the rudder loses up to half its bite.
   */
  ballastTo: TURNING.lightLoadThreshold,
};

const ROLES = ["marino", "artillero", "soldado"];

/** The least mariners a hull may sail with: her own `crewMin`, which the builder enforces. */
function marinerMinimum(hull) {
  const minimum = Number(hull?.crewMin);
  return Number.isFinite(minimum) && minimum > 0 ? Math.floor(minimum) : 0;
}

/** The least of one role a hull must carry, role by role. */
function minimumFor(role, hull) {
  if (role === "marino") return marinerMinimum(hull);
  const declared = SEAWORTHY.minimumCrew[role];
  return Number.isFinite(declared) && declared > 0 ? Math.floor(declared) : 0;
}

/** The bought complement of a hull, as whole numbers, tolerating an old save. */
function crewOf(ship) {
  const counts = crewCounts(ship?.crew ?? {});
  return { marino: counts.marino, artillero: counts.artillero, soldado: counts.soldado };
}

/** The load fraction a hull would have with a given ballast, everything else unchanged. */
function loadFractionWith(ship, hull, ballastKg) {
  const budget = computeBudget({
    hull,
    batteries: ship?.batteries ?? [],
    crew: ship?.crew ?? {},
    days: ship?.days ?? 0,
    cargoKg: ship?.cargoKg ?? 0,
    ballastKg,
    equipmentKg: ship?.equipmentKg ?? 0,
    reserveKg: ship?.reserveKg ?? 0,
  });
  return budget;
}

/**
 * What one hull is missing to be seaworthy, and what buying it costs (S174).
 *
 * Returns the men to hire per role, the days of provisions to buy, the ballast to add in
 * kg, the people the provisions are for, and the price of all of it. Everything is a
 * difference, never a target: a hull that carries more than the minimum keeps it.
 *
 * Junk resolves to an empty plan that costs nothing. A hull that is already seaworthy
 * returns the same empty plan, which is what makes the button a plain repair for her.
 */
export function seaworthyPlan(ship) {
  const empty = {
    crew: { marino: 0, artillero: 0, soldado: 0 },
    days: 0,
    ballastKg: 0,
    people: 0,
    cost: 0,
  };
  if (!ship || typeof ship !== "object") return empty;
  const hull = hullById(ship.hullId);
  if (!hull) return empty;

  // The crew: top each role up to the shipyard's minimum, never down.
  const crew = crewOf(ship);
  const missing = {};
  for (const role of ROLES) {
    const wanted = minimumFor(role, hull);
    missing[role] = Math.max(0, wanted - (crew[role] ?? 0));
  }

  // The provisions: the target is 25 days, so the shortfall is measured from what she has.
  const days = Math.max(0, Math.floor(Number(ship.days) || 0));
  const buyDays = Math.max(0, SEAWORTHY.supplyDays - days);

  // The people the new provisions feed: the complement she would carry with the new men,
  // not the men alive today — a hired sailor eats from the day he signs on.
  const people = totalCrew({
    ...crewOf(ship),
    marino: (crew.marino ?? 0) + missing.marino,
    artillero: (crew.artillero ?? 0) + missing.artillero,
    soldado: (crew.soldado ?? 0) + missing.soldado,
  });

  // The ballast: as much as takes her to the threshold, and no more. It is measured with
  // the crew and the provisions already bought, because those weigh too, and it stops at
  // what the hold can still spare: ballast may never push cargo out of a full hull.
  let ballastKg = 0;
  const before = loadFractionWith(ship, hull, Number(ship.ballastKg) || 0);
  const target = SEAWORTHY.ballastTo;
  if (before.loadFraction < target) {
    const already = Number(ship.ballastKg) || 0;
    const crewAfter = {
      ...crewOf(ship),
      marino: (crew.marino ?? 0) + missing.marino,
      artillero: (crew.artillero ?? 0) + missing.artillero,
      soldado: (crew.soldado ?? 0) + missing.soldado,
    };
    // Solve for the kg that reach the threshold: the mass she still needs, capped by the
    // room the hold has left once the new men and their provisions are aboard.
    const withNewCrew = loadFractionWith(
      { ...ship, crew: crewAfter, days: days + buyDays },
      hull,
      already,
    );
    const capacity = withNewCrew.capacityKg;
    const needed = Math.max(0, Math.ceil(target * capacity - (withNewCrew.realMassKg - hull.lightMassKg)));
    // The hold's room is what is left after everything already aboard and the new men.
    const roomForBallast = Math.max(0, Math.floor(withNewCrew.cargoMaxKg));
    ballastKg = Math.min(needed, roomForBallast);
  }

  const cost = Math.max(0, Math.ceil(
    crewHirePrice(missing) +
    provisionsPrice(people, buyDays) +
    ballastPrice(ballastKg) -
    1e-9,
  ));

  return { crew: missing, days: buyDays, ballastKg, people, cost };
}

/** What buying the missing men, days and ballast costs, on its own (S174). */
export function seaworthyCost(ship) {
  return seaworthyPlan(ship).cost;
}

/**
 * The hull with the plan applied (S174): the men hired, the provisions loaded and the
 * ballast stowed. Nothing else changes — her damage is the repair's business, and her
 * cargo, her guns and her condition are left exactly as they were.
 *
 * The living crew rises with the hired men, because the dead are replaced by the new
 * hands: a hull that lost men and hires them back has them aboard.
 */
export function applySeaworthy(ship, plan = seaworthyPlan(ship)) {
  if (!ship || typeof ship !== "object") return ship;
  const crew = crewOf(ship);
  const bought = {
    ...(ship.crew ?? {}),
    marino: (crew.marino ?? 0) + plan.crew.marino,
    artillero: (crew.artillero ?? 0) + plan.crew.artillero,
    soldado: (crew.soldado ?? 0) + plan.crew.soldado,
  };
  const alive = crewCounts(ship.crewAlive ?? ship.crew ?? {});
  const crewAlive = {
    ...(ship.crewAlive ?? ship.crew ?? {}),
    marino: (alive.marino ?? 0) + plan.crew.marino,
    artillero: (alive.artillero ?? 0) + plan.crew.artillero,
    soldado: (alive.soldado ?? 0) + plan.crew.soldado,
  };
  return {
    ...ship,
    crew: bought,
    crewAlive,
    days: Math.max(0, Math.floor(Number(ship.days) || 0)) + plan.days,
    ballastKg: (Number(ship.ballastKg) || 0) + plan.ballastKg,
  };
}

/** The roles the button may hire, so a screen can name them without importing the data. */
export function seaworthyRoles() {
  return ROLES.map((role) => ({ id: role, name: crewRoleById(role)?.name ?? role }));
}

/** The declared price lines, exposed so a screen can explain the total without copying it. */
export function seaworthyPrices() {
  return {
    perPersonDay: PRICES.provisionGoldPerPersonDay,
    perKgBallast: PRICES.ballastGoldPerKg,
    hire: Object.fromEntries(CREW_ROLES.map((role) => [role.id, role.hireGold])),
  };
}
