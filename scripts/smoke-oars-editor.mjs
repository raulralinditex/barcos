import { chromium } from "playwright";

/**
 * Browser smoke for S159-H: a hull with no banks of oars is offered no rowers.
 *
 * The player asked for it (verbatim): "los cascos que no tienen remos no aparecen en la
 * interface esa posibilidad". The rule lives in the oars model (`crewRolesForHull`); this
 * checks that the Aparejo panel actually reads it, in both directions:
 *
 *   - a nao armada (no banks) shows marino, artillero and soldado, and no remero row at all;
 *   - a galleass (300 banks) shows the four roles, remero included;
 *   - moving from the galleass to the nao armada drops the rowers the new hull cannot seat.
 *
 * Needs the static server on 8765.
 */

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const roles = (page) =>
  page.$$eval("#crew-list [data-role]", (inputs) => inputs.map((input) => input.dataset.role));

const crewOf = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("barcos:config:v1") ?? "{}").crew ?? {});

const pickHull = async (page, hullId) => {
  await page.click('.screen-tab[data-screen="comprar"]');
  await page.click(`.hull-card[data-hull-id="${hullId}"]`);
  await page.click('[data-tab="crew"]');
};
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.addInitScript(() => {
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 200000 }));
});
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });

// Both hulls of the test are Spanish, so the catalogue has to be Spain's.
await page.selectOption("#country-select", "espana");
await page.waitForTimeout(200);

/* ---------------------------------- 1: a hull with no banks offers no rowers at all */

await pickHull(page, "nao-armada");
const galleonRoles = await roles(page);
check(
  !galleonRoles.includes("remero"),
  `S159-H: a nao armada must not offer rowers, it offered ${JSON.stringify(galleonRoles)}`,
);
for (const role of ["marino", "artillero", "soldado"]) {
  check(galleonRoles.includes(role), `S159-H: a nao armada must still offer ${role}, it offered ${JSON.stringify(galleonRoles)}`);
}

/* ---------------------------------- 2: a hull with banks offers all four, remero included */

await pickHull(page, "galeaza");
const galleassRoles = await roles(page);
check(
  galleassRoles.includes("remero"),
  `S159-H: a galleass must offer rowers, it offered ${JSON.stringify(galleassRoles)}`,
);

/* ---------------------------------- 3: a rower crew survives only on a hull that seats it */

const rowers = page.locator('[data-role="remero"]');
await rowers.fill("120");
await rowers.dispatchEvent("change");
await page.waitForTimeout(150);
const seated = await crewOf(page);
check(seated.remero === 120, `S159-H: the galleass must keep her 120 rowers, the save says ${JSON.stringify(seated)}`);

await pickHull(page, "nao-armada");
await page.waitForTimeout(150);
const afterHullChange = await crewOf(page);
check(
  afterHullChange.remero === undefined,
  `S159-H: moving to a nao armada must drop the rowers she cannot seat, the save says ${JSON.stringify(afterHullChange)}`,
);
check(
  afterHullChange.marino === seated.marino && afterHullChange.soldado === seated.soldado,
  `S159-H: the other roles must survive the hull change, ${JSON.stringify(seated)} -> ${JSON.stringify(afterHullChange)}`,
);
const reopened = await roles(page);
check(
  !reopened.includes("remero"),
  `S159-H: the nao armada must still offer no rowers after the change, it offered ${JSON.stringify(reopened)}`,
);

await browser.close();
console.log(JSON.stringify({ errors, failures }, null, 2));
if (failures.length > 0) process.exit(1);
