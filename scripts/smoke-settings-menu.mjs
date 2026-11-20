/**
 * Browser smoke for the settings menu (S143). Needs the local server on 8765.
 *
 * The player asked for it (verbatim): "en el panel de configuracion, empieza a haber muchos
 * paneles, crea un menu lateral con ramas si es necesario y agrupa toda esa informacion".
 * His decision (verbatim): "Una rama a la vez, plegables, recuerda la elegida".
 *
 * What is proven here, through the screen only:
 *   1. the menu is on the left with the five branches, and the first one is showing;
 *   2. choosing a branch shows exactly its blocks and hides the rest;
 *   3. a branch unfolds into its blocks, and choosing one shows only that block;
 *   4. the catalogue is a branch of its own and appears under no other;
 *   5. the choice survives a reload, and a stored choice that no longer exists falls back
 *      to the first branch instead of leaving the screen empty;
 *   6. every block is still mounted, so Guardar still saves the whole screen.
 */

import { chromium } from "playwright";

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const NAV_KEY = "barcos:settings-nav:v1";

// One context: the whole point of point 5 is that the choice survives a reload.
const context = await browser.newContext({ viewport: { width: 1400, height: 1100 }, locale: "es-AR" });
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));

const openSettings = async () => {
  await page.click('.screen-tab[data-screen="configuracion"]');
  await page.waitForTimeout(300);
};

/** The blocks that are actually on screen, by their group id. */
const shownBlocks = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".settings-card")]
      .filter((card) => card.offsetParent !== null)
      .map((card) => card.dataset.group),
  );

const markedEntry = () =>
  page.evaluate(() => [...document.querySelectorAll('[aria-current="true"]')].map((node) => node.textContent));

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.evaluate((key) => {
  localStorage.clear();
  localStorage.setItem("barcos:lang:v1", "es");
  localStorage.removeItem(key);
}, NAV_KEY);
await page.reload({ waitUntil: "networkidle" });
await openSettings();

/* ---------------------------------------------------------------- 1. the menu exists */

const branches = await page.locator(".settings-menu-branch").evaluateAll((nodes) =>
  nodes.map((node) => ({ id: node.dataset.branch, label: node.querySelector(".settings-menu-branch-pick")?.textContent })),
);
check(branches.length === 5, `the menu must list five branches, found ${branches.length}`);
check(
  branches.map((branch) => branch.id).join(",") === "sea,fight,yard,trade,catalogue",
  `the branches are in the wrong order: ${branches.map((branch) => branch.id).join(",")}`,
);
check(
  branches.every((branch) => (branch.label ?? "").trim().length > 0),
  `every branch must be named, got ${JSON.stringify(branches)}`,
);
check(
  (await page.locator("#settings-menu").evaluate((node) => node.offsetHeight)) > 0,
  "the menu must be on screen",
);

/* ---------------------------------------------------------------- 2. one branch at a time */

// Nothing is chosen yet, so the first branch is showing and nothing else is.
const first = await shownBlocks();
check(
  first.sort().join(",") === "fog,levels,time,voyage,wind,world",
  `the first branch must show its six blocks, got ${first.join(",")}`,
);
check(
  JSON.stringify(await markedEntry()) === JSON.stringify(["Mar y mundo"]),
  `the first branch must be the chosen one, got ${JSON.stringify(await markedEntry())}`,
);
check(
  (await page.locator("#settings-catalogue").evaluate((node) => node.offsetParent === null)),
  "the catalogue must stay hidden while another branch is chosen",
);

// The blocks of the other branches are hidden, not gone: they are still in the DOM.
const mounted = await page.locator(".settings-card").count();
check(mounted === 24, `every block must stay mounted, found ${mounted}`);
check(
  (await page.locator(".settings-card .settings-row").count()) > 20,
  "the rows of the hidden blocks must still be in the DOM",
);

// Choosing the fight branch shows its seven blocks and hides the sea's.
await page.click('[data-branch-pick="fight"]');
await page.waitForTimeout(200);
const fight = await shownBlocks();
check(
  fight.sort().join(",") === "bars,combat,danger,escort,oars,trail,turning,zones",
  `the fight branch must show its eight blocks, got ${fight.join(",")}`,
);
check(
  (await page.evaluate((key) => localStorage.getItem(key), NAV_KEY)) === "fight",
  "the chosen branch must be stored",
);

/* ---------------------------------------------------------------- 3. a branch unfolds into its blocks */

// A block of a folded branch is not clickable until its branch is unfolded.
const fightOpen = await page.locator('.settings-menu-branch[data-branch="fight"]').evaluate((node) =>
  node.classList.contains("is-open"),
);
check(fightOpen, "choosing a branch must unfold it");

await page.click('[data-branch-toggle="fight"]');
await page.waitForTimeout(150);
check(
  (await page.locator('.settings-menu-branch[data-branch="fight"]').evaluate((node) => node.classList.contains("is-open"))) === false,
  "the arrow must fold the branch again",
);
await page.click('[data-branch-toggle="fight"]');
await page.waitForTimeout(150);

await page.click('[data-group-pick="danger"]');
await page.waitForTimeout(200);
const one = await shownBlocks();
check(one.join(",") === "danger", `choosing one block must show only that block, got ${one.join(",")}`);
check(
  (await page.evaluate((key) => localStorage.getItem(key), NAV_KEY)) === "fight/danger",
  "the chosen block must be stored with its branch",
);
check(
  JSON.stringify(await markedEntry()) === JSON.stringify(["Peligro"]),
  `the chosen block must be the one marked, got ${JSON.stringify(await markedEntry())}`,
);
// The switch of that block is the one the danger feature reads (S142-D), so the menu
// lands the player on a block she can actually use.
check(
  (await page.locator("#field-danger\\.show").isVisible()),
  "the danger switch must be reachable from the menu",
);

/* ---------------------------------------------------------------- 4. the catalogue is its own branch */

await page.click('[data-branch-pick="catalogue"]');
await page.waitForTimeout(200);
check((await shownBlocks()).length === 0, "the catalogue branch shows no tuning block");
check(
  (await page.locator("#settings-catalogue").evaluate((node) => node.offsetParent !== null)),
  "the catalogue must be on screen under its own branch",
);
check(
  (await page.locator(".catalogue-card").count()) === 1,
  "the catalogue editor must be the thing that branch shows",
);

/* ---------------------------------------------------------------- 5. it remembers, and it never goes empty */

await page.click('[data-branch-pick="trade"]');
await page.waitForTimeout(200);
await page.reload({ waitUntil: "networkidle" });
await openSettings();
const restored = await shownBlocks();
check(
  restored.sort().join(",") === "commerce,loot,prices,sales,yardMarkets",
  `the reload must restore the trade branch, got ${restored.join(",")}`,
);
check(
  JSON.stringify(await markedEntry()) === JSON.stringify(["Economía"]),
  `the reload must mark the restored branch, got ${JSON.stringify(await markedEntry())}`,
);

// A stored choice that no longer means anything falls back to something showable, and
// never to an empty screen: a lost block falls back to its own branch, a lost branch to
// the first one, and a block asked for under the wrong branch to that branch.
const staleCases = [
  { saved: "ghost", expected: "fog,levels,time,voyage,wind,world", why: "an unknown branch" },
  { saved: "nope/nope", expected: "fog,levels,time,voyage,wind,world", why: "an unknown branch and block" },
  { saved: "fight/ghost", expected: "bars,combat,danger,escort,oars,trail,turning,zones", why: "a block that no longer exists" },
  { saved: "sea/danger", expected: "fog,levels,time,voyage,wind,world", why: "a block of another branch" },
];
for (const { saved, expected, why } of staleCases) {
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [NAV_KEY, saved]);
  await page.reload({ waitUntil: "networkidle" });
  await openSettings();
  const fallback = await shownBlocks();
  check(
    fallback.sort().join(",") === expected,
    `«${saved}» (${why}) must fall back to ${expected}, got ${fallback.join(",")}`,
  );
}

/* ---------------------------------------------------------------- 6. the screen still saves as a whole */

// Guardar reads every block, hidden ones included: the menu must not narrow the save.
await page.fill("#field-wind\\.maxSpeedBonus", "150");
// The repair block is hidden under this branch, so the value is set the way the screen
// reads it back — the input itself — and the save is what proves it still counts.
await page.evaluate(() => {
  const input = document.querySelector('#field-repair\\.shareOfPrice');
  input.value = "55";
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
await page.click("#settings-apply");
await page.waitForTimeout(250);
const stored = JSON.parse(await page.evaluate(() => localStorage.getItem("barcos:settings:v1")));
check(
  stored["wind.maxSpeedBonus"] === 1.5,
  `a value of the visible branch must be saved, got ${stored["wind.maxSpeedBonus"]}`,
);
check(
  stored["repair.shareOfPrice"] === 0.55,
  `a value of a hidden block must be saved too, got ${stored["repair.shareOfPrice"]}`,
);

// English must translate the menu, not only the blocks.
await page.selectOption("#lang-select", "en");
await page.waitForTimeout(300);
const englishBranches = await page.locator(".settings-menu-branch-pick").allTextContents();
check(
  englishBranches.includes("Sea and world") && englishBranches.includes("Catalogue"),
  `the menu must speak the chosen language, got ${englishBranches.join(", ")}`,
);

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `SMOKE OK: the settings menu groups the ${mounted} blocks in ${branches.length} branches, one at a time, remembered and never empty`,
);
