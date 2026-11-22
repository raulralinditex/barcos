/**
 * Browser smoke for the shipyard layout changes (S88), driven through the screen.
 *
 * Three things the player asked for, each one visible:
 *   - the automatic-fire switch is no longer in the fleet panel;
 *   - it is a setting now, so it lives on the settings screen;
 *   - the set-sail button moved down with the other action buttons, out of the fleet panel.
 */

import { chromium } from "playwright";

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.addInitScript(() => localStorage.setItem("barcos:lang:v1", "es"));

/* ------------------------------------------------ the shipyard: nothing in the fleet panel */

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(900);

const yard = await page.evaluate(() => {
  const fleetBar = document.querySelector(".fleet-bar");
  const footer = document.querySelector(".footer");
  const sail = document.querySelector("#set-sail-btn");
  return {
    autofireInFleet: Boolean(fleetBar?.querySelector("#autofire-check")),
    autofireAnywhere: Boolean(document.querySelector("#autofire-check")),
    sailInFleet: Boolean(fleetBar?.querySelector("#set-sail-btn")),
    sailInFooter: Boolean(footer?.querySelector("#set-sail-btn")),
    sailInDom: Boolean(sail),
    // The button must sit next to the add one, which is what "abajo con los botones" means
    // ("Reiniciar" moved to the top bar, next to the language picker).
    sailNextToErase:
      sail?.parentElement === document.querySelector("#launch-btn")?.parentElement,
  };
});
check(!yard.autofireInFleet, "the fleet panel still holds the automatic-fire switch");
check(!yard.autofireAnywhere, "the automatic-fire checkbox still exists somewhere on the shipyard");
check(yard.sailInDom, "the set-sail button disappeared");
check(!yard.sailInFleet, "the set-sail button is still inside the fleet panel");
check(yard.sailInFooter, "the set-sail button did not move to the footer");
check(yard.sailNextToErase, "the set-sail button is not with the other action buttons");

/* ------------------------------------------------ the switch is a setting now */

const settings = await browser.newPage({ viewport: { width: 1500, height: 1200 }, locale: "es-AR" });
settings.on("pageerror", (err) => errors.push(`settings pageerror: ${err.message}`));
await settings.goto("http://localhost:8765/config.html", { waitUntil: "networkidle" });
await settings.waitForTimeout(700);
// S168: the screen opens on the `sea` branch and `combat` lives under `fight`, so the field is
// in the DOM but not visible. Reading its attributes did not need it on screen; ticking it
// does, and Playwright waits 30 s for visibility before failing.
await settings.click('[data-branch-pick="fight"]');

const field = settings.locator("#field-combat\\.autofire");
check((await field.count()) === 1, "the settings screen has no automatic-fire field");
// S168: the field is a checkbox now, so it is read as one. A checkbox carries no `min`/`max`
// and its `value` is always "on"; the 0..1 range it answers to lives in the model, not in
// these attributes, so the smoke proves the two states by ticking it, not by reading them.
const state = await settings.evaluate(() => {
  const input = document.querySelector("#field-combat\\.autofire");
  return {
    type: input?.type,
    checked: input?.checked,
    label: input?.closest(".settings-row")?.querySelector(".settings-label")?.textContent?.trim() ?? "",
  };
});
check(state.type === "checkbox", `the switch must be a checkbox, it is a ${state.type}`);
check(state.checked === true, "the switch must ship on");
check(/autom/i.test(state.label), `the field has no readable label: "${state.label}"`);
await field.uncheck();
check((await field.isChecked()) === false, "the switch cannot be turned off");
await field.check();
check((await field.isChecked()) === true, "the switch cannot be turned back on");

await browser.close();

const result = { errors, yard, state, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the switch is a setting and the set-sail button sits with the actions");
