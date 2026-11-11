import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(200);

const read = async () => ({
  gold: await page.locator("#gold-value").textContent(),
  delta: await page.locator("#gold-delta").textContent(),
  guns: await page.locator("#guns-total").textContent(),
  babor: await page.locator("#guns-babor").textContent(),
  estribor: await page.locator("#guns-estribor").textContent(),
  price: await page.locator("#price-total").textContent(),
  verdict: (await page.locator("#verdict-issues").textContent()).slice(0, 260),
  draft: await page.locator("#stat-draft").textContent(),
  speed: await page.locator("#stat-speed").textContent(),
  load: await page.locator("#stat-load").textContent(),
  cargoRoom: await page.locator("#stat-cargo-room").textContent(),
  people: await page.locator("#stat-people").textContent(),
  launchDisabled: await page.locator("#launch-btn").isDisabled(),
  segments: await page.locator(".mass-seg").count(),
  legend: await page.locator(".mass-legend span").count(),
});

const initial = await read();
await page.screenshot({ path: "/tmp/shipyard-initial.png" });

// unaffordable hull: the launch button must lock and the price must turn red
await page.locator(".hull-card", { hasText: "Gran buque real" }).click();
await page.waitForTimeout(150);
const flagship = await read();
const priceOver = await page.locator(".price").evaluate((el) => el.classList.contains("over"));

// back to the default hull and launch
await page.locator(".hull-card", { hasText: "Galeón pequeño" }).click();
await page.waitForTimeout(150);
await page.fill("#ship-name", "Golden Hind");
await page.waitForTimeout(100);
const restored = await read();

await page.click("#launch-btn");
await page.waitForTimeout(250);
const dialogOpen = await page.locator("#sail-dialog").evaluate((el) => el.open);
const dialogTitle = await page.locator("#sail-title").textContent();
const dialogStats = await page.locator(".sail-stats div").count();
await page.screenshot({ path: "/tmp/shipyard-dialog.png" });

const stored = await page.evaluate(() => {
  const raw = localStorage.getItem("barcos:fleet:v1");
  if (!raw) return null;
  const fleet = JSON.parse(raw);
  const ship = fleet.ships.find((s) => s.id === fleet.captainId) ?? fleet.ships[0];
  if (!ship) return null;
  return { name: ship.name, hullId: ship.hullId, guns: ship.guns, speedKn: +ship.speedKn.toFixed(2) };
});

console.log(JSON.stringify({
  errors, initial, flagship: { ...flagship, priceOver }, restored,
  dialog: { dialogOpen, dialogTitle, dialogStats }, stored,
}, null, 2));

await browser.close();
