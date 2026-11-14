/**
 * The hull picture (S34): the path and the credit are pure, the loading is the
 * browser's job. These tests pin the two rules that protect the player: a broken or
 * missing picture must never break the shipyard, and the credit must always be there.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { HULLS } from "../src/data/naval-data.js";
import {
  SHIP_IMAGE_DIR,
  shipImageCredit,
  shipImagePath,
} from "../src/model/ship-image.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const credit = {
  author: "Willem van de Velde",
  license: "Public domain",
  source: "https://commons.wikimedia.org/wiki/File:Example.jpg",
};

/* ---------------------------------------------------------------- the path */

test("S34: a known hull resolves to its bundled picture", () => {
  assert.equal(shipImagePath("galeon-pequeno"), `${SHIP_IMAGE_DIR}galeon-pequeno.jpg`);
});

test("S34: an unusable hull id yields no path instead of a broken one", () => {
  for (const value of ["", "   ", null, undefined, 42, {}, "../etc/passwd", "/abs/path", "a/b", "A B"]) {
    assert.equal(shipImagePath(value), null, `id ${JSON.stringify(value) ?? String(value)}`);
  }
});

test("S34: the path never escapes the assets directory", () => {
  for (const hull of HULLS) {
    const path = shipImagePath(hull.id);
    assert.ok(path.startsWith(SHIP_IMAGE_DIR), `${hull.id} resolved outside the asset dir`);
    assert.ok(!path.includes(".."), `${hull.id} resolved with a parent segment`);
  }
});

/* ---------------------------------------------------------------- the credit */

test("S34: a complete credit is returned as it is", () => {
  assert.deepEqual(shipImageCredit({ jacht: credit }, "jacht"), credit);
});

test("S34: a credit missing any of its parts is refused", () => {
  for (const field of ["author", "license", "source"]) {
    const broken = { ...credit, [field]: "" };
    assert.equal(shipImageCredit({ jacht: broken }, "jacht"), null, `missing ${field}`);
  }
});

test("S34: a hull without a picture has no credit", () => {
  assert.equal(shipImageCredit({}, "jacht"), null);
  assert.equal(shipImageCredit(undefined, "jacht"), null);
  assert.equal(shipImageCredit({ jacht: "not an object" }, "jacht"), null);
});

/* ---------------------------------------------------------------- the bundle */

test("S34: every bundled picture is a real file inside the repository", () => {
  // The bundle is allowed to be incomplete: a hull without a picture simply shows
  // its silhouette. What must never happen is a credit for a file that is not there.
  const creditsPath = join(repoRoot, "assets", "ships", "credits.json");
  if (!existsSync(creditsPath)) return;
  const credits = JSON.parse(readFileSync(creditsPath, "utf8"));
  for (const [hullId, entry] of Object.entries(credits)) {
    assert.ok(
      HULLS.some((hull) => hull.id === hullId),
      `credit for an unknown hull: ${hullId}`,
    );
    const file = join(repoRoot, "assets", "ships", `${hullId}.jpg`);
    assert.ok(existsSync(file), `credit for a missing picture: ${hullId}`);
    assert.ok(shipImageCredit(credits, hullId), `incomplete credit for ${hullId}`);
  }
});


/* ---------------------------------------------------------------- several pictures (S76) */

import { nextImageIndex, shipImagePaths } from "../src/model/ship-image.js";

const second = {
  author: "Willem van de Velde the Younger",
  license: "Public domain",
  source: "https://commons.wikimedia.org/wiki/File:Second.jpg",
};

test("S76: a hull with one picture keeps the path it always had", () => {
  const paths = shipImagePaths({ jacht: credit }, "jacht");
  assert.equal(paths.length, 1);
  assert.equal(paths[0].path, `${SHIP_IMAGE_DIR}jacht.jpg`);
});

test("S76: a hull with several pictures lists them in order", () => {
  const paths = shipImagePaths({ jacht: { pictures: [credit, second] } }, "jacht");
  assert.equal(paths.length, 2);
  assert.equal(paths[0].path, `${SHIP_IMAGE_DIR}jacht.jpg`, "the first keeps the bare name");
  assert.equal(paths[1].path, `${SHIP_IMAGE_DIR}jacht-2.jpg`, "the second is numbered");
});

test("S76: each picture carries its own credit", () => {
  const paths = shipImagePaths({ jacht: { pictures: [credit, second] } }, "jacht");
  assert.equal(paths[0].author, credit.author);
  assert.equal(paths[1].author, second.author);
});

test("S76: a picture without a complete credit is dropped, not shown", () => {
  // An unattributed image is worse than no image: the licence is the whole point.
  const paths = shipImagePaths({ jacht: { pictures: [credit, { ...second, license: "" }] } }, "jacht");
  assert.equal(paths.length, 1);
});

test("S76: a hull with no pictures lists nothing", () => {
  assert.deepEqual(shipImagePaths({}, "jacht"), []);
  assert.deepEqual(shipImagePaths(undefined, "jacht"), []);
  assert.deepEqual(shipImagePaths({ jacht: { pictures: [] } }, "jacht"), []);
});

test("S76: the credit follows the picture that is on screen", () => {
  const credits = { jacht: { pictures: [credit, second] } };
  assert.equal(shipImageCredit(credits, "jacht", 0).author, credit.author);
  assert.equal(shipImageCredit(credits, "jacht", 1).author, second.author);
});

test("S76: a click moves to the next picture", () => {
  assert.equal(nextImageIndex(0, 3), 1);
  assert.equal(nextImageIndex(1, 3), 2);
});

test("S76: the last picture wraps back to the first", () => {
  assert.equal(nextImageIndex(2, 3), 0);
});

test("S76: a hull with one picture or none stays put", () => {
  assert.equal(nextImageIndex(0, 1), 0);
  assert.equal(nextImageIndex(0, 0), 0);
  assert.equal(nextImageIndex(5, 1), 0);
});

test("S76: a broken index wraps instead of pointing at nothing", () => {
  for (const broken of [NaN, undefined, null, -1, 99]) {
    const next = nextImageIndex(broken, 3);
    assert.ok(next >= 0 && next < 3, `index ${String(broken)} gave ${next}`);
  }
});

test("S76: every listed picture exists, is under 200 KB and carries a full credit", () => {
  // The older bundle test only looks at `<id>.jpg`; this one walks every picture the
  // credits promise, so a numbered file that is missing or oversized cannot hide.
  const creditsPath = join(repoRoot, "assets", "ships", "credits.json");
  const credits = JSON.parse(readFileSync(creditsPath, "utf8"));
  let seen = 0;
  for (const hull of HULLS) {
    for (const picture of shipImagePaths(credits, hull.id)) {
      seen += 1;
      const file = join(repoRoot, picture.path.replace("./", ""));
      assert.ok(existsSync(file), `${hull.id}: the credit names ${picture.path} but it is not there`);
      assert.ok(statSync(file).size < 200 * 1024, `${hull.id}: ${picture.path} is over 200 KB`);
      assert.ok(picture.author && picture.license && picture.source, `${hull.id}: incomplete credit`);
    }
  }
  assert.ok(seen >= HULLS.length, `expected at least one picture per hull, saw ${seen}`);
});

test("S76: at least one hull really has more than one picture", () => {
  const creditsPath = join(repoRoot, "assets", "ships", "credits.json");
  const credits = JSON.parse(readFileSync(creditsPath, "utf8"));
  const many = HULLS.filter((hull) => shipImagePaths(credits, hull.id).length > 1);
  assert.ok(many.length >= 1, "the rotation has nothing to rotate");
});
