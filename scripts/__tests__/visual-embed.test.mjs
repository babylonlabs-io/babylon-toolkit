import assert from "node:assert/strict";
import test from "node:test";

import {
  changedRowBand,
  cropWindow,
  selectEmbeddedGroups,
} from "../visual-embed.mjs";

/** A PNG-shaped object: changedRowBand only reads width, height and data. */
function png(width, height, paint) {
  const data = Buffer.alloc(width * height * 4);
  if (paint) paint(data, width);
  return { width, height, data };
}

function paintRow(data, width, y, value) {
  data.fill(value, y * width * 4, (y + 1) * width * 4);
}

test("changedRowBand reports no band when the two captures are identical", () => {
  assert.equal(changedRowBand(png(4, 10), png(4, 10)), null);
});

test("changedRowBand reports no band when the captures differ in size", () => {
  assert.equal(changedRowBand(png(4, 10), png(4, 12)), null);
});

test("changedRowBand spans the first and last differing rows only", () => {
  const candidate = png(4, 10, (data, width) => {
    paintRow(data, width, 3, 0xff);
    paintRow(data, width, 6, 0xff);
  });

  assert.deepEqual(changedRowBand(png(4, 10), candidate), { first: 3, last: 6 });
});

test("cropWindow shows the page from the top when nothing changed", () => {
  assert.deepEqual(cropWindow(null, 3000), {
    top: 0,
    height: 2400,
    clipped: true,
  });
});

test("cropWindow keeps the whole page when the change covers most of it", () => {
  assert.deepEqual(cropWindow({ first: 0, last: 900 }, 1000), {
    top: 0,
    height: 1000,
    clipped: false,
  });
});

test("cropWindow crops to the change when that removes a real slice of the page", () => {
  assert.deepEqual(cropWindow({ first: 2450, last: 2500 }, 12000), {
    top: 2354,
    height: 243,
    clipped: false,
  });
});

// Rule 2 in cropWindow's contract, and the reason it is written down: a
// window anchored on row 0 here would publish two byte-identical panels
// under a caption reading that most of the pixels changed.
test("cropWindow anchors an over-tall window on the change, not on row 0", () => {
  const window = cropWindow({ first: 2450, last: 7000 }, 12000);

  assert.equal(window.top, 2354);
  assert.equal(window.height, 2400);
  assert.equal(window.clipped, true);
});

function group(surface, key, topRank) {
  return { surface, key, group: key, topRank, screens: [] };
}

test("selectEmbeddedGroups reserves each surface its floor before ranking the rest", () => {
  const ranked = [
    group("storybook", "s1", 100),
    group("storybook", "s2", 99),
    group("storybook", "s3", 98),
    group("storybook", "s4", 97),
    group("storybook", "s5", 96),
    group("vault", "v1", 10),
    group("vault", "v2", 9),
  ];

  const keys = selectEmbeddedGroups(ranked).map((entry) => entry.key);

  // On rank alone this would be s1-s5 and the app would go unpictured.
  assert.equal(keys.length, 5);
  assert.deepEqual(
    keys.filter((key) => key.startsWith("v")),
    ["v1", "v2"],
  );
});

// The documented cost of holding the total at one constant. Pinned because
// it is the trap waiting for whoever adds a third surface: the floor stops
// being a guarantee, quietly, for the surface that ranks last.
test("selectEmbeddedGroups under-serves the last surface once a third is added", () => {
  const ranked = [
    group("a", "a1", 100),
    group("a", "a2", 99),
    group("b", "b1", 50),
    group("b", "b2", 49),
    group("c", "c1", 10),
    group("c", "c2", 9),
  ];

  const keys = selectEmbeddedGroups(ranked).map((entry) => entry.key);

  assert.equal(keys.length, 5);
  assert.deepEqual(
    keys.filter((key) => key.startsWith("c")),
    ["c1"],
  );
});
