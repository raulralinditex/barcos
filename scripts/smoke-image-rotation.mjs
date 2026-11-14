import { chromium } from "playwright";

/**
 * Browser smoke for several pictures per hull (S76). Needs the local server on 8765.
 *
 * A hull with more than one picture turns to the next one when clicked, and the credit
 * under it changes with the picture, so the author on screen is always the author of the
 * image on screen.
 */

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };

const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, locale: "es-AR" });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.addInitScript(() => localStorage.setItem("barcos:lang:v1", "es"));
await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(600);

// The shipyard sells only the active country's hulls (S26), and the default is England.
// `barca-costera` is English and has two pictures, so it is on the shelf from the start.
await page.locator('[data-hull-id="barca-costera"]').click();
await page.waitForTimeout(500);

const src = () => page.locator("#ship-photo").getAttribute("src");
const caption = () => page.locator("#ship-photo-caption").textContent();

const first = await src();
const firstCaption = await caption();
check(Boolean(first), "S76: the hull should show a picture");

// First click opens the picture; the next ones turn the page.
await page.locator("#ship-photo").click();
await page.waitForTimeout(300);
check((await src()) === first, "S76: the first click should only open the picture, not change it");

await page.locator("#ship-photo").click();
await page.waitForTimeout(300);
const second = await src();
const secondCaption = await caption();
check(second !== first, `S76: a click on an open picture should turn to the next one (still ${second})`);
check(
  secondCaption !== firstCaption,
  `S76: the credit must follow the picture, it still reads "${secondCaption}"`,
);

// A third click wraps back to the first.
await page.locator("#ship-photo").click();
await page.waitForTimeout(300);
check((await src()) === first, `S76: the last picture should wrap to the first, got ${await src()}`);

await page.close();
await browser.close();

if (errors.length) failures.push(`browser errors: ${errors.join("; ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`SMOKE OK: ${first} -> ${second} -> ${first}, credit "${firstCaption.trim()}" -> "${secondCaption.trim()}"`);
