import assert from "node:assert/strict";
import test from "node:test";

import {
  changedRowBand,
  composeBeforeAfter,
  cropWindow,
  panelLayout,
  screenCaption,
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

// A stacked pair draws the window twice, so one panel may only claim half
// the composite's ceiling - otherwise the published file doubles.
test("cropWindow honours a smaller per-panel budget", () => {
  assert.deepEqual(cropWindow(null, 3000, 1196), {
    top: 0,
    height: 1196,
    clipped: true,
  });
});

test("panelLayout keeps a phone pair side by side", () => {
  assert.equal(panelLayout(390, 2), "side-by-side");
});

// The case this layout rule exists for: side by side, two 1280px screens
// come to 2568px and are reduced to a third of life size to fit.
test("panelLayout stacks a pair too wide to sit side by side", () => {
  assert.equal(panelLayout(1280, 2), "stacked");
});

test("panelLayout draws a screen with no counterpart as a single panel", () => {
  assert.equal(panelLayout(1280, 1), "single");
});

test("composeBeforeAfter publishes a desktop pair at full panel width", () => {
  const baseline = png(1280, 400);
  const candidate = png(1280, 400, (data, width) => {
    paintRow(data, width, 100, 0xff);
    paintRow(data, width, 300, 0xff);
  });

  const { composite, coverage } = composeBeforeAfter(baseline, candidate);

  assert.equal(coverage.layout, "stacked");
  assert.equal(composite.width, 1280);
  // Both panels plus the gutter between them.
  assert.equal(composite.height, 400 * 2 + 8);
});

// Stacking is only worth its height if the second panel really is the
// candidate: a bug that drew the baseline twice would still produce a
// correctly-shaped image, and the reviewer would read it as "no change".
test("composeBeforeAfter draws the candidate in the lower panel", () => {
  const baseline = png(1280, 400);
  const candidate = png(1280, 400, (data, width) => {
    paintRow(data, width, 100, 0xff);
    paintRow(data, width, 300, 0xff);
  });

  const { composite } = composeBeforeAfter(baseline, candidate);
  const pixel = (x, y) => composite.data[(y * composite.width + x) * 4];

  assert.equal(pixel(0, 100), 0x00);
  assert.equal(pixel(0, 400 + 8 + 100), 0xff);
});

test("composeBeforeAfter keeps a phone pair side by side", () => {
  const baseline = png(390, 400);
  const candidate = png(390, 400, (data, width) => {
    paintRow(data, width, 100, 0xff);
    paintRow(data, width, 300, 0xff);
  });

  const { composite, coverage } = composeBeforeAfter(baseline, candidate);

  assert.equal(coverage.layout, "side-by-side");
  assert.equal(composite.width, 390 * 2 + 8);
  assert.equal(composite.height, 400);
});

// A caption reading "on the left" over a stacked pair sends the reviewer
// looking for a panel that is not there.
test("screenCaption describes the arrangement the picture was composed with", () => {
  const changed = { status: "changed", changedRatio: 0.01 };

  assert.match(
    screenCaption(changed, { shown: 400, total: 400, clipped: false, layout: "stacked" }),
    /before on top, after underneath/,
  );
  assert.match(
    screenCaption(changed, {
      shown: 300,
      total: 300,
      clipped: false,
      layout: "side-by-side",
    }),
    /before on the left, after on the right/,
  );
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
