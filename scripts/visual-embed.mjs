/**
 * Turns a visual-diff report into something a reviewer can read without
 * leaving the pull request.
 *
 *   node scripts/visual-embed.mjs \
 *     --report <dir> --surfaces vault,storybook --out <dir> \
 *     --base-url <url> --body <file> --run-url <url> \
 *     --candidate-ref <sha> --diff-text <file>
 *
 * `scripts/visual-diff.mjs` already writes, per surface, a `summary.json`
 * plus full-resolution `baseline/`, `candidate/` and `diff/` directories.
 * That report is complete but it only ships as a zipped CI artifact, so in
 * practice nobody looks at it and the PR comment degrades to a list of
 * filenames and percentages.
 *
 * This script closes that gap. For the most-changed screens it stitches the
 * two sides into one before/after PNG under `--out`, and writes a Markdown
 * body under `--body` that embeds those PNGs from `--base-url`. The workflow
 * pushes `--out` to a branch that raw.githubusercontent.com serves, which is
 * what makes the images renderable inside a comment - GitHub cannot embed an
 * image out of a run artifact.
 *
 * Only a slice of the changed screens is embedded (see the caps below), and
 * on a busy run the set is published reduced so that all of it still fits
 * the comment - the artifact keeps the full-resolution originals. The body
 * always also carries the complete text list, so the reviewer can see that
 * the pictures are a sample rather than the whole story.
 */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

import { escapeHtml, parseArgs, STATUS } from "./visual-diff.mjs";

/**
 * How many groups get pictures, and how many screens are pictured within
 * each.
 *
 * Both caps exist for the same reason: eight Button stories changing is ONE
 * fact about the Button component, and showing all eight would crowd out the
 * single vault route that also moved. Two per group is enough to see whether
 * a group's screens all changed the same way, and a repaint of a shared
 * component routinely changes 40+ screens here (12 vault screens, 329
 * stories), so the alternative is a comment nobody scrolls to the end of.
 * Their product is the ceiling, not the count - a group holding one screen
 * spends one slot.
 *
 * Deliberately just these two, with no separate ceiling on the total: a
 * third cap could only bite by quietly giving the lowest-ranked groups
 * fewer pictures than the promise above.
 */
const MAX_EMBEDDED_GROUPS = 5;
const MAX_EMBEDDED_SCREENS_PER_GROUP = 2;

/**
 * Groups each surface is guaranteed, before the rest of the budget is
 * handed out on rank alone.
 *
 * Rank alone is not enough. Repainting one shared component moves a
 * Storybook story by 17% of its small frame and a vault route by 1% of a
 * tall page, so a purely global ranking spends every slot on stories and
 * shows the reviewer nothing of the app that ships. This floor is what
 * keeps a vault screen in the comment.
 */
const MIN_EMBEDDED_GROUPS_PER_SURFACE = 2;

/**
 * Gap between the before and after panels, and the colour it is painted.
 * Mid grey so it reads as a divider against both the light chrome of the
 * app and the dark backdrop of the overlay stories, neither of which it
 * could be mistaken for.
 */
const PANEL_GUTTER_WIDTH = 8;
const PANEL_GUTTER_COLOUR = [120, 120, 120];

/**
 * Fill for the area a panel does not cover. Only reachable when the two
 * sides differ in size, which is itself the finding - the padding marks how
 * much taller or wider one side got, so it must not look like page content.
 */
const PANEL_PADDING_COLOUR = [232, 232, 232];

/**
 * The third panel: the after shot with every changed area ringed, so the
 * reviewer is told where to look instead of hunting for it.
 *
 * Drawn on the after shot rather than beside a bare diff mask, because a
 * mask says which pixels moved and not which control they belong to. The
 * ring is stroked in red between two white lines - red alone disappears
 * over the app's own red buttons and error states, which is exactly where
 * a change is most likely to be.
 */
const HIGHLIGHT_COLOUR = [226, 34, 34];
const HIGHLIGHT_HALO_COLOUR = [255, 255, 255];
const HIGHLIGHT_STROKE_WIDTH = 3;
const HIGHLIGHT_HALO_WIDTH = 1;
/** Clearance between the changed pixels and the ring drawn around them. */
const HIGHLIGHT_PADDING = 8;

/**
 * Changed pixels are clustered on a grid of this many pixels before being
 * ringed, so a word that changed reads as one region instead of a ring per
 * glyph. Sized under the smallest UI element worth pointing at.
 */
const HIGHLIGHT_CELL_SIZE = 8;

/**
 * Rings past this count are noise: a font swap or a token recolour moves
 * something in every corner of the page, and forty rings point at nothing.
 * Past it they collapse into one ring around the lot, which at least still
 * says "all of this".
 */
const HIGHLIGHT_MAX_REGIONS = 12;

/**
 * Rows of unchanged context kept above and below the changed band.
 *
 * Full-page captures are tall - a vault route at 390px wide runs past
 * 2000px - and a repaint usually moves a few hundred rows of that. Sending
 * the whole page makes the change a speck; cropping to the band that
 * actually differs makes it the subject. The context rows are what keep it
 * recognisable as a place in the page rather than a floating fragment.
 */
const CROP_CONTEXT_ROWS = 96;

/**
 * Crop only when at least a fifth of the image goes with it. Trimming a
 * sliver costs a reviewer the page's full shape and buys nothing, and a
 * change that really is spread down the whole page is itself worth seeing
 * whole.
 */
const CROP_MAX_KEPT_FRACTION = 0.8;

/**
 * Width the composite is reduced to before it is published, and with it the
 * widest panel that reaches the reviewer at life size.
 *
 * Sized to the desktop capture rather than to the comment column. A comment
 * body is about 800px wide and GitHub scales anything wider down to fit, so
 * a budget of 800-1000 looks like the honest one - but the scaling GitHub
 * does is undone by a click, and the reduction done here is not. A 1280px
 * desktop screen published at 856px is 856px of detail forever; published
 * whole it is a 0.6x thumbnail that opens at full size.
 *
 * Paid for in clone weight, because every `git clone` of this repo fetches
 * the branch these images live on. `panelLayout` is what keeps that bounded:
 * a pair too wide to sit side by side stacks instead of being reduced, so
 * the pixel count stays what it was and only the shape changes.
 */
const EMBED_MAX_WIDTH = 1280;

/**
 * Ceiling on the composite's height, enforced by taking fewer rows rather
 * than by scaling.
 *
 * Width alone does not bound the file. A change spread down a whole page -
 * a font swap, a token recolour - leaves nothing to crop, and a vault route
 * captured full-page at 390px wide runs past 3000px, so the composite stays
 * tall no matter how narrow it is.
 *
 * Feeding that height into the reduction factor instead would be the wrong
 * trade: two 390px panels side by side already come to 788px, well inside
 * EMBED_MAX_WIDTH, so halving them to fit a height budget would render each
 * phone screen at under 200px - small enough that the change being reported
 * is no longer visible. Cutting rows keeps what is shown at full size.
 *
 * This bounds the composite, not the panel: stacked panels divide it between
 * them (see `panelHeightBudget`), so adding the highlight panel spends the
 * budget three ways rather than growing the published file.
 */
const MAX_COMPOSITE_HEIGHT = 2400;

/**
 * Everything one comment's pictures may weigh, and the widths the set is
 * allowed to be published at to get under it.
 *
 * The publish step enforces a hard per-PR ceiling on what lands on the
 * images branch, and until this budget existed nothing on this side knew
 * about it: the caps above bound the count and the dimensions but not the
 * bytes, so five tall vault composites came to 678KB against a 512KB
 * ceiling and the step refused the lot. Refusing is the worst outcome
 * available - the comment falls back to a list of filenames, which is the
 * state this whole script exists to replace - so the size is settled here,
 * where a picture can be made smaller, rather than there, where it can only
 * be dropped.
 *
 * Below the workflow's ceiling rather than equal to it, because the two
 * count slightly different things: this counts the PNGs, that counts what
 * the publish step finds on disk. `visual-embed.test.mjs` pins the order of
 * the pair, which is the check that was missing when the ceiling was set.
 *
 * The ladder is walked top down and the first rung the whole set fits under
 * wins, so the ordinary pull request that moves one screen still publishes
 * it at the capture's own width - the reduction is what a busy run pays,
 * not what every run pays. The rungs are sizes worth having rather than a
 * subdivision: 1280 is a desktop capture at life size, 960 and 800 bracket
 * what a comment column actually renders, and 640 is the floor, past which
 * a phone panel in a three-panel composite is 210px wide and the change it
 * is meant to show stops being legible. A set that will not fit even at the
 * floor drops its lowest-ranked picture instead of shrinking further, and
 * says so in the comment.
 */
const PUBLISHED_TOTAL_BYTE_BUDGET = 448 * 1024;
const PUBLISHED_WIDTH_LADDER = [EMBED_MAX_WIDTH, 960, 800, 640];

/**
 * Published as truecolour with no alpha channel.
 *
 * Every source here is an opaque screenshot and the reduction below writes
 * 255 into every pixel it produces, so the channel carries one constant
 * value down the whole file - around a tenth of the published bytes spent
 * saying "not transparent".
 */
const PUBLISHED_COLOUR_TYPE = 2;

/**
 * How the two panels are arranged. A single panel is its own case: an added
 * or removed screen has no counterpart to sit beside or under.
 */
const LAYOUT = {
  SIDE_BY_SIDE: "side-by-side",
  STACKED: "stacked",
  SINGLE: "single",
};

/** Separates a Storybook title path from its story name, and a vault route
 *  from its viewport: `components-inputs-actions-button--fluid`,
 *  `overview--mobile`. Storybook collapses runs of non-alphanumerics to a
 *  single hyphen when it builds an id, so the first occurrence is the
 *  separator and any later one cannot exist. */
const GROUP_SEPARATOR = "--";

/**
 * Ranked above every percentage: a screen that appeared, disappeared or
 * changed shape is a structural change, and `summary.json` carries no ratio
 * for one. Finite on purpose - two structural changes tie, and `Infinity -
 * Infinity` is `NaN`, which makes `Array.prototype.sort` order undefined.
 * A ratio cannot exceed 1, so 2 sits above every real value.
 */
const STRUCTURAL_CHANGE_RANK = 2;

function splitScreenName(fileName) {
  const stem = fileName.replace(/\.png$/, "");
  const index = stem.indexOf(GROUP_SEPARATOR);
  if (index === -1) return { group: stem, variant: stem };
  return {
    group: stem.slice(0, index),
    variant: stem.slice(index + GROUP_SEPARATOR.length),
  };
}

/**
 * Ranks one result. Structural changes float to the top, everything else
 * sorts on how much of the frame moved.
 */
function changeRank(result) {
  return result.changedRatio === null
    ? STRUCTURAL_CHANGE_RANK
    : result.changedRatio;
}

function formatPercent(ratio) {
  return `${(ratio * 100).toFixed(3)}%`;
}

/**
 * Orders by how much changed, then by name. The name is not decoration: two
 * screens routinely tie (a shared component repainted in both), and without
 * a tiebreak the comment would reshuffle between re-runs of the same commit
 * and read as though something had moved.
 */
function byChangeThenName(a, b) {
  return changeRank(b) - changeRank(a) || a.name.localeCompare(b.name);
}

/**
 * Groups a surface's changed results and orders them, most-changed first.
 * Grouping is what stops one component's story sweep from crowding out
 * every other finding: eight Button stories become one entry.
 */
function groupChangedResults(surface, results) {
  const groups = new Map();

  for (const result of results) {
    if (result.status === STATUS.UNCHANGED) continue;
    const { group, variant } = splitScreenName(result.name);
    const key = `${surface}/${group}`;
    if (!groups.has(key)) {
      groups.set(key, { surface, group, key, screens: [] });
    }
    groups.get(key).screens.push({ ...result, variant });
  }

  for (const group of groups.values()) {
    group.screens.sort(byChangeThenName);
    group.topRank = changeRank(group.screens[0]);
  }

  return [...groups.values()];
}

/** Same ordering as the screens, applied to whole groups. */
function rankGroups(groups) {
  return [...groups].sort(
    (a, b) => b.topRank - a.topRank || a.key.localeCompare(b.key),
  );
}

/**
 * Picks which groups get pictures: each surface's own best few first, then
 * the remaining slots by rank across everything.
 */
function selectEmbeddedGroups(ranked) {
  const chosen = new Set();
  const surfaces = new Set(ranked.map((group) => group.surface));

  for (const surface of surfaces) {
    const reserved = ranked
      .filter((group) => group.surface === surface)
      .slice(0, MIN_EMBEDDED_GROUPS_PER_SURFACE);
    for (const group of reserved) {
      // The reservations can only outrun the cap if a third surface is
      // ever captured. Stopping here rather than letting the total drift
      // means the comment length stays bounded by one constant; the
      // surface that loses out is the last one in rank order.
      if (chosen.size >= MAX_EMBEDDED_GROUPS) break;
      chosen.add(group);
    }
  }

  for (const group of ranked) {
    if (chosen.size >= MAX_EMBEDDED_GROUPS) break;
    chosen.add(group);
  }
  return rankGroups([...chosen]);
}

/**
 * Names the publish step will copy onto the branch. Restated from the
 * workflow rather than shared, because there it is a security allowlist
 * applied to bytes this script produced; here it is the check that stops
 * the comment linking to a file that got dropped on the way and rendering
 * as a broken image.
 */
const PUBLISHABLE_SCREEN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/;

/** Picks which screens get a picture, within the chosen groups. */
function selectEmbeddedScreens(ranked) {
  return selectEmbeddedGroups(ranked).flatMap((group) =>
    group.screens
      .filter((screen) => PUBLISHABLE_SCREEN_NAME.test(screen.name))
      .slice(0, MAX_EMBEDDED_SCREENS_PER_GROUP)
      .map((screen) => ({ surface: group.surface, screen })),
  );
}

async function readPngIfPresent(file) {
  try {
    return PNG.sync.read(await fs.readFile(file));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * First and last row that differ, byte for byte.
 *
 * Deliberately exact rather than reusing the diff's antialiasing
 * threshold: this only decides where to crop, and over-including a row of
 * jitter costs a reviewer nothing while dropping a genuinely changed row
 * would hide the finding.
 */
function changedRowBand(baseline, candidate) {
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    return null;
  }
  const rowBytes = baseline.width * 4;
  let first = -1;
  let last = -1;
  for (let y = 0; y < baseline.height; y += 1) {
    const start = y * rowBytes;
    const end = start + rowBytes;
    if (baseline.data.compare(candidate.data, start, end, start, end) !== 0) {
      if (first === -1) first = y;
      last = y;
    }
  }
  return first === -1 ? null : { first, last };
}

/**
 * The slice of rows the composite covers.
 *
 * Two rules, and the second one exists because breaking it publishes a
 * picture that is worse than no picture at all:
 *
 * 1. Crop to the changed band when that removes a real slice of the page,
 *    otherwise show the page from the top, where it is recognisable.
 * 2. When the height ceiling has to bite, anchor the window on the change
 *    rather than on row 0. Anchoring on row 0 looked harmless and was not:
 *    a 12000px capture whose band starts at row 2450 would publish rows
 *    0-2399, two byte-identical panels, under a caption reading "78% of
 *    pixels changed".
 *
 * `clipped` says the ceiling bit, so the caption can admit the picture is
 * a slice instead of letting the reviewer assume they saw all of it.
 *
 * `maxHeight` is the budget for ONE panel, which is not the same as the
 * composite's: stacking spends the composite's height twice over.
 */
function cropWindow(band, height, maxHeight = MAX_COMPOSITE_HEIGHT) {
  if (band === null) {
    return {
      top: 0,
      height: Math.min(height, maxHeight),
      clipped: height > maxHeight,
    };
  }

  const bandTop = Math.max(0, band.first - CROP_CONTEXT_ROWS);
  const bandBottom = Math.min(height, band.last + 1 + CROP_CONTEXT_ROWS);
  const keepWholePage =
    bandBottom - bandTop > height * CROP_MAX_KEPT_FRACTION;

  const wantedTop = keepWholePage ? 0 : bandTop;
  const wantedHeight = keepWholePage ? height : bandBottom - bandTop;
  if (wantedHeight <= maxHeight) {
    return { top: wantedTop, height: wantedHeight, clipped: false };
  }

  // Rule 2. Start at the band, pulled back only as far as is needed to
  // fill the window against the bottom of the page.
  return {
    top: Math.min(bandTop, Math.max(0, height - maxHeight)),
    height: maxHeight,
    clipped: true,
  };
}

function fill(target, colour) {
  for (let i = 0; i < target.data.length; i += 4) {
    target.data[i] = colour[0];
    target.data[i + 1] = colour[1];
    target.data[i + 2] = colour[2];
    target.data[i + 3] = 255;
  }
}

/**
 * Boxes around the areas that changed, in full-image coordinates.
 *
 * Works on a grid rather than on pixels: neighbouring cells that both hold
 * a changed pixel join into one region, so a repainted button is one box
 * and not one per letter of its label. Exact byte comparison, matching
 * `changedRowBand` - both sides render on the same machine, and a box drawn
 * around a pixel of antialiasing jitter costs a reviewer nothing next to
 * one that misses a real change.
 *
 * Empty when the sides differ in size: there is no shared coordinate space
 * to point into, and the size change is itself what the caption reports.
 */
function changedRegions(baseline, candidate) {
  if (
    baseline.width !== candidate.width ||
    baseline.height !== candidate.height
  ) {
    return [];
  }

  const cellsAcross = Math.ceil(baseline.width / HIGHLIGHT_CELL_SIZE);
  const cellsDown = Math.ceil(baseline.height / HIGHLIGHT_CELL_SIZE);
  const changed = new Uint8Array(cellsAcross * cellsDown);

  for (let y = 0; y < baseline.height; y += 1) {
    for (let x = 0; x < baseline.width; x += 1) {
      const i = (y * baseline.width + x) * 4;
      const same =
        baseline.data[i] === candidate.data[i] &&
        baseline.data[i + 1] === candidate.data[i + 1] &&
        baseline.data[i + 2] === candidate.data[i + 2];
      if (same) continue;
      const cell =
        Math.floor(y / HIGHLIGHT_CELL_SIZE) * cellsAcross +
        Math.floor(x / HIGHLIGHT_CELL_SIZE);
      changed[cell] = 1;
      // The rest of this cell cannot change the answer.
      x = (Math.floor(x / HIGHLIGHT_CELL_SIZE) + 1) * HIGHLIGHT_CELL_SIZE - 1;
    }
  }

  const regions = [];
  const seen = new Uint8Array(changed.length);
  for (let start = 0; start < changed.length; start += 1) {
    if (changed[start] === 0 || seen[start] === 1) continue;

    // Flood fill this cluster, tracking its bounds as it grows. Iterative:
    // a full-page change is thousands of cells deep and would blow a
    // recursive stack.
    const pending = [start];
    seen[start] = 1;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;

    while (pending.length > 0) {
      const cell = pending.pop();
      const cellX = cell % cellsAcross;
      const cellY = Math.floor(cell / cellsAcross);
      left = Math.min(left, cellX);
      top = Math.min(top, cellY);
      right = Math.max(right, cellX);
      bottom = Math.max(bottom, cellY);

      const neighbours = [
        cellX > 0 ? cell - 1 : -1,
        cellX < cellsAcross - 1 ? cell + 1 : -1,
        cellY > 0 ? cell - cellsAcross : -1,
        cellY < cellsDown - 1 ? cell + cellsAcross : -1,
      ];
      for (const next of neighbours) {
        if (next === -1 || seen[next] === 1 || changed[next] === 0) continue;
        seen[next] = 1;
        pending.push(next);
      }
    }

    regions.push({
      left: left * HIGHLIGHT_CELL_SIZE,
      top: top * HIGHLIGHT_CELL_SIZE,
      right: Math.min(baseline.width, (right + 1) * HIGHLIGHT_CELL_SIZE),
      bottom: Math.min(baseline.height, (bottom + 1) * HIGHLIGHT_CELL_SIZE),
    });
  }

  if (regions.length <= HIGHLIGHT_MAX_REGIONS) return regions;
  return [
    {
      left: Math.min(...regions.map((r) => r.left)),
      top: Math.min(...regions.map((r) => r.top)),
      right: Math.max(...regions.map((r) => r.right)),
      bottom: Math.max(...regions.map((r) => r.bottom)),
    },
  ];
}

/** Paints a solid block, used for the gutter between the two panels. */
function paintRect(target, left, top, width, height, colour) {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const i = (y * target.width + x) * 4;
      target.data[i] = colour[0];
      target.data[i + 1] = colour[1];
      target.data[i + 2] = colour[2];
      target.data[i + 3] = 255;
    }
  }
}

/** Paints the four edges of `box`, clipped to the target. */
function strokeRect(target, box, thickness, colour) {
  const left = Math.max(0, box.left);
  const top = Math.max(0, box.top);
  const right = Math.min(target.width, box.right);
  const bottom = Math.min(target.height, box.bottom);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) return;

  const across = Math.min(thickness, height);
  const down = Math.min(thickness, width);
  paintRect(target, left, top, width, across, colour);
  paintRect(target, left, bottom - across, width, across, colour);
  paintRect(target, left, top, down, height, colour);
  paintRect(target, right - down, top, down, height, colour);
}

function inset(box, by) {
  return {
    left: box.left + by,
    top: box.top + by,
    right: box.right - by,
    bottom: box.bottom - by,
  };
}

/**
 * The after shot with a ring around every changed area.
 *
 * A copy, never the capture itself: the same PNG object is blitted into the
 * after panel, and drawing on it would ring the change in the picture that
 * is supposed to show what shipped.
 */
function highlightPanel(candidate, regions) {
  const panel = {
    width: candidate.width,
    height: candidate.height,
    data: Buffer.from(candidate.data),
  };

  for (const region of regions) {
    const outer = {
      left: region.left - HIGHLIGHT_PADDING,
      top: region.top - HIGHLIGHT_PADDING,
      right: region.right + HIGHLIGHT_PADDING,
      bottom: region.bottom + HIGHLIGHT_PADDING,
    };
    strokeRect(panel, outer, HIGHLIGHT_HALO_WIDTH, HIGHLIGHT_HALO_COLOUR);
    strokeRect(
      panel,
      inset(outer, HIGHLIGHT_HALO_WIDTH),
      HIGHLIGHT_STROKE_WIDTH,
      HIGHLIGHT_COLOUR,
    );
    strokeRect(
      panel,
      inset(outer, HIGHLIGHT_HALO_WIDTH + HIGHLIGHT_STROKE_WIDTH),
      HIGHLIGHT_HALO_WIDTH,
      HIGHLIGHT_HALO_COLOUR,
    );
  }

  return panel;
}

/** Copies `window` rows of `source` into `target` with its top-left at `x`, `y`. */
function blit(source, target, x, y, window) {
  const rows = Math.min(window.height, Math.max(0, source.height - window.top));
  for (let row = 0; row < rows; row += 1) {
    const from = (window.top + row) * source.width * 4;
    const to = ((y + row) * target.width + x) * 4;
    source.data.copy(target.data, to, from, from + source.width * 4);
  }
}

/**
 * Whether a pair is drawn side by side or stacked.
 *
 * Side by side stays the default: the panels are then the same distance from
 * the eye at every scroll position, and the pair is no taller than one
 * already-tall page. It holds only while the pair fits the published width,
 * because the alternative past that point is reduction, and reduction is
 * what costs the reviewer the picture. Two 1280px vault screens side by side
 * come to 2568px; the integer reduction that fits 1280 renders each screen
 * 428px wide - a third of life size, in a column that then scales it again.
 *
 * Stacked, the same two panels publish 1280px wide and life size for the
 * same pixel count: the height they cost is the width they keep.
 */
function panelLayout(panelWidth, panelCount) {
  if (panelCount < 2) return LAYOUT.SINGLE;
  const across =
    panelWidth * panelCount + PANEL_GUTTER_WIDTH * (panelCount - 1);
  return across <= EMBED_MAX_WIDTH ? LAYOUT.SIDE_BY_SIDE : LAYOUT.STACKED;
}

/**
 * Rows one panel may cover. Stacked panels divide the composite's ceiling
 * between them, so adding the highlight panel costs height rather than
 * doubling the file; anything else gets the ceiling whole.
 */
function panelHeightBudget(layout, panelCount) {
  if (layout !== LAYOUT.STACKED) return MAX_COMPOSITE_HEIGHT;
  const gutters = PANEL_GUTTER_WIDTH * (panelCount - 1);
  return Math.floor((MAX_COMPOSITE_HEIGHT - gutters) / panelCount);
}

/**
 * Stitches the sides into one image - before, after, and where it changed -
 * in whichever direction `panelLayout` picked, and reports how much of the
 * screen's height that image ended up covering.
 *
 * A missing side (an added or removed screen) renders as one panel, and so
 * takes no highlight: there is nothing to have changed against.
 */
function composeBeforeAfter(baseline, candidate) {
  const present = [baseline, candidate].filter((png) => png !== null);
  if (present.length === 0) throw new Error("Neither side of the pair was readable.");

  const pair = baseline !== null && candidate !== null;
  const band = pair ? changedRowBand(baseline, candidate) : null;
  const regions = pair ? changedRegions(baseline, candidate) : [];
  const panels = regions.length > 0
    ? [...present, highlightPanel(candidate, regions)]
    : present;

  const panelWidth = Math.max(...present.map((png) => png.width));
  const layout = panelLayout(panelWidth, panels.length);
  const fullHeight = Math.max(...present.map((png) => png.height));
  const window = cropWindow(
    band,
    fullHeight,
    panelHeightBudget(layout, panels.length),
  );

  const across = layout === LAYOUT.SIDE_BY_SIDE;
  const gutters = PANEL_GUTTER_WIDTH * (panels.length - 1);
  const width = across ? panelWidth * panels.length + gutters : panelWidth;
  const height = across ? window.height : window.height * panels.length + gutters;
  const composite = new PNG({ width, height });
  fill(composite, PANEL_PADDING_COLOUR);

  const step = (across ? panelWidth : window.height) + PANEL_GUTTER_WIDTH;
  for (const [index, panel] of panels.entries()) {
    const offset = index * step;
    if (index > 0) {
      const gutterAt = offset - PANEL_GUTTER_WIDTH;
      if (across) {
        paintRect(composite, gutterAt, 0, PANEL_GUTTER_WIDTH, height, PANEL_GUTTER_COLOUR);
      } else {
        paintRect(composite, 0, gutterAt, width, PANEL_GUTTER_WIDTH, PANEL_GUTTER_COLOUR);
      }
    }
    blit(panel, composite, across ? offset : 0, across ? 0 : offset, window);
  }

  return {
    composite,
    coverage: {
      shown: window.height,
      total: fullHeight,
      clipped: window.clipped,
      layout,
      panels: panels.length,
    },
  };
}

/**
 * Shrinks to a target width, averaging each block of source pixels.
 *
 * Averaging rather than dropping pixels: nearest-neighbour would sample a
 * one-pixel-wide border change on some rows and miss it on others, so a
 * hairline that moved would flicker in and out of the published image.
 * An average always carries some of the new colour into the block.
 *
 * The block is fractional - a factor of 1.6 averages two source columns in
 * some places and one in others - because the widths worth publishing at
 * are not integer divisions of a capture. Restricted to whole factors, the
 * only rung under a 1280px capture is 640px, so a set that needed to lose a
 * fifth of its bytes would lose three quarters of its detail instead.
 *
 * The blocks are half open, so they partition the source rather than
 * overlapping at every boundary that does not fall on a whole pixel. An
 * overlap would average the same column into two neighbours, which blurs
 * exactly the thin edges the reduction is trying to keep.
 */
function reduceToWidth(source, width) {
  if (source.width <= width) return source;

  const columnScale = source.width / width;
  const height = Math.max(1, Math.round(source.height / columnScale));
  const rowScale = source.height / height;
  const target = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    const top = Math.floor(y * rowScale);
    const bottom = Math.min(
      source.height,
      Math.max(top + 1, Math.floor((y + 1) * rowScale)),
    );
    for (let x = 0; x < width; x += 1) {
      const left = Math.floor(x * columnScale);
      const right = Math.min(
        source.width,
        Math.max(left + 1, Math.floor((x + 1) * columnScale)),
      );
      let red = 0;
      let green = 0;
      let blue = 0;
      let sampled = 0;
      for (let sourceY = top; sourceY < bottom; sourceY += 1) {
        for (let sourceX = left; sourceX < right; sourceX += 1) {
          const i = (sourceY * source.width + sourceX) * 4;
          red += source.data[i];
          green += source.data[i + 1];
          blue += source.data[i + 2];
          sampled += 1;
        }
      }
      const i = (y * width + x) * 4;
      target.data[i] = Math.round(red / sampled);
      target.data[i + 1] = Math.round(green / sampled);
      target.data[i + 2] = Math.round(blue / sampled);
      target.data[i + 3] = 255;
    }
  }
  return target;
}

/**
 * Composes one before/after picture and hands back the image rather than
 * writing it.
 *
 * Split that way so the caller can decide not to write: it hashes the
 * pixels to drop identical twins, `fitPublishedImages` decides what width
 * the whole set can afford before any of it is encoded, and a throw here
 * costs one screen instead of the file it would otherwise have written.
 */
async function composeComposite(reportDir, surface, name) {
  const baseline = await readPngIfPresent(
    path.join(reportDir, surface, "baseline", name),
  );
  const candidate = await readPngIfPresent(
    path.join(reportDir, surface, "candidate", name),
  );
  const { composite, coverage } = composeBeforeAfter(baseline, candidate);
  return { coverage, composite };
}

/** Encodes one composite at a published width. */
function encodeAtWidth(composite, width) {
  return PNG.sync.write(reduceToWidth(composite, width), {
    colorType: PUBLISHED_COLOUR_TYPE,
  });
}

/**
 * Decides what the set of pictures is published at, and what it costs.
 *
 * The whole set moves to one rung together rather than each picture being
 * sized against its own share of the budget. Two reasons, and the second is
 * the one that matters: a comment where the vault screen is life size and
 * the story beside it is half size reads as though the small one mattered
 * less, and a per-picture share makes what a reviewer sees depend on how
 * many OTHER screens happened to change in the same push.
 *
 * Pictures are given up only once the floor rung is still over budget, and
 * from the bottom of the ranking, so what goes is what the selection above
 * already judged least worth showing. Then the ladder is walked again from
 * the top: with one picture gone the rest may fit at a rung that keeps them
 * readable, which is worth more than holding a picture nobody can read.
 *
 * Encodings are cached per picture and rung. The walk revisits both, and
 * deflating a 1280x2400 composite is ~100ms - enough for a rung-by-rung
 * search on a full set to become the slowest thing in the job.
 */
function fitPublishedImages(pictures, budget = PUBLISHED_TOTAL_BYTE_BUDGET) {
  const encoded = new Map();
  const bytesAt = (picture, width) => {
    const key = `${picture.index}:${width}`;
    if (!encoded.has(key)) {
      encoded.set(key, encodeAtWidth(picture.composite, width));
    }
    return encoded.get(key);
  };

  const kept = pictures.map((picture, index) => ({ ...picture, index }));
  const dropped = [];

  while (kept.length > 0) {
    for (const width of PUBLISHED_WIDTH_LADDER) {
      const bytes = kept.map((picture) => bytesAt(picture, width));
      const total = bytes.reduce((sum, buffer) => sum + buffer.length, 0);
      if (total > budget) continue;
      return {
        width,
        published: kept.map((picture, index) => ({
          ...picture,
          bytes: bytes[index],
        })),
        dropped,
      };
    }
    // Lowest-ranked first: `pictures` arrives in the order the comment
    // will read in, so the tail is the end of it.
    dropped.unshift(kept.pop());
  }

  // One picture that cannot fit at the floor. Publishing it anyway would
  // trip the workflow's ceiling and cost the comment every picture, so it
  // goes the same way as the rest and the text listing carries the run.
  return { width: PUBLISHED_WIDTH_LADDER.at(-1), published: [], dropped };
}

/**
 * How a screen's caption describes what the picture below it shows.
 *
 * Which panel is which is spelled out rather than left to a convention.
 * Nothing is drawn into the image itself to say so, and "before / after"
 * on its own reads as a pair of alternatives as easily as an ordering.
 * The wording follows the layout the picture was actually composed with -
 * a caption that says "on the left" over a stacked pair is worse than none.
 */
const PANEL_ORDER_NOTE = {
  [LAYOUT.SIDE_BY_SIDE]: {
    2: "before on the left, after on the right",
    3: "left to right: before, after, and what changed ringed in red",
  },
  [LAYOUT.STACKED]: {
    2: "before on top, after underneath",
    3: "top to bottom: before, after, and what changed ringed in red",
  },
};

function panelOrderNote(coverage) {
  const byCount =
    PANEL_ORDER_NOTE[coverage?.layout] ?? PANEL_ORDER_NOTE[LAYOUT.SIDE_BY_SIDE];
  return byCount[coverage?.panels === 3 ? 3 : 2];
}

function screenCaption(result, coverage) {
  const clipped =
    coverage && coverage.clipped
      ? ` (picture trimmed to ${coverage.shown}px of ${coverage.total}px)`
      : "";
  if (result.status === STATUS.ADDED) {
    return `added by this PR - after only${clipped}`;
  }
  if (result.status === STATUS.REMOVED) {
    return `removed by this PR - before only${clipped}`;
  }
  const order = panelOrderNote(coverage);
  if (result.status === STATUS.SIZE_CHANGED) {
    return `${result.baselineSize} to ${result.candidateSize} - ${order}${clipped}`;
  }
  return `${formatPercent(result.changedRatio)} of pixels - ${order}${clipped}`;
}

/**
 * The one-line summary on a collapsed group.
 *
 * Reports the structural changes and the worst percentage separately rather
 * than just describing the top-ranked screen: a group holding one added
 * story and a 17% repaint would otherwise summarise as "added" and hide the
 * repaint behind a fold nobody opens.
 */
function groupHeadline(group) {
  const parts = [
    `${group.screens.length} screen${group.screens.length === 1 ? "" : "s"}`,
  ];
  for (const status of [STATUS.ADDED, STATUS.REMOVED, STATUS.SIZE_CHANGED]) {
    const count = group.screens.filter((s) => s.status === status).length;
    if (count > 0) parts.push(`${count} ${status}`);
  }
  const measured = group.screens.filter((s) => s.changedRatio !== null);
  if (measured.length > 0) {
    parts.push(`up to ${formatPercent(measured[0].changedRatio)} changed`);
  }
  return parts.join(", ");
}

/** Describes the picture for a reader who cannot see it. */
function screenAltText(screen, coverage) {
  const stem = screen.name.replace(/\.png$/, "");
  if (screen.status === STATUS.ADDED) return `${stem}, this PR only`;
  if (screen.status === STATUS.REMOVED) return `${stem}, merge-base only`;

  const stacked = coverage?.layout === LAYOUT.STACKED;
  if (coverage?.panels === 3) {
    return stacked
      ? `${stem}, merge-base on top, this PR below it, and the changed areas ringed underneath`
      : `${stem}, merge-base on the left, this PR in the middle, and the changed areas ringed on the right`;
  }
  const where = stacked
    ? "on top and this PR underneath"
    : "on the left and this PR on the right";
  return `${stem}, merge-base ${where}`;
}

function renderGroup(group, embeddedNames, coverage, baseUrl, expanded) {
  const lines = [
    // Escaped, not interpolated raw: the group name is a Storybook id or a
    // route out of a capture this pull request's code drove, and it lands
    // inside a tag. Inert today only because those ids happen to match
    // [a-z0-9-]; that is a property of the current capture, not a guarantee
    // this renderer gets to rely on.
    `<details${expanded ? " open" : ""}><summary><code>${escapeHtml(group.group)}</code> - ${escapeHtml(groupHeadline(group))}</summary>`,
    "",
  ];

  const shown = group.screens.filter((screen) =>
    embeddedNames.has(`${group.surface}/${screen.name}`),
  );

  for (const screen of shown) {
    const url = `${baseUrl}/${group.surface}/${encodeURIComponent(screen.name)}`;
    const picture = coverage.get(`${group.surface}/${screen.name}`);
    lines.push(`**${screen.variant}** - ${screenCaption(screen, picture)}`);
    lines.push("");
    lines.push(`![${screenAltText(screen, picture)}](${url})`);
    lines.push("");
  }

  const remaining = group.screens.length - shown.length;
  if (remaining > 0) {
    lines.push(
      `<sub>${remaining} more changed screen${remaining === 1 ? "" : "s"} in this group - listed in full below.</sub>`,
    );
    lines.push("");
  }

  lines.push("</details>");
  lines.push("");
  return lines;
}

/**
 * The comment body for a run that did produce a comparison and found
 * changes. The workflow keeps owning the "nothing was compared" and
 * "nothing changed" wordings, because those are facts about the job's own
 * steps rather than about the report.
 */
function renderBody({
  surfaces,
  ranked,
  embedded,
  coverage,
  publishedWidth,
  baseUrl,
  runUrl,
  candidateRef,
  diffText,
}) {
  const changedTotal = surfaces.reduce((sum, s) => sum + s.changedCount, 0);
  const screenTotal = surfaces.reduce((sum, s) => sum + s.totalCount, 0);
  const embeddedNames = new Set(
    embedded.map((entry) => `${entry.surface}/${entry.screen.name}`),
  );

  const lines = [
    "### Visual regression",
    "",
    `:framed_picture: **${changedTotal} of ${screenTotal} screens render differently** than the merge-base.`,
    "",
  ];

  // Groups are ranked across both surfaces, but the SECTIONS keep the order
  // the surfaces were passed in, which puts the vault app above Storybook
  // even on a run where a story moved more. That is deliberate and is the
  // same judgement as MIN_EMBEDDED_GROUPS_PER_SURFACE: a component story
  // changing is evidence, a shipped route changing is the thing itself.
  // Each section opens on its own worst group, so neither surface is more
  // than one heading away.
  for (const surface of surfaces) {
    const pictured = ranked.filter(
      (group) =>
        group.surface === surface.name &&
        group.screens.some((screen) => embeddedNames.has(`${surface.name}/${screen.name}`)),
    );
    if (pictured.length === 0) continue;
    const groupCount = ranked.filter((group) => group.surface === surface.name).length;
    lines.push(
      `#### ${surface.name} - ${surface.changedCount} of ${surface.totalCount} screens changed`,
    );
    lines.push("");
    // Say outright when the sections below are not all of them. The heading
    // counts screens and the sections count groups, so without this a
    // reviewer reading "40 changed" under three collapsed sections has no
    // way to tell whether the other groups were fine or merely unprinted.
    if (pictured.length < groupCount) {
      lines.push(
        `<sub>Showing ${pictured.length} of ${groupCount} changed groups. The rest are in the full list at the end.</sub>`,
      );
      lines.push("");
    }
    // Each surface opens on its worst group and folds the rest away, so the
    // comment lands on one picture per surface instead of a wall of them.
    for (const [index, group] of pictured.entries()) {
      lines.push(
        ...renderGroup(group, embeddedNames, coverage, baseUrl, index === 0),
      );
    }
  }

  lines.push(`<details><summary>All ${changedTotal} changed screens</summary>`);
  lines.push("");
  lines.push("```");
  lines.push(diffText.trimEnd());
  lines.push("```");
  lines.push("");
  lines.push("</details>");
  lines.push("");
  // Said outright when the pictures are not life size. A reviewer measuring
  // a control against the picture would otherwise be measuring it against
  // whatever reduction that run's budget happened to force.
  const reduced =
    publishedWidth === null
      ? ""
      : `, reduced to ${publishedWidth}px wide so the set fits in a comment`;
  // Deliberately not "the N most-changed": the selection reserves slots per
  // surface, so a pictured vault screen can have moved less than a Storybook
  // story that got no picture. Claiming a strict ranking would send a
  // reviewer looking for a worst offender that is not there.
  lines.push(
    `<sub>${embedded.length} screen${embedded.length === 1 ? "" : "s"} pictured, cropped to the part that changed${reduced} - a sample across the ` +
      `worst-hit groups on each surface, not a ranking. Full-resolution before / after / diff for every screen: ` +
      `[open the run](${runUrl}#artifacts), download **visual-report**, open \`index.html\`.</sub>`,
  );
  lines.push("");
  lines.push(
    "<sub>If these changes are intentional there is nothing to update - this repo stores no baseline images. " +
      "The baseline is recomputed from the merge-base on every run.</sub>",
  );
  lines.push("");
  // Names the commit this describes. There is one of these comments per
  // pull request and it is rewritten in place on every push, so without the
  // sha a reader has no way to tell a current report from one left behind
  // by a run that failed to update it.
  lines.push(
    `<sub>Compared \`${candidateRef}\` against the merge-base. Images are pruned when this pull request closes.</sub>`,
  );
  lines.push("");
  return lines.join("\n");
}

async function readSummary(reportDir, surface) {
  const file = path.join(reportDir, surface, "summary.json");
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportDir = args.get("report");
  const outDir = args.get("out");
  const baseUrl = args.get("base-url");
  const bodyFile = args.get("body");
  const runUrl = args.get("run-url");
  const candidateRef = args.get("candidate-ref");
  const diffTextFile = args.get("diff-text");
  const surfaceNames = (args.get("surfaces") ?? "").split(",").filter(Boolean);

  const usage =
    "Usage: visual-embed.mjs --report <dir> --surfaces <a,b> --out <dir> " +
    "--base-url <url> --body <file> --run-url <url> --candidate-ref <sha> " +
    "--diff-text <file>";

  // Checked one flag at a time so the error names the one that is wrong.
  //
  // `value === "true"` is not paranoia: `parseArgs` stores the string "true"
  // for a flag whose value is missing, and "true" is truthy. Without it a
  // dropped `--base-url` value embeds every picture at the relative URL
  // "true/<surface>/<name>.png" - a comment full of broken images, exit code
  // 0, and nothing in the run saying so. None of these flags legitimately
  // takes "true" as a value.
  for (const [flag, value] of [
    ["--report", reportDir],
    ["--out", outDir],
    ["--base-url", baseUrl],
    ["--body", bodyFile],
    ["--run-url", runUrl],
    ["--candidate-ref", candidateRef],
    ["--diff-text", diffTextFile],
  ]) {
    if (!value || value === "true") {
      throw new Error(`${flag} needs a value. ${usage}`);
    }
  }

  // Shape, not just presence: these two are pasted into Markdown, where a
  // relative or malformed URL renders as a broken image rather than as an
  // error anybody sees.
  for (const [flag, value] of [
    ["--base-url", baseUrl],
    ["--run-url", runUrl],
  ]) {
    if (!value.startsWith("https://")) {
      throw new Error(`${flag} must be an absolute https URL, got "${value}".`);
    }
  }
  if (surfaceNames.length === 0) {
    throw new Error("--surfaces must name at least one captured surface.");
  }

  const surfaces = [];
  for (const name of surfaceNames) {
    const summary = await readSummary(reportDir, name);
    // A surface whose capture never completed has no summary at all. The
    // workflow already names it as missing in the comment; skipping it here
    // keeps this script from inventing a zero.
    if (summary === null) continue;
    const groups = groupChangedResults(name, summary.results);
    surfaces.push({
      name,
      totalCount: summary.totalCount,
      // Counted from the screens this comment actually describes, not read
      // from summary.changedCount. The two agree today because visual-diff
      // derives that field the same way, but a header that disagreed with
      // the list under it would be the worst kind of wrong here - the
      // reviewer would trust the number and stop looking.
      changedCount: groups.reduce((total, group) => total + group.screens.length, 0),
      groups,
    });
  }

  if (surfaces.length === 0) {
    throw new Error(
      `No summary.json found under ${reportDir} for: ${surfaceNames.join(", ")}. Run visual-diff.mjs first.`,
    );
  }

  const ranked = rankGroups(surfaces.flatMap((surface) => surface.groups));
  const embedded = selectEmbeddedScreens(ranked);

  const coverage = new Map();
  // What actually got composed, which is not always what was selected, and
  // is in turn not always what gets published. A screen drops out here on a
  // compose failure or as a duplicate, and below it if the set will not fit
  // the byte budget. The body has to be rendered from what survives both -
  // a group that renders an image URL for a file nobody wrote is a broken
  // image in the comment. Dropping out is not silent: renderGroup folds the
  // screen into its "N more changed screens in this group" line and the
  // full text listing still names it.
  const composed = [];
  const digests = new Map();
  for (const entry of embedded) {
    const key = `${entry.surface}/${entry.screen.name}`;

    let picture;
    try {
      picture = await composeComposite(reportDir, entry.surface, entry.screen.name);
    } catch (error) {
      // Per screen rather than fatal. Both captures are continue-on-error,
      // so a truncated PNG is a realistic input, and PNG.sync.read throwing
      // out of here used to cost every picture in the run: the step exited
      // 1, publish was skipped, and the comment quietly fell back to the
      // text listing. Everything else in this pipeline degrades per file;
      // this is the one place a single bad byte could take the lot.
      process.stderr.write(`Skipping ${key}: ${error.message}\n`);
      continue;
    }

    // Two routes can render the same picture - the same empty or
    // unconnected state photographed twice - and they are different groups
    // by construction, so grouping cannot catch it. Spending two of five
    // slots on one fact is the thing the caps exist to prevent. Note this
    // frees the slot rather than reassigning it: selection has already run,
    // so the comment shows fewer pictures, not a different one.
    // Hashed on the pixels rather than on an encoding, so a twin is caught
    // before the width the set is published at has been decided - and stays
    // caught whatever that width turns out to be.
    const digest = createHash("sha256")
      .update(picture.composite.data)
      .digest("hex");
    const twin = digests.get(digest);
    if (twin) {
      process.stderr.write(`Skipping ${key}: pixel-identical to ${twin}.\n`);
      continue;
    }
    digests.set(digest, key);

    composed.push({ key, entry, ...picture });
  }

  const { width, published, dropped } = fitPublishedImages(composed);
  for (const picture of dropped) {
    process.stderr.write(
      `Skipping ${picture.key}: the set does not fit the published byte budget.\n`,
    );
  }

  await fs.mkdir(outDir, { recursive: true });
  for (const picture of published) {
    const { surface, screen } = picture.entry;
    const target = path.join(outDir, surface, screen.name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, picture.bytes);
    coverage.set(picture.key, picture.coverage);
  }

  // Only when a picture actually lost pixels. The top rung is the width the
  // composites are already built at, so on the ordinary run nothing is
  // reduced and the comment should not claim otherwise.
  const wasReduced = published.some(
    (picture) => picture.composite.width > width,
  );

  const body = renderBody({
    surfaces,
    ranked,
    embedded: published.map((picture) => picture.entry),
    coverage,
    publishedWidth: wasReduced ? width : null,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    runUrl,
    candidateRef,
    diffText: await fs.readFile(diffTextFile, "utf8"),
  });
  await fs.writeFile(bodyFile, `${body}\n`);

  const at = wasReduced ? ` at ${width}px wide` : "";
  const short =
    dropped.length > 0
      ? `, ${dropped.length} left out to stay inside the byte budget`
      : "";
  process.stdout.write(
    `Composed ${published.length} before/after image(s) into ${outDir}${at}${short}.\n`,
  );
}

// The pure selection, cropping and sizing rules, exported for the unit
// tests in `scripts/__tests__/visual-embed.test.mjs`. These are the ones
// worth pinning: each of their comments records a rule that was already got
// wrong once, and each is invisible in the rendered comment when it
// regresses - a wrong crop still produces a picture, just not of the
// change, and a budget that does not bind produces no picture at all.
export {
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
};

// Only run as a CLI, so importing this from a test does not compose a
// report. visual-diff.mjs guards the same way for the same reason.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Stack, not just message: a PNG.sync.read failure on a truncated capture
    // is near-undiagnosable from the message alone.
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
