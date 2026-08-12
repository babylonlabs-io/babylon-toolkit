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
 * Only a slice of the changed screens is embedded (see the caps below). The
 * body always also carries the complete text list, so the reviewer can see
 * that the pictures are a sample rather than the whole story.
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
 * Width the composite is reduced to before it is published.
 *
 * A comment body is about 800px wide, and GitHub scales any wider image
 * down to fit, so pixels past this point are never shown - they are paid
 * for only in clone weight, because every `git clone` of this repo fetches
 * the branch these images live on. Two side-by-side 900px Storybook frames
 * come to 1808px, so this halves them to roughly what the browser was going
 * to render anyway.
 */
const EMBED_MAX_WIDTH = 1000;

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
 */
const MAX_COMPOSITE_HEIGHT = 2400;

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
 */
function cropWindow(band, height) {
  if (band === null) {
    return {
      top: 0,
      height: Math.min(height, MAX_COMPOSITE_HEIGHT),
      clipped: height > MAX_COMPOSITE_HEIGHT,
    };
  }

  const bandTop = Math.max(0, band.first - CROP_CONTEXT_ROWS);
  const bandBottom = Math.min(height, band.last + 1 + CROP_CONTEXT_ROWS);
  const keepWholePage =
    bandBottom - bandTop > height * CROP_MAX_KEPT_FRACTION;

  const wantedTop = keepWholePage ? 0 : bandTop;
  const wantedHeight = keepWholePage ? height : bandBottom - bandTop;
  if (wantedHeight <= MAX_COMPOSITE_HEIGHT) {
    return { top: wantedTop, height: wantedHeight, clipped: false };
  }

  // Rule 2. Start at the band, pulled back only as far as is needed to
  // fill the window against the bottom of the page.
  return {
    top: Math.min(bandTop, Math.max(0, height - MAX_COMPOSITE_HEIGHT)),
    height: MAX_COMPOSITE_HEIGHT,
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

/** Copies `window` rows of `source` into `target` with its left edge at `x`. */
function blit(source, target, x, window) {
  const rows = Math.min(window.height, Math.max(0, source.height - window.top));
  for (let row = 0; row < rows; row += 1) {
    const from = (window.top + row) * source.width * 4;
    const to = (row * target.width + x) * 4;
    source.data.copy(target.data, to, from, from + source.width * 4);
  }
}

/**
 * Stitches the two sides into one image, before on the left, and reports how
 * much of the screen's height that image ended up covering.
 *
 * Side by side rather than stacked because the panels are then the same
 * distance from the eye at every scroll position, and because a stacked
 * pair of full-page captures is twice as tall as an already-tall page.
 * A missing side (an added or removed screen) renders as one panel.
 */
function composeBeforeAfter(baseline, candidate) {
  const present = [baseline, candidate].filter((png) => png !== null);
  if (present.length === 0) throw new Error("Neither side of the pair was readable.");

  const panelWidth = Math.max(...present.map((png) => png.width));
  const band = baseline && candidate ? changedRowBand(baseline, candidate) : null;
  const fullHeight = Math.max(...present.map((png) => png.height));
  const window = cropWindow(band, fullHeight);

  const width =
    present.length === 2 ? panelWidth * 2 + PANEL_GUTTER_WIDTH : panelWidth;
  const composite = new PNG({ width, height: window.height });
  fill(composite, PANEL_PADDING_COLOUR);

  if (present.length === 2) {
    for (let y = 0; y < window.height; y += 1) {
      for (let x = 0; x < PANEL_GUTTER_WIDTH; x += 1) {
        const i = (y * width + panelWidth + x) * 4;
        composite.data[i] = PANEL_GUTTER_COLOUR[0];
        composite.data[i + 1] = PANEL_GUTTER_COLOUR[1];
        composite.data[i + 2] = PANEL_GUTTER_COLOUR[2];
        composite.data[i + 3] = 255;
      }
    }
    blit(baseline, composite, 0, window);
    blit(candidate, composite, panelWidth + PANEL_GUTTER_WIDTH, window);
  } else {
    blit(present[0], composite, 0, window);
  }

  return {
    composite,
    coverage: { shown: window.height, total: fullHeight, clipped: window.clipped },
  };
}

/**
 * Shrinks by an integer factor, averaging each block of source pixels.
 *
 * Averaging rather than dropping pixels: nearest-neighbour would sample a
 * one-pixel-wide border change on some rows and miss it on others, so a
 * hairline that moved would flicker in and out of the published image.
 * An average always carries some of the new colour into the block.
 */
function downscale(source, maxWidth) {
  const factor = Math.ceil(source.width / maxWidth);
  if (factor <= 1) return source;

  const width = Math.ceil(source.width / factor);
  const height = Math.ceil(source.height / factor);
  const target = new PNG({ width, height });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let sampled = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        const sourceY = y * factor + dy;
        if (sourceY >= source.height) break;
        for (let dx = 0; dx < factor; dx += 1) {
          const sourceX = x * factor + dx;
          if (sourceX >= source.width) break;
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
 * Composes one before/after picture and hands back the bytes rather than
 * writing them.
 *
 * Split that way so the caller can decide not to write: it hashes what
 * comes back to drop pixel-identical twins, and a throw here costs one
 * screen instead of the file it would otherwise have written.
 */
async function composeComposite(reportDir, surface, name) {
  const baseline = await readPngIfPresent(
    path.join(reportDir, surface, "baseline", name),
  );
  const candidate = await readPngIfPresent(
    path.join(reportDir, surface, "candidate", name),
  );
  const { composite, coverage } = composeBeforeAfter(baseline, candidate);
  return {
    coverage,
    bytes: PNG.sync.write(downscale(composite, EMBED_MAX_WIDTH)),
  };
}

/**
 * How a screen's caption describes what the picture below it shows.
 *
 * Which panel is which is spelled out rather than left to a convention.
 * Nothing is drawn into the image itself to say so, and "before / after"
 * on its own reads as a pair of alternatives as easily as an ordering.
 */
const PANEL_ORDER_NOTE = "before on the left, after on the right";

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
  if (result.status === STATUS.SIZE_CHANGED) {
    return `${result.baselineSize} to ${result.candidateSize} - ${PANEL_ORDER_NOTE}${clipped}`;
  }
  return `${formatPercent(result.changedRatio)} of pixels - ${PANEL_ORDER_NOTE}${clipped}`;
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
function screenAltText(screen) {
  const stem = screen.name.replace(/\.png$/, "");
  if (screen.status === STATUS.ADDED) return `${stem}, this PR only`;
  if (screen.status === STATUS.REMOVED) return `${stem}, merge-base only`;
  return `${stem}, merge-base on the left and this PR on the right`;
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
    lines.push(
      `**${screen.variant}** - ${screenCaption(screen, coverage.get(`${group.surface}/${screen.name}`))}`,
    );
    lines.push("");
    lines.push(`![${screenAltText(screen)}](${url})`);
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
  // Deliberately not "the N most-changed": the selection reserves slots per
  // surface, so a pictured vault screen can have moved less than a Storybook
  // story that got no picture. Claiming a strict ranking would send a
  // reviewer looking for a worst offender that is not there.
  lines.push(
    `<sub>${embedded.length} screen${embedded.length === 1 ? "" : "s"} pictured, cropped to the part that changed - a sample across the ` +
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

  await fs.mkdir(outDir, { recursive: true });
  const coverage = new Map();
  // What actually got written, which is not always what was selected. A
  // screen drops out here on a compose failure or as a duplicate, and the
  // body has to be rendered from this rather than from `embedded` - a group
  // that renders an image URL for a file nobody wrote is a broken image in
  // the comment. Dropping out is not silent: renderGroup folds the screen
  // into its "N more changed screens in this group" line and the full text
  // listing still names it.
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
    const digest = createHash("sha256").update(picture.bytes).digest("hex");
    const twin = digests.get(digest);
    if (twin) {
      process.stderr.write(`Skipping ${key}: pixel-identical to ${twin}.\n`);
      continue;
    }
    digests.set(digest, key);

    const target = path.join(outDir, entry.surface, entry.screen.name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, picture.bytes);
    coverage.set(key, picture.coverage);
    composed.push(entry);
  }

  const body = renderBody({
    surfaces,
    ranked,
    embedded: composed,
    coverage,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    runUrl,
    candidateRef,
    diffText: await fs.readFile(diffTextFile, "utf8"),
  });
  await fs.writeFile(bodyFile, `${body}\n`);

  process.stdout.write(
    `Composed ${composed.length} before/after image(s) into ${outDir}.\n`,
  );
}

// The pure selection and cropping rules, exported for the unit tests in
// `scripts/__tests__/visual-embed.test.mjs`. These three are the ones worth
// pinning: each of their comments records a rule that was already got wrong
// once, and each is invisible in the rendered comment when it regresses -
// a wrong crop still produces a picture, just not of the change.
export { changedRowBand, cropWindow, selectEmbeddedGroups };

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
