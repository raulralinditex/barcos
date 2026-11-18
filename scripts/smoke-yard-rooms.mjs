import { chromium } from "playwright";

/**
 * Browser smoke: what each room of the shipyard screen puts on screen (S145).
 * Needs the local server on 8765.
 *
 * The player asked for it (verbatim): "en el panel de astillero, no tiene que verse ni el
 * buque ni el aparejo". The yard's room is a place to read her fort and her repairs, not a
 * place to build: the hull panel and the rig panel have no business standing there.
 *
 * Pinned, through the screen only:
 *   1. the yard room shows neither the hull panel nor the rig panel;
 *   2. the hull and rig panels are still ONE DOM and still stand in the rooms that build
 *      (buying, the fleet's refit) — hiding them in the yard must not clone or destroy them;
 *   3. coming back from the yard to a building room puts them back on screen;
 *   4. the yard's own panels (her fort) are untouched.
 */

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 60_000 }));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(400);

/** What the two shared panels are doing right now: on screen, and how many DOMs exist. */
const panels = () =>
  page.evaluate(() => {
    const onScreen = (node) => Boolean(node) && node.getClientRects().length > 0;
    const ship = document.querySelector(".panel-ship");
    const rig = document.querySelector(".panel-build");
    return {
      shipOnScreen: onScreen(ship),
      rigOnScreen: onScreen(rig),
      shipCount: document.querySelectorAll(".panel-ship").length,
      rigCount: document.querySelectorAll(".panel-build").length,
      room: document.querySelector(".screen-panel.is-active")?.dataset.screenPanel ?? null,
      rigRoom: rig?.closest(".screen-panel")?.dataset.screenPanel ?? null,
    };
  });

const open = async (room) => {
  await page.click(`.screen-tab[data-screen="${room}"]`);
  await page.waitForTimeout(300);
};

// --- 1. the yard room shows neither of them -------------------------------------------
await open("astillero");
const yard = await panels();
check(yard.room === "astillero", `the yard room must be open, got ${yard.room}`);
check(!yard.shipOnScreen, "S145: the yard room must not show the hull panel");
check(!yard.rigOnScreen, "S145: the yard room must not show the rig panel");
// Her own panels are the room's business and must stay.
check(await page.locator("#fort-panel").isVisible(), "the yard's fort panel must still be on screen");

// --- 2. one DOM each, still standing where they build ---------------------------------
check(yard.shipCount === 1, `the hull panel must stay a single DOM, found ${yard.shipCount}`);
check(yard.rigCount === 1, `the rig panel must stay a single DOM, found ${yard.rigCount}`);

// --- 3. a building room puts them back ------------------------------------------------
await open("comprar");
const buying = await panels();
check(buying.shipOnScreen, "the buy room must show the hull panel");
check(buying.rigOnScreen, "the buy room must show the rig panel");
check(buying.shipCount === 1 && buying.rigCount === 1, "leaving the yard must not clone the panels");

// One hull afloat, so the fleet room has something to refit in point 5.
await page.fill("#ship-name", "Nave del recorrido");
await page.click("#launch-btn");
await page.waitForTimeout(400);

// --- 4. and back into the yard, they leave again --------------------------------------
await open("astillero");
const again = await panels();
check(!again.shipOnScreen && !again.rigOnScreen, "S145: coming back to the yard must hide them again");

// The fleet's refit is a building room too: it must still get both panels.
await open("flota");
await page.click(".fleet-item .fleet-ship");
await page.waitForTimeout(400);
const refit = await panels();
check(refit.room === "flota", `the refit must open in the fleet room, got ${refit.room}`);
check(refit.shipOnScreen && refit.rigOnScreen, "a refit in the fleet room must still show both panels");

check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
console.log(
  failures.length === 0
    ? "SMOKE OK: the yard room shows her fort and not the hull or the rig, and both panels survive the trip"
    : `SMOKE FAILED:\n- ${failures.join("\n- ")}`,
);
await browser.close();
if (failures.length > 0 || errors.length > 0) process.exit(1);
