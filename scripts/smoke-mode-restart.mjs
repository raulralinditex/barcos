import { chromium } from "playwright";

/**
 * Browser smoke for S173: the restart button is where the player picks the game.
 *
 * F2 of the refactor. The player asked for it (verbatim): "cuando le damos al boton reiniciar
 * seleccionariamos el tipo de juego". The second mode is her call and not written yet, so what
 * this smoke proves is the seam: the dialog draws the registry, every entry shows a readable
 * name and description, and the choice reaches the key the sea reads.
 *
 * The claims, through the screen:
 *   1. the restart dialog offers a "Tipo de juego" list;
 *   2. the list holds every mode of the registry, with a name that is not a raw key;
 *   3. the shipped mode is the one preselected;
 *   4. confirming writes the chosen id to `barcos:mode:v1` and erases the voyage.
 */

const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 }, locale: "es-AR" });
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  await page.addInitScript(() => {
    // `addInitScript` runs on EVERY navigation, including the reload the restart does. Without
    // this flag the seeded voyage would come back right after being erased, and the smoke
    // would read its own fixture instead of the result.
    if (sessionStorage.getItem("mode-restart-seeded")) return;
    sessionStorage.setItem("mode-restart-seeded", "1");
    localStorage.setItem("barcos:lang:v1", "es");
    // A voyage in progress, so the restart has something to erase.
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 4321 }));
  });
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  /* ------------------------------- 1. the dialog has the list */

  await page.click("#erase-btn");
  check(await page.locator("#erase-dialog[open]").count() === 1, "the restart dialog did not open");
  check(
    (await page.locator("#mode-picker").count()) === 1,
    "S173: the restart dialog has no game-type list",
  );

  /* ------------------- 2 and 3. the list is the registry, shipped one preselected */

  const options = await page.locator("#mode-options .mode-option").evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.querySelector("input")?.value ?? "",
      name: node.querySelector("strong")?.textContent?.trim() ?? "",
      description: node.querySelector(".mode-option-description")?.textContent?.trim() ?? "",
      checked: Boolean(node.querySelector("input")?.checked),
    })),
  );
  check(options.length >= 1, "S173: the game-type list is empty");
  check(
    options.some((option) => option.id === "batalla-por-nivel"),
    `S173: the shipped mode is missing from the list, got ${JSON.stringify(options.map((o) => o.id))}`,
  );
  for (const option of options) {
    check(option.name.length > 0, `S173: the mode "${option.id}" has no name`);
    check(!/^mode\./.test(option.name), `S173: the mode "${option.id}" prints a raw key: "${option.name}"`);
    check(option.description.length > 0, `S173: the mode "${option.id}" has no description`);
  }
  check(
    options.filter((option) => option.checked).length === 1,
    "S173: exactly one game type must be preselected",
  );
  check(
    options.find((option) => option.checked)?.id === "batalla-por-nivel",
    "S173: the shipped mode must be the one preselected",
  );

  /* --------------------- 4. confirming stores the choice and erases the voyage */

  await page.click("#erase-confirm");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    mode: localStorage.getItem("barcos:mode:v1"),
    game: localStorage.getItem("barcos:game:v1"),
  }));
  check(after.mode === "batalla-por-nivel", `S173: the chosen mode was not stored, got ${after.mode}`);
  // The shipyard writes its own record back the moment it paints, so the key exists again:
  // what proves the erase is that the 4321 doblones of the old voyage are gone.
  const gold = after.game ? JSON.parse(after.game).gold : null;
  check(gold !== 4321, `S173: the old voyage survived the restart, the purse still holds ${gold}`);

  if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: the restart dialog lists the registry, and the choice reaches the sea");
