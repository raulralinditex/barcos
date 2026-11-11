import { chromium } from "playwright";

/**
 * Browser smoke for T8 (fleet) and T9 (erase save), driven through the UI only.
 *
 * T8: the player builds and launches a first ship, it becomes the captain, a
 * second hull joins the fleet without losing the first, and the captain can be
 * changed. The sea screen then sails whichever hull is captain.
 *
 * T9: "Borrar partida" asks first and, once confirmed, leaves no save behind.
 */

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });

// Start from a clean save with a purse that covers two hulls: this smoke is about
// the fleet, not about what the economy lets you afford.
await page.evaluate(() => {
  localStorage.clear();
  // Pin Spanish: this smoke checks fleet behaviour, not wording (smoke-i18n does that).
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 40000 }));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(300);

const fleetCount = () => page.locator("#fleet-count").textContent();
const fleetNames = () =>
  page.locator("#fleet-list .fleet-name").allTextContents();
const storage = () =>
  page.evaluate(() => ({
    fleet: localStorage.getItem("barcos:fleet:v1"),
    game: localStorage.getItem("barcos:game:v1"),
    config: localStorage.getItem("barcos:config:v1"),
    ship: localStorage.getItem("barcos:current-ship:v1"),
  }));

// --- T8: the shipyard starts with no fleet --------------------------------
const emptyCount = await fleetCount();
check(emptyCount === "sin naves", `a fresh shipyard should own no ships, got: ${emptyCount}`);

/** Launch the currently configured ship under `name`, closing the dialog after. */
async function launchShip(name) {
  await page.fill("#ship-name", name);
  await page.waitForTimeout(150);
  const disabled = await page.locator("#launch-btn").isDisabled();
  if (disabled) throw new Error(`the default loadout does not build for ${name}`);
  await page.click("#launch-btn");
  await page.waitForTimeout(300);
  const title = await page.locator("#sail-title").textContent();
  await page.click("#sail-back");
  await page.waitForTimeout(200);
  return title;
}

// --- first ship becomes the captain ---------------------------------------
await launchShip("Golden Hind");
const afterFirst = { count: await fleetCount(), names: await fleetNames() };
check(afterFirst.names.length === 1, `expected 1 ship, got ${afterFirst.names.length}`);
check(afterFirst.names[0] === "Golden Hind", `captain should be Golden Hind, got ${afterFirst.names[0]}`);
check(afterFirst.count === "1 nave", `fleet count should read "1 nave", got ${afterFirst.count}`);

// --- buying a second hull keeps the first, and it becomes captain ---------
// A cheaper hull so the purse still covers a second launch.
await page.click('.hull-card[data-hull-id="patache"]').catch(() => {});
await page.waitForTimeout(250);
await launchShip("Avispa");
const afterSecond = { count: await fleetCount(), names: await fleetNames() };
check(afterSecond.names.length === 2, `expected 2 ships, got ${afterSecond.names.length}`);
check(afterSecond.names.includes("Golden Hind"), "the first hull was lost when buying a second");
check(afterSecond.count === "2 naves", `fleet count should read "2 naves", got ${afterSecond.count}`);

// the newest hull is captain, and the old one is offered as a choice
const captainTag = await page.locator(".fleet-item.is-captain .fleet-name").textContent();
check(captainTag === "Avispa", `the new hull should be captain, got ${captainTag}`);

// --- the player can choose which ship to captain --------------------------
await page.locator('.fleet-ship[data-captain]').first().click();
await page.waitForTimeout(250);
const newCaptain = await page.locator(".fleet-item.is-captain .fleet-name").textContent();
check(newCaptain === "Golden Hind", `expected to re-promote Golden Hind, got ${newCaptain}`);

// --- the sea screen sails the captain ------------------------------------
const savedFleet = JSON.parse((await storage()).fleet);
check(savedFleet.captainId !== null, "the fleet was never persisted with a captain");
const captainIdInSave = savedFleet.captainId;
const captainShipInSave = savedFleet.ships.find((s) => s.id === captainIdInSave);

await page.goto("http://localhost:8765/sea.html", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const seaTitle = await page.locator("#hud-ship-name").textContent();
check(
  seaTitle.startsWith(captainShipInSave.name),
  `the sea should sail the captain ${captainShipInSave.name}, got: ${seaTitle}`,
);

// --- T9: erase asks first, then leaves nothing ---------------------------
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(300);

const fleetSurvivedSea = await fleetCount();
check(fleetSurvivedSea === "2 naves", `sailing must not lose the fleet, got ${fleetSurvivedSea}`);

await page.click("#erase-btn");
await page.waitForTimeout(250);
const dialogOpen = await page.locator("#erase-dialog").evaluate((el) => el.open);
check(dialogOpen, "erase must ask for confirmation before deleting");

// cancel keeps everything
await page.click("#erase-cancel");
await page.waitForTimeout(200);
const afterCancel = await storage();
check(afterCancel.fleet !== null, "cancelling the erase must keep the fleet");

// confirm wipes the save
await page.click("#erase-btn");
await page.waitForTimeout(200);
await page.click("#erase-confirm");
await page.waitForTimeout(600);
const afterErase = await storage();
const freshCount = await fleetCount();

check(afterErase.fleet === null, "erase left the fleet save behind");
check(afterErase.game === null, "erase left the voyage save behind");
check(afterErase.ship === null, "erase left the single-ship save behind");
check(freshCount === "sin naves", `after erasing the shipyard should own nothing, got ${freshCount}`);

await page.screenshot({ path: "/tmp/fleet.png" });
await browser.close();

const result = {
  errors,
  afterFirst,
  afterSecond,
  captainTag,
  newCaptain,
  seaTitle,
  fleetSurvivedSea,
  dialogOpen,
  afterErase,
  freshCount,
  failures,
};
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: fleet progression, captain choice and erase save all observed");
