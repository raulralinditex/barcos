import { chromium } from "playwright";

/**
 * S97-S101: the four rooms of the yard, walked in order. Buying a hull, refitting her,
 * reinforcing the fort and finding the settings inside the same screen. This smoke is
 * the tour the refactor promised; the unit rules live in model tests.
 */

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });

const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 60_000 }));
});
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(300);

const activePanel = () => page.evaluate(() => document.querySelector(".screen-panel.is-active")?.dataset.screenPanel);
const builderRoom = () => page.evaluate(() => document.querySelector(".panel-ship")?.closest(".screen-panel")?.dataset.screenPanel ?? null);
const builderCount = () => page.evaluate(() => document.querySelectorAll(".panel-ship").length);

// --- the boot room and the four doorways ---------------------------------------------
check((await activePanel()) === "comprar", `an empty save opens on Comprar, got ${await activePanel()}`);
check((await builderCount()) === 1, "there must be exactly one ship panel DOM");
check((await builderRoom()) === "comprar", "the ship+rig panels open in the buy room");

for (const room of ["flota", "astillero", "configuracion", "comprar"]) {
  await page.click(`.screen-tab[data-screen="${room}"]`);
  check((await activePanel()) === room, `tab ${room} did not open`);
}
check((await builderCount()) === 1, "tab switching must not clone the ship panel");

// --- Comprar: build one and add her ---------------------------------------------------
await page.click('.screen-tab[data-screen="comprar"]');
check((await page.locator("#launch-btn").textContent()).trim() === "Añadir a la flota", "buying foot action is adding to the fleet");
await page.fill("#ship-name", "Nave del recorrido");
await page.click("#launch-btn");
await page.waitForTimeout(300);
check((await activePanel()) === "comprar", "the buy screen stays put after a purchase (S105)");
check((await builderRoom()) === "comprar", "the ship panels stay in the buy room");

// --- Flota: the strip lives here; refit opens the builder inside the room -------------
await page.click('.screen-tab[data-screen="flota"]');
check((await page.locator(".fleet-item .fleet-name").textContent()) === "Nave del recorrido", "the bought hull is on the fleet strip");
await page.click(".fleet-item .fleet-ship");
await page.waitForTimeout(200);
check((await activePanel()) === "flota", "a refit opens inside the Flota tab");
check((await builderRoom()) === "flota", "the ship panels moved into the fleet room");
check((await page.locator("#launch-btn").textContent()).trim() === "Guardar reforma", "refit foot action is saving the refit");
check((await page.locator("#set-sail-btn").isVisible()), "setting sail is the fleet room's action");
check(String(await page.locator("#refit-mode").textContent()).includes("Nave del recorrido"), "the refit banner names her");

// --- Astillero: her state, her repair and a bought gun --------------------------------
await page.click('.screen-tab[data-screen="astillero"]');
check((await page.locator("#fort-panel").isVisible()), "the fort panel lives in the yard tab");
check((await page.locator("#fort-repair-btn").isDisabled()), "a whole fort offers nothing to fix");
const gunBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1") ?? "{}").fort?.boughtGuns ?? 0);
await page.click("#fort-gun-btn");
await page.waitForTimeout(200);
const gunAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("barcos:game:v1") ?? "{}").fort?.boughtGuns ?? 0);
check(gunAfter === gunBefore + 1, `buying a gun must write the count to the sea save (${gunBefore} -> ${gunAfter})`);
check(String(await page.$eval("#purchase-notice", (n) => n.textContent)).includes("cañón"), "the purchase notice says what was bought");

// --- Configuración: the settings screen is in the room --------------------------------
await page.click('.screen-tab[data-screen="configuracion"]');
// 24: S142 added the danger block ("Peligro"), S160/S161 the oars block ("Remos") and S167
// the fog block ("Niebla"), which the fixed number here had not caught up with.
check((await page.locator(".settings-card").count()) === 24, `the settings tab mounts every block, got ${await page.locator(".settings-card").count()}`);
await page.fill("#field-wind\\.maxSpeedBonus", "500");
await page.click("#settings-apply");
await page.waitForTimeout(200);
check(
  (await page.locator("#field-wind\\.maxSpeedBonus").inputValue()) === "200",
  "the tab clamps like the old screen did",
);

// --- a stale link lands on the same room ----------------------------------------------
await page.goto("http://localhost:8765/config.html", { waitUntil: "networkidle" });
check(page.url().includes("index.html#configuracion"), `config.html must redirect to the tab, got ${page.url()}`);
check((await activePanel()) === "configuracion", "the redirect opens the settings room");

check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
console.log(failures.length === 0 ? "SMOKE OK: the four rooms tour (S97-S101)" : `SMOKE FAILED:\n- ${failures.join("\n- ")}`);
await browser.close();
if (failures.length > 0 || errors.length > 0) process.exit(1);
