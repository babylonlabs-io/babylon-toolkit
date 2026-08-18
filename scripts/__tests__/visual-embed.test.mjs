import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

import {
  changedRegions,
  changedRowBand,
  composeBeforeAfter,
  cropWindow,
  fitPublishedImages,
  panelLayout,
  PUBLISHED_TOTAL_BYTE_BUDGET,
  reduceToWidth,
  screenCaption,
  selectEmbeddedGroups,
} from "../visual-embed.mjs";

/** A PNG-shaped object: changedRowBand only reads width, height and data. */
function png(width, height, paint) {
  const data = Buffer.alloc(width * height * 4);
  if (paint) paint(data, width);
  return { width, height, data };
}

function paintBlock(data, width, { left, top, width: w, height: h }) {
  for (let y = top; y < top + h; y += 1) {
    for (let x = left; x < left + w; x += 1) {
      data.fill(0xff, (y * width + x) * 4, (y * width + x) * 4 + 3);
    }
  }
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
  assert.equal(coverage.panels, 3);
  assert.equal(composite.width, 1280);
  // Before, after and highlight, plus the two gutters between them.
  assert.equal(composite.height, 400 * 3 + 8 * 2);
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
  assert.equal(composite.width, 390 * 3 + 8 * 2);
  assert.equal(composite.height, 400);
});

test("changedRegions rings the area that changed", () => {
  const baseline = png(64, 64);
  const candidate = png(64, 64, (data, width) => {
    paintBlock(data, width, { left: 16, top: 24, width: 8, height: 8 });
  });

  assert.deepEqual(changedRegions(baseline, candidate), [
    { left: 16, top: 24, right: 24, bottom: 32 },
  ]);
});

// One ring per changed word, not one per letter: neighbouring cells belong
// to the same region.
test("changedRegions joins neighbouring changes into one region", () => {
  const baseline = png(64, 64);
  const candidate = png(64, 64, (data, width) => {
    paintBlock(data, width, { left: 8, top: 8, width: 4, height: 4 });
    paintBlock(data, width, { left: 14, top: 8, width: 4, height: 4 });
  });

  assert.deepEqual(changedRegions(baseline, candidate), [
    { left: 8, top: 8, right: 24, bottom: 16 },
  ]);
});

test("changedRegions keeps unrelated changes apart", () => {
  const baseline = png(64, 64);
  const candidate = png(64, 64, (data, width) => {
    paintBlock(data, width, { left: 0, top: 0, width: 8, height: 8 });
    paintBlock(data, width, { left: 48, top: 48, width: 8, height: 8 });
  });

  assert.equal(changedRegions(baseline, candidate).length, 2);
});

// A token recolour moves something in every corner; forty rings point at
// nothing, so past the cap they become one ring around the lot.
test("changedRegions collapses past the cap into a single region", () => {
  const baseline = png(400, 400);
  const candidate = png(400, 400, (data, width) => {
    for (let i = 0; i < 20; i += 1) {
      paintBlock(data, width, { left: i * 16, top: i * 16, width: 4, height: 4 });
    }
  });

  assert.deepEqual(changedRegions(baseline, candidate), [
    { left: 0, top: 0, right: 312, bottom: 312 },
  ]);
});

test("changedRegions gives up when the two sides differ in size", () => {
  assert.deepEqual(changedRegions(png(64, 64), png(64, 80)), []);
});

// The ring belongs on a copy. Drawing it on the capture would put it in the
// "after" panel too, which is meant to show what actually shipped.
test("composeBeforeAfter rings the change in the third panel only", () => {
  const baseline = png(64, 64);
  const candidate = png(64, 64, (data, width) => {
    paintBlock(data, width, { left: 24, top: 24, width: 8, height: 8 });
  });

  const { composite, coverage } = composeBeforeAfter(baseline, candidate);
  assert.equal(coverage.layout, "side-by-side");

  const red = (x, y) => {
    const i = (y * composite.width + x) * 4;
    return [composite.data[i], composite.data[i + 1], composite.data[i + 2]];
  };
  // Top-left corner of the ring: the region padded out by 8, then the 1px
  // white halo, lands the red stroke at 17,17 within its own panel.
  const panelStride = 64 + 8;
  assert.deepEqual(red(2 * panelStride + 17, 17), [226, 34, 34]);
  // Same spot in the after panel is untouched capture.
  assert.deepEqual(red(panelStride + 17, 17), [0, 0, 0]);
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

/**
 * A composite-shaped image made of flat blocks, which is how a screenshot
 * of a UI compresses. Deliberately not noise: noise barely compresses at
 * all, so a 1280px pair of it weighs more than any real run could and every
 * budget below would be spent by the fixture rather than by the code.
 */
function textured(width, height) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const block = (Math.floor(y / 8) * 7 + Math.floor(x / 24) * 13) % 5;
      const i = (y * width + x) * 4;
      image.data[i] = 40 + block * 50;
      image.data[i + 1] = 200 - block * 30;
      image.data[i + 2] = 90 + block * 20;
      image.data[i + 3] = 255;
    }
  }
  return image;
}

/** What one picture costs at a published width. */
function cost(composite, width) {
  return PNG.sync.write(reduceToWidth(composite, width), { colorType: 2 })
    .length;
}

test("reduceToWidth leaves a picture already inside the width alone", () => {
  const composite = textured(320, 40);

  assert.equal(reduceToWidth(composite, 640), composite);
});

// The rule the fractional block exists for. At an integer factor every
// output column samples the same number of source columns and a lone
// changed column always lands in one of them; at 1.6 it does not, and a
// nearest-neighbour reduction would skip it on some columns.
test("reduceToWidth carries a one-column change into a fractional reduction", () => {
  const composite = new PNG({ width: 10, height: 1 });
  composite.data.fill(0);
  for (let i = 3; i < composite.data.length; i += 4) composite.data[i] = 255;
  composite.data[4 * 4] = 255;
  composite.data[4 * 4 + 1] = 255;
  composite.data[4 * 4 + 2] = 255;

  const reduced = reduceToWidth(composite, 7);

  assert.equal(reduced.width, 7);
  const lit = [];
  for (let x = 0; x < reduced.width; x += 1) {
    if (reduced.data[x * 4] > 0) lit.push(x);
  }
  assert.deepEqual(lit, [3]);
});

test("fitPublishedImages publishes at the composite's own width when the set fits", () => {
  const pictures = [
    { key: "vault/a.png", composite: textured(1280, 160) },
    { key: "vault/b.png", composite: textured(1280, 160) },
  ];

  const fit = fitPublishedImages(pictures, PUBLISHED_TOTAL_BYTE_BUDGET);

  assert.equal(fit.width, 1280);
  assert.deepEqual(
    fit.published.map((picture) => picture.key),
    ["vault/a.png", "vault/b.png"],
  );
  assert.deepEqual(fit.dropped, []);
});

test("fitPublishedImages publishes without an alpha channel", () => {
  const pictures = [{ key: "vault/a.png", composite: textured(1280, 160) }];

  const fit = fitPublishedImages(pictures, PUBLISHED_TOTAL_BYTE_BUDGET);

  // Byte 25 of a PNG is the IHDR colour type: 2 is truecolour, 6 carries an
  // alpha channel that every source here holds constant at 255.
  assert.equal(fit.published[0].bytes[25], 2);
});

test("fitPublishedImages reduces the whole set rather than dropping a picture", () => {
  const pictures = [
    { key: "vault/a.png", composite: textured(1280, 160) },
    { key: "vault/b.png", composite: textured(1280, 160) },
  ];
  const budget =
    cost(pictures[0].composite, 1280) + cost(pictures[1].composite, 1280) - 1;

  const fit = fitPublishedImages(pictures, budget);

  assert.ok(fit.width < 1280, `published at ${fit.width}px`);
  assert.equal(fit.published.length, 2);
  assert.deepEqual(fit.dropped, []);
  for (const picture of fit.published) {
    assert.equal(PNG.sync.read(picture.bytes).width, fit.width);
  }
});

// Lowest-ranked, not cheapest: the selection above already decided which
// screen is worth showing, and trading it for a smaller neighbour would
// quietly overrule that.
test("fitPublishedImages gives up the lowest-ranked picture when the floor still busts the budget", () => {
  const pictures = [
    { key: "vault/a.png", composite: textured(1280, 160) },
    { key: "vault/b.png", composite: textured(1280, 160) },
  ];
  const budget =
    cost(pictures[0].composite, 640) + cost(pictures[1].composite, 640) - 1;

  const fit = fitPublishedImages(pictures, budget);

  assert.deepEqual(
    fit.published.map((picture) => picture.key),
    ["vault/a.png"],
  );
  assert.deepEqual(
    fit.dropped.map((picture) => picture.key),
    ["vault/b.png"],
  );
});

// The invariant the whole budget rests on. Publishing over it hands the
// workflow's publish step a set it refuses outright, which costs the
// comment every picture rather than the one that would not fit.
test("fitPublishedImages publishes nothing rather than exceeding the budget", () => {
  const pictures = [{ key: "vault/a.png", composite: textured(1280, 160) }];

  const fit = fitPublishedImages(pictures, 1);

  assert.deepEqual(fit.published, []);
  assert.deepEqual(
    fit.dropped.map((picture) => picture.key),
    ["vault/a.png"],
  );
});

// Two caps in two files that have to stay ordered. They were not, and the
// gap is what this budget exists to close: the workflow refused a 678KB set
// against its 512KB ceiling, and nothing on this side knew the ceiling was
// there.
test("the workflow's publish ceiling stays above the budget this script fits to", () => {
  const workflow = fs.readFileSync(
    path.resolve(
      fileURLToPath(import.meta.url),
      "../../../.github/workflows/visual-regression.yml",
    ),
    "utf8",
  );

  const ceiling = workflow.match(
    /MAX_PUBLISHED_BYTES=\$\(\(\s*(\d+)\s*\*\s*1024\s*\)\)/,
  );

  assert.ok(ceiling, "MAX_PUBLISHED_BYTES not found in the workflow");
  assert.ok(
    Number(ceiling[1]) * 1024 > PUBLISHED_TOTAL_BYTE_BUDGET,
    `ceiling ${ceiling[1]}KB must exceed the ${PUBLISHED_TOTAL_BYTE_BUDGET}-byte budget`,
  );
});
