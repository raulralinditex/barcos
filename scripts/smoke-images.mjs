import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";

/**
 * Browser smoke for the hull pictures (S34), driven through the UI.
 *
 * The picture is an extra, so the two things worth proving are that it appears with
 * its credit when the player picks a hull, and that a hull without one degrades to the
 * silhouette instead of showing a broken image or an unattributed one.
 */

const creditsPath = "assets/ships/credits.json";
const credits = existsSync(creditsPath) ? JSON.parse(readFileSync(creditsPath, "utf8")) : {};

const browser = await chromium.launch();
const errors = [];
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, locale: "es-AR" });
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.goto("http://localhost:8765/index.html", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const picture = () =>
  page.evaluate(() => {
    const figure = document.querySelector("#ship-figure");
    const img = document.querySelector("#ship-photo");
    return {
      hidden: figure?.classList.contains("is-hidden"),
      src: img?.getAttribute("src"),
      naturalWidth: img?.naturalWidth ?? 0,
      caption: document.querySelector("#ship-photo-caption")?.textContent?.trim() ?? "",
      alt: img?.getAttribute("alt") ?? "",
    };
  });

/* ------------------------------------------------- the default hull */

const first = await picture();
check(!first.hidden, "the picture of the opening hull is hidden");
check(first.naturalWidth > 0, `the opening picture did not load (src=${first.src})`);
check(/imagen:/i.test(first.caption), `the credit is missing: "${first.caption}"`);
check(/público|public/i.test(first.caption), `the credit does not name the licence: "${first.caption}"`);
check(first.alt.length > 0, "the picture has no alt text");

/* ------------------------------------------------- a hull of another country */

await page.selectOption("#country-select", "espana");
await page.waitForTimeout(400);
await page.locator('.hull-card[data-hull-id="galeaza"]').click();
await page.waitForTimeout(900);

const second = await picture();
check(!second.hidden, "the picture did not follow the hull change");
check(
  second.src !== first.src,
  `the picture did not change with the hull (still ${second.src})`,
);
check(second.naturalWidth > 0, `the new picture did not load (src=${second.src})`);
check(/imagen:/i.test(second.caption), `the new credit is missing: "${second.caption}"`);
check(
  /galeaza/i.test(second.alt ?? ""),
  `the alt text did not follow the hull: "${second.alt}"`,
);

/* ------------------------------------------------- clicking shows the picture whole (S41) */

const geometry = () =>
  page.evaluate(() => {
    const img = document.querySelector("#ship-photo");
    const rect = img.getBoundingClientRect();
    const style = getComputedStyle(img);
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      fit: style.objectFit,
      position: style.position,
      canvasTop: Math.round(document.querySelector("#ship-canvas").getBoundingClientRect().top),
      natural: [img.naturalWidth, img.naturalHeight],
    };
  });

await page.mouse.move(5, 5);
await page.waitForTimeout(300);
const rest = await geometry();

// Hovering alone must NOT enlarge it any more: the player asked for a click.
await page.locator("#ship-photo").hover();
await page.waitForTimeout(400);
const hovered = await geometry();
check(rest.fit === "cover", `the thumbnail should be a cropped banner, got object-fit ${rest.fit}`);
check(
  hovered.position !== "fixed" && hovered.height === rest.height && hovered.fit === "cover",
  `hovering must not enlarge the picture (${rest.height} -> ${hovered.height} px, ${hovered.position})`,
);

await page.locator("#ship-photo").click();
await page.waitForTimeout(400);
const zoomed = await geometry();
check(zoomed.fit === "contain", `the enlarged picture must not be cropped, got object-fit ${zoomed.fit}`);
check(zoomed.height > rest.height * 1.5, `clicking did not enlarge the picture (${rest.height} -> ${zoomed.height} px)`);
check(zoomed.width >= rest.width * 0.9, `the enlarged picture got narrower (${rest.width} -> ${zoomed.width} px)`);
// "Whole" means the box keeps the picture's own proportions: nothing is cut off.
const ratioBox = zoomed.width / zoomed.height;
const ratioFile = zoomed.natural[0] / zoomed.natural[1];
check(
  Math.abs(ratioBox - ratioFile) < 0.05,
  `the enlarged box is not the picture's own shape (${ratioBox.toFixed(2)} vs ${ratioFile.toFixed(2)}): it would be cropped`,
);
check(
  zoomed.canvasTop === rest.canvasTop,
  `the panel jumped ${zoomed.canvasTop - rest.canvasTop} px while the picture was enlarged`,
);

// It is a click mode, not a hover mode: it stays open when the pointer moves away.
await page.mouse.move(5, 5);
await page.waitForTimeout(400);
const stayed = await geometry();
check(stayed.position === "fixed", "the picture closed on its own when the pointer left: it must wait for a click");

// A click on the enlarged picture turns the page to the hull's next picture (S76). It
// does NOT close it any more: the zoom is dismissed with Escape or a click elsewhere.
const beforeRotate = await page.evaluate(() => ({
  src: document.querySelector("#ship-photo").getAttribute("src"),
  caption: document.querySelector("#ship-photo-caption").textContent.trim(),
}));
await page.locator("#ship-photo").click();
await page.waitForTimeout(600);
const rotated = await geometry();
const afterRotate = await page.evaluate(() => ({
  src: document.querySelector("#ship-photo").getAttribute("src"),
  caption: document.querySelector("#ship-photo-caption").textContent.trim(),
  loaded: document.querySelector("#ship-photo").naturalWidth > 0,
}));
check(
  afterRotate.src !== beforeRotate.src,
  `clicking the enlarged picture did not turn to the next picture (still ${afterRotate.src})`,
);
check(
  afterRotate.caption !== beforeRotate.caption,
  `the credit did not follow the picture change: "${afterRotate.caption}"`,
);
check(afterRotate.loaded, `the second picture did not load (src=${afterRotate.src})`);
check(rotated.position === "fixed", "the picture closed instead of turning the page: it must stay enlarged");

// The rotation is a cycle: one more click comes back to the first picture.
await page.locator("#ship-photo").click();
await page.waitForTimeout(600);
const backToFirst = await page.evaluate(() => document.querySelector("#ship-photo").getAttribute("src"));
check(
  backToFirst === beforeRotate.src,
  `the rotation did not wrap back to the first picture (${backToFirst} vs ${beforeRotate.src})`,
);
check((await geometry()).position === "fixed", "the picture closed on the wrapping click");

// Escape closes it.
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const closedByEscape = await geometry();
check(closedByEscape.position !== "fixed", "Escape did not close the enlarged picture");
check(
  closedByEscape.height === rest.height,
  `the thumbnail did not come back after Escape (${closedByEscape.height} vs ${rest.height})`,
);

// A click anywhere outside the picture closes it too.
await page.locator("#ship-photo").click();
await page.waitForTimeout(300);
check((await geometry()).position === "fixed", "the click after Escape did not enlarge the picture again");
await page.mouse.click(5, 5);
await page.waitForTimeout(300);
check((await geometry()).position !== "fixed", "a click outside the picture did not close it");

/* ------------------------------------------------- the verdict is a sentence, not a key */

const verdict = (await page.locator("#verdict-issues").textContent()) ?? "";
check(!/\bissue\.[a-z]+/i.test(verdict), `the verdict shows an untranslated key: "${verdict.trim()}"`);

/* ------------------------------------------------- every bundled picture loads */

const bundled = Object.keys(credits);
let loaded = 0;
for (const hullId of bundled) {
  const ok = await page.evaluate(async (path) => {
    const img = new Image();
    img.src = path;
    try {
      await img.decode();
      return img.naturalWidth > 0;
    } catch {
      return false;
    }
  }, `./assets/ships/${hullId}.jpg`);
  if (ok) loaded += 1;
  else failures.push(`the bundled picture for ${hullId} does not load`);
}
check(
  loaded === bundled.length,
  `${bundled.length - loaded} bundled pictures do not load`,
);

await browser.close();

const result = { errors, bundled: bundled.length, loaded, first, second, failures };
console.log(JSON.stringify(result, null, 2));

if (errors.length) failures.push(`console errors: ${errors.join(" | ")}`);
if (failures.length) {
  console.error(`SMOKE FAILED:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("SMOKE OK: each hull shows its own credited picture, enlarged whole on click");
