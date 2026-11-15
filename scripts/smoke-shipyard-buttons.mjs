import { chromium } from "playwright";

// S46: purchases stay in the shipyard; sailing uses the fleet as saved.
const browser = await chromium.launch();
const failures = [];
const errors = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const expectations = {
  es: { add: "Añadir a la flota", sail: "Zarpar", notice: "Golden Hind añadida a la flota." },
  en: { add: "Add to fleet", sail: "Set sail", notice: "Golden Hind added to the fleet." },
};

try {
  for (const [language, width] of [["es", 1400], ["en", 1500]]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, locale: language });
    page.on("pageerror", (error) => errors.push(`${language}: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${language}: ${message.text()}`);
    });
    await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
    await page.evaluate((lang) => {
      localStorage.clear();
      localStorage.setItem("barcos:lang:v1", lang);
      localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 40000 }));
    }, language);
    await page.reload({ waitUntil: "networkidle" });

    const add = page.locator("#launch-btn");
    const sail = page.locator("#set-sail-btn");
    check((await add.textContent())?.trim() === expectations[language].add, `${language}: add button label`);
    const hasSail = await sail.count() === 1;
    check(hasSail, `${language}: set-sail button exists`);
    check(await page.locator("#sail-dialog").count() === 0, `${language}: launch dialog must be removed`);
    if (hasSail) {
      check((await sail.textContent())?.trim() === expectations[language].sail, `${language}: sail button label`);
      check(await sail.isDisabled(), `${language}: empty fleet must not sail`);
      check(await sail.evaluate((el) => !!el.closest(".footer .launch")), `${language}: sail button belongs in the footer actions`);
      check(await sail.evaluate((el) => !el.closest(".fleet-bar")), `${language}: sail button must leave the fleet panel`);
      check(await sail.evaluate((el) => el.parentElement === document.querySelector("#launch-btn")?.parentElement && el.parentElement === document.querySelector("#erase-btn")?.parentElement), `${language}: sail shares the add and erase actions`);
    }

    const layout = await page.evaluate(() => {
      const bar = document.querySelector(".topbar");
      const children = [...bar.children].map((el) => el.getBoundingClientRect());
      return { overflow: children.some((rect) => rect.left < 0 || rect.right > innerWidth),
        overlap: children.some((rect, i) => children.slice(i + 1).some((other) =>
          rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)) };
    });
    check(!layout.overflow && !layout.overlap, `${language}: topbar layout at ${width}px`);

    await page.fill("#ship-name", "Golden Hind");
    const price = await page.evaluate(() => Number(document.querySelector("#price-total").textContent.replace(/\D/g, "")));
    check(!(await add.isDisabled()), `${language}: affordable ship can be added`);
    await add.focus();
    check(await add.evaluate((el) => document.activeElement === el), `${language}: add button is keyboard reachable`);
    await page.keyboard.press("Enter");
    const saved = await page.evaluate(() => ({
      fleet: JSON.parse(localStorage.getItem("barcos:fleet:v1") ?? "null"),
      game: JSON.parse(localStorage.getItem("barcos:game:v1") ?? "null"),
      openDialogs: document.querySelectorAll("dialog[open]").length,
      notice: document.querySelector('[role="status"]')?.textContent.trim(),
    }));
    check(page.url().endsWith("/index.html"), `${language}: purchase stays in shipyard`);
    check(saved.openDialogs === 0, `${language}: purchase opens no dialog`);
    check(saved.notice === expectations[language].notice, `${language}: named purchase notice`);
    const otherLanguage = language === "es" ? "en" : "es";
    await page.selectOption("#lang-select", otherLanguage);
    check((await page.locator("#purchase-notice").textContent()).trim() === expectations[otherLanguage].notice, `${language}: purchase notice follows language changes`);
    await page.selectOption("#lang-select", language);
    check(saved.fleet?.ships.length === 1 && saved.fleet.ships[0].name === "Golden Hind" && saved.fleet.captainId === saved.fleet.ships[0].id, `${language}: purchase saves captain`);
    check(Math.round(saved.fleet?.ships[0]?.paidGold) === price && Math.abs(saved.game?.gold - (40000 - saved.fleet?.ships[0]?.paidGold)) < 1e-8, `${language}: purchase charges exact price`);

    if (hasSail) {
      // Sailing is the Flota room's action now (S105): the buy room hides it on purpose.
      await page.click('.screen-tab[data-screen="flota"]');
      await page.waitForTimeout(150);
      check(!(await sail.isDisabled()), `${language}: first purchase enables sailing`);
      await page.reload({ waitUntil: "networkidle" });
      await page.click('.screen-tab[data-screen="flota"]');
      await page.waitForTimeout(150);
      check(!(await sail.isDisabled()), `${language}: saved fleet enables sailing on reload`);
      await sail.focus();
      check(await sail.evaluate((el) => document.activeElement === el), `${language}: sail button is keyboard reachable`);
      await Promise.all([page.waitForURL("**/sea.html"), page.keyboard.press("Enter")]);
      check((await page.locator("#hud-ship-name").textContent()).startsWith("Golden Hind"), `${language}: sea uses saved captain`);
    }
    await page.close();
  }

  // A purchase must revalidate the remaining purse before another click.
  const poor = await browser.newPage();
  await poor.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await poor.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 12000 }));
  });
  await poor.reload({ waitUntil: "networkidle" });
  // Buying lives in the Comprar tab (S99): without a fleet the yard opens there, which
  // this page already is; the click below is the purchase itself.
  await poor.click("#launch-btn");
  const beforeRetry = await poor.evaluate(() => [localStorage.getItem("barcos:fleet:v1"), localStorage.getItem("barcos:game:v1")]);
  // After a purchase the player lands on the fleet (S98): the buy button is out of the
  // room, so the revalidation is observed by going back to buying, where the purse left
  // must leave the button disabled.
  // A stray repeat click is refused by the purse check at launch (S99): no debt, no
  // second hull. The button's own disabled state is the buy room's business, observed
  // when the player returns to buying.
  await poor.locator("#launch-btn").evaluate((button) => button.click());
  await poor.locator("#launch-btn").evaluate((button) => button.click());
  const afterRetry = await poor.evaluate(() => [localStorage.getItem("barcos:fleet:v1"), localStorage.getItem("barcos:game:v1")]);
  check(JSON.stringify(beforeRetry) === JSON.stringify(afterRetry), "rejected repeat purchase must not change fleet or purse");
  await poor.click('.screen-tab[data-screen="comprar"]');
  check(await poor.locator("#launch-btn").isDisabled(), "remaining purse must disable an unaffordable repeat purchase");
  await poor.close();

  // The footer sail button must respect the fleet panel and captain selection.
  const fleetPage = await browser.newPage();
  await fleetPage.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await fleetPage.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("barcos:game:v1", JSON.stringify({ gold: 40000 }));
  });
  await fleetPage.reload({ waitUntil: "networkidle" });
  // Buying lives in the Comprar tab (S99), and the fleet now lives in the Flota tab (S97).
  await fleetPage.click('.screen-tab[data-screen="comprar"]');
  await fleetPage.fill("#ship-name", "Golden Hind");
  await fleetPage.click("#launch-btn");
  await fleetPage.click('.screen-tab[data-screen="comprar"]');
  await fleetPage.fill("#ship-name", "Avispa");
  await fleetPage.click("#launch-btn");
  check((await fleetPage.locator(".fleet-item.is-captain .fleet-name").textContent()) === "Avispa", "second purchase becomes captain");
  // The fleet strip lives in the Flota room (S105).
  await fleetPage.click('.screen-tab[data-screen="flota"]');
  await fleetPage.waitForTimeout(150);
  await fleetPage.locator(".fleet-item").first().locator(".fleet-check").uncheck();
  const selected = await fleetPage.evaluate(() => JSON.parse(localStorage.getItem("barcos:fleet:v1")));
  check(selected.ships[0].sails === false && selected.captainId === selected.ships[1].id, "fleet checkbox and captain are saved");
  await fleetPage.click('.screen-tab[data-screen="flota"]');
  await Promise.all([fleetPage.waitForURL("**/sea.html"), fleetPage.click("#set-sail-btn")]);
  check((await fleetPage.locator("#hud-ship-name").textContent()).startsWith("Avispa"), "sailing uses the selected captain");
  const world = await fleetPage.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    return JSON.parse(JSON.parse(localStorage.getItem("barcos:game:v1")).world);
  });
  check(!(world.escorts ?? []).some((escort) => escort.id === selected.ships[0].id), "unchecked hull stays ashore");
  await fleetPage.close();
} finally {
  await browser.close();
}

if (errors.length) failures.push(`browser errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exitCode = 1;
} else {
  console.log("SMOKE OK: S46 shipyard buttons, purchase, reload and sailing (es/en)");
}
