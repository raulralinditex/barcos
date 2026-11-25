import { chromium } from "playwright";

/**
 * Browser smoke for T8 (fleet) and T9 (erase save), driven through the UI only.
 *
 * T8: the player builds and launches a first ship, it becomes the captain of that yard, a
 * second hull joins the yard without losing the first and without stealing her helm, and the
 * player can promote another hull of the yard to captain. The sea screen then sails whichever
 * hull is the fleet's captain.
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

/** Add the currently configured ship under `name`. */
async function launchShip(name) {
  // Buying lives in the Comprar tab (S99); the yard opens on Flota or Comprar depending
  // on the save, so the buy room is reached by clicking its tab.
  await page.click('.screen-tab[data-screen="comprar"]').catch(() => {});
  await page.fill("#ship-name", name);
  await page.waitForTimeout(150);
  const disabled = await page.locator("#launch-btn").isDisabled();
  if (disabled) throw new Error(`the default loadout does not build for ${name}`);
  await page.click("#launch-btn");
  await page.waitForTimeout(300);
  return page.locator(".fleet-item.is-captain .fleet-name").first().textContent();
}

// --- first ship becomes the captain ---------------------------------------
await launchShip("Golden Hind");
const afterFirst = { count: await fleetCount(), names: await fleetNames() };
check(afterFirst.names.length === 1, `expected 1 ship, got ${afterFirst.names.length}`);
check(afterFirst.names[0] === "Golden Hind", `captain should be Golden Hind, got ${afterFirst.names[0]}`);
check(afterFirst.count === "1 nave", `fleet count should read "1 nave", got ${afterFirst.count}`);

// --- buying a second hull keeps the first, and it does not steal the helm ---
// A cheaper hull so the purse still covers a second launch.
await page.click('.hull-card[data-hull-id="patache"]').catch(() => {});
await page.waitForTimeout(250);
await launchShip("Avispa");
const afterSecond = { count: await fleetCount(), names: await fleetNames() };
check(afterSecond.names.length === 2, `expected 2 ships, got ${afterSecond.names.length}`);
check(afterSecond.names.includes("Golden Hind"), "the first hull was lost when buying a second");
check(afterSecond.count === "2 naves", `fleet count should read "2 naves", got ${afterSecond.count}`);

// One captain per yard (S179): a purchase in a yard that already has a captain joins her
// command, and the fleet's helm does not move. The rule used to be "the newest hull is
// captain", which is exactly what let a purchase rob the command of the whole fleet.
const captainTag = await page.locator(".fleet-item.is-captain .fleet-name").first().textContent();
check(captainTag === "Golden Hind", `the yard's captain must keep the helm after a purchase, got ${captainTag}`);
const afterSecondSave = JSON.parse((await storage()).fleet);
const goldenId = afterSecondSave.ships.find((s) => s.name === "Golden Hind")?.id;
const avispa = afterSecondSave.ships.find((s) => s.name === "Avispa");
check(Boolean(avispa), "the second hull was never stored in the fleet");
check(
  avispa?.commandId === goldenId,
  `the new hull must join the yard's captain, she answers to ${avispa?.commandId}`,
);
check(
  afterSecondSave.captainId === goldenId,
  `a purchase must not move the fleet's helm, it reads ${afterSecondSave.captainId}`,
);

// --- the player can promote another hull of the yard to captain (S105, S179) ---
// The flota room owns this control. The button only exists for a hull that does NOT command
// her own command, so the promoted hull is named by id: the old assertion took `.first()`,
// which silently promoted whichever hull happened to be offered.
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(150);
const promote = page.locator(`.fleet-captain-button[data-captain="${avispa?.id}"]`);
check((await promote.count()) === 1, "a hull that is not a captain must be offered the promote button");
check(
  (await page.locator(`.fleet-captain-button[data-captain="${goldenId}"]`).count()) === 0,
  "a captain must not be offered the promote button",
);
if ((await promote.count()) === 1) {
  await promote.click();
  await page.waitForTimeout(250);
}
const newCaptain = await page.locator(`.fleet-item[data-ship-id="${avispa?.id}"] .fleet-tag`).textContent().catch(() => null);
check((newCaptain ?? "").trim() === "capitana", `the promoted hull must read as capitana, the row says ${JSON.stringify(newCaptain)}`);
check(
  (await page.locator("#fleet-list .fleet-item.is-captain").count()) === 2,
  "one captain per yard: both captains of this yard must read as capitana (S179)",
);
const afterPromoteSave = JSON.parse((await storage()).fleet);
check(
  afterPromoteSave.captainId === avispa?.id,
  `the promoted hull must take the fleet's helm, it reads ${afterPromoteSave.captainId}`,
);

// --- the sea screen sails the captain ------------------------------------
const savedFleet = JSON.parse((await storage()).fleet);
check(savedFleet.captainId !== null, "the fleet was never persisted with a captain");
const captainIdInSave = savedFleet.captainId;
const captainShipInSave = savedFleet.ships.find((s) => s.id === captainIdInSave);
// The sea's world is written on a 3 s autosave (`setInterval(saveGame, 3000)` in sea.js), so
// wait for the voyage to exist instead of a fixed delay, or the reads below see nothing.
await Promise.all([
  page.waitForURL("**/sea.html"),
  page.click("#set-sail-btn"),
]);
await page.waitForFunction(() => {
  try {
    return Boolean(JSON.parse(localStorage.getItem("barcos:game:v1"))?.world);
  } catch {
    return false;
  }
}, null, { timeout: 15000 });
const seaTitle = await page.locator("#hud-ship-name").textContent();
check(
  seaTitle.startsWith(captainShipInSave.name),
  `the sea should sail the captain ${captainShipInSave.name}, got: ${seaTitle}`,
);

// --- T9: erase asks first, then leaves nothing ---------------------------
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(300);

const fleetSurvivedSea = await fleetCount();
// The fleet keeps both hulls, and the yard lists exactly the hulls moored at it (S130, S183).
// The number is not pinned: it depends on whether the voyage ended back in port, and pinning it
// is how this smoke drifted from the rule it is meant to defend.
const savedAfterSea = JSON.parse((await storage()).fleet);
check(
  savedAfterSea.ships.length === 2,
  `sailing must not lose the fleet, the save holds ${savedAfterSea.ships.length} hulls`,
);
const listedIds = await page.locator("#fleet-list .fleet-item").evaluateAll((rows) =>
  rows.map((row) => row.dataset.shipId));
const mooredHere = savedAfterSea.ships.filter((ship) => ship.yardId === "puerto-casa").map((ship) => ship.id);
check(
  listedIds.length === mooredHere.length && mooredHere.every((id) => listedIds.includes(id)),
  `the yard must list exactly the hulls moored at it (${JSON.stringify(mooredHere)}), it lists ${JSON.stringify(listedIds)}`,
);
check(
  fleetSurvivedSea === `${mooredHere.length} ${mooredHere.length === 1 ? "nave" : "naves"}`,
  `the fleet count must match what the yard lists, it reads "${fleetSurvivedSea}"`,
);

// Erasing is the Flota room's action (S105).
await page.click('.screen-tab[data-screen="flota"]');
await page.waitForTimeout(150);
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
