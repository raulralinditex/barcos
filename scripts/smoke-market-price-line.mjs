import assert from "node:assert/strict";
import { chromium } from "playwright";

// The buy price must start below the good's name and weight, not beside them.
// Needs the local development server on port 8765.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, locale: "es-AR" });
  await page.addInitScript(() => localStorage.setItem("barcos:lang:v1", "es"));
  await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
  await page.click('.screen-tab[data-screen="mercado"]');
  const rows = page.locator(".market-row");
  assert.ok(await rows.count() > 0, "the market must show goods");
  for (const width of [1500, 900, 320]) {
    await page.setViewportSize({ width, height: 950 });
    const positions = await rows.evaluateAll((elements) => elements.map((row) => {
      const rect = (selector) => {
        const box = row.querySelector(selector).getBoundingClientRect();
        return { top: box.top, bottom: box.bottom };
      };
      return { good: rect(".market-name"), weight: rect(".market-kg"), buy: rect(".market-price") };
    }));
    for (const position of positions) {
      assert.ok(position.buy.top >= Math.max(position.good.bottom, position.weight.bottom),
        `buy price must be on another line at ${width}px: ${JSON.stringify(position)}`);
    }
  }
  console.log("Market buy price appears on a separate line at all three viewport widths.");
} finally {
  await browser.close();
}
