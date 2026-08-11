/**
 * Compares two directories of captured PNGs and writes a reviewable report.
 *
 *   node scripts/visual-diff.mjs \
 *     --baseline <dir> --candidate <dir> --out <dir> [--fail-on-change]
 *
 * There are no stored baselines in this repo. The `--baseline` directory
 * is produced by running the same capture against the PR's merge-base in
 * the same container, so both sides are rendered by identical browser,
 * fonts and OS. That is what lets the pixel threshold stay at zero-ish
 * instead of being loosened until real regressions slip through.
 *
 * Exit code is 0 unless `--fail-on-change` is passed, so the check can
 * start out advisory and be promoted to blocking once its noise floor is
 * proven in practice.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * Per-pixel colour distance below which two pixels count as equal.
 * Both sides render in the same container, so this exists only to
 * absorb GPU-level antialiasing jitter, not real colour differences.
 */
const PIXEL_MATCH_THRESHOLD = 0.1;

/**
 * Changed pixels below this fraction of the image are reported but do not
 * mark the run as changed. Guards against a stray subpixel without hiding
 * anything a reviewer would notice.
 *
 * A ratio alone loses sensitivity as a page grows: at 1280x4000 it absorbs
 * ~512 pixels, about a 24x24 icon. `MIN_CHANGED_PIXELS` is the floor that
 * holds sensitivity constant regardless of capture height, and the effective
 * cutoff is the larger of the two.
 */
const CHANGED_RATIO_TOLERANCE = 0.0001;

/**
 * Absolute floor, in pixels, below which a difference is treated as noise no
 * matter how large the image. Sized well under a glyph or icon: real diffs
 * measured on this harness's own runs landed at 0.090%-0.569% of the frame,
 * hundreds to thousands of pixels, so there is ample headroom above this.
 */
const MIN_CHANGED_PIXELS = 24;

/** The cutoff a capture must exceed to count as changed. */
export function changedPixelCutoff(width, height) {
  return Math.max(MIN_CHANGED_PIXELS, CHANGED_RATIO_TOLERANCE * width * height);
}

/**
 * The statuses a compared screen can end up in. Exported because
 * `scripts/visual-embed.mjs` groups and captions by them: with the strings
 * restated there, renaming one here would leave that script silently
 * mis-captioning the screen rather than failing.
 */
export const STATUS = {
  UNCHANGED: "unchanged",
  CHANGED: "changed",
  ADDED: "added",
  REMOVED: "removed",
  SIZE_CHANGED: "size-changed",
};

export function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    // `pnpm run visual:diff -- --baseline ...` forwards a bare `--`.
    // Without this it parses as an empty-named flag and swallows the
    // next real argument.
    if (token === "--") continue;
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args.set(key, "true");
    } else {
      args.set(key, next);
      i += 1;
    }
  }
  return args;
}

async function listPngs(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((name) => name.endsWith(".png")).sort();
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Capture directory not found: ${dir}. Run the capture step for this side first.`,
      );
    }
    throw error;
  }
}

async function readPng(file) {
  return PNG.sync.read(await fs.readFile(file));
}

export async function compareOne(name, baselineDir, candidateDir, outDir) {
  const baseline = await readPng(path.join(baselineDir, name));
  const candidate = await readPng(path.join(candidateDir, name));

  // Full-page screenshots change height whenever content does. That is a
  // real visual change, but pixelmatch cannot diff mismatched buffers, so
  // it is reported on its own terms instead of being force-cropped.
  if (baseline.width !== candidate.width || baseline.height !== candidate.height) {
    return {
      name,
      status: STATUS.SIZE_CHANGED,
      baselineSize: `${baseline.width}x${baseline.height}`,
      candidateSize: `${candidate.width}x${candidate.height}`,
      changedPixels: null,
      changedRatio: null,
    };
  }

  const { width, height } = baseline;
  const diff = new PNG({ width, height });
  const changedPixels = pixelmatch(
    baseline.data,
    candidate.data,
    diff.data,
    width,
    height,
    { threshold: PIXEL_MATCH_THRESHOLD },
  );

  const changedRatio = changedPixels / (width * height);
  const changed = changedPixels > changedPixelCutoff(width, height);

  if (changed) {
    await fs.writeFile(path.join(outDir, "diff", name), PNG.sync.write(diff));
  }

  return {
    name,
    status: changed ? STATUS.CHANGED : STATUS.UNCHANGED,
    baselineSize: `${width}x${height}`,
    candidateSize: `${width}x${height}`,
    changedPixels,
    changedRatio,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderReport(results, meta) {
  const interesting = results.filter((r) => r.status !== STATUS.UNCHANGED);
  const rows = (interesting.length ? interesting : results)
    .map((result) => {
      const pct =
        result.changedRatio === null
          ? "-"
          : `${(result.changedRatio * 100).toFixed(3)}%`;
      const images =
        result.status === STATUS.ADDED
          ? `<figure><figcaption>added</figcaption><img src="candidate/${escapeHtml(result.name)}" /></figure>`
          : result.status === STATUS.REMOVED
            ? `<figure><figcaption>removed</figcaption><img src="baseline/${escapeHtml(result.name)}" /></figure>`
            : `
        <figure><figcaption>baseline (merge-base)</figcaption><img src="baseline/${escapeHtml(result.name)}" /></figure>
        <figure><figcaption>candidate (this PR)</figcaption><img src="candidate/${escapeHtml(result.name)}" /></figure>
        ${
          result.status === STATUS.CHANGED
            ? `<figure><figcaption>diff</figcaption><img src="diff/${escapeHtml(result.name)}" /></figure>`
            : ""
        }`;
      return `
      <section class="card ${escapeHtml(result.status)}">
        <header>
          <h2>${escapeHtml(result.name)}</h2>
          <span class="badge">${escapeHtml(result.status)}</span>
          <span class="meta">${escapeHtml(result.baselineSize ?? "-")} → ${escapeHtml(result.candidateSize ?? "-")} · ${escapeHtml(pct)} of pixels</span>
        </header>
        <div class="triptych">${images}</div>
      </section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Visual diff · ${escapeHtml(meta.candidateRef)} vs ${escapeHtml(meta.baselineRef)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .summary { color: #666; margin-bottom: 24px; }
  .card { border: 1px solid #d0d0d0; border-radius: 8px; margin-bottom: 24px; overflow: hidden; }
  .card header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #f6f6f6; }
  .card.changed header, .card.size-changed header { background: #fff3cd; }
  .card.added header { background: #d1f7d6; }
  .card.removed header { background: #ffd7d7; }
  .card h2 { font-size: 15px; margin: 0; }
  .badge { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; border: 1px solid currentColor; border-radius: 999px; padding: 2px 8px; }
  .meta { margin-left: auto; color: #555; font-variant-numeric: tabular-nums; }
  .triptych { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; padding: 16px; }
  figure { margin: 0; }
  figcaption { font-size: 12px; color: #666; margin-bottom: 6px; }
  img { width: 100%; height: auto; border: 1px solid #e0e0e0; background: #fff; }
  @media (prefers-color-scheme: dark) {
    body { background: #121212; color: #eee; }
    .card { border-color: #333; }
    .card header { background: #1e1e1e; }
    .card.changed header, .card.size-changed header { background: #4a3f16; }
    .card.added header { background: #17371c; }
    .card.removed header { background: #4a1f1f; }
    .meta, .summary, figcaption { color: #aaa; }
  }
</style>
</head>
<body>
  <h1>Visual diff</h1>
  <p class="summary">
    candidate <code>${escapeHtml(meta.candidateRef)}</code> vs baseline <code>${escapeHtml(meta.baselineRef)}</code><br />
    ${meta.changedCount} of ${meta.totalCount} screens changed.
    ${interesting.length === 0 ? "Showing all screens because nothing changed." : ""}
  </p>
  ${rows}
</body>
</html>`;
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true });
  for (const name of await listPngs(from)) {
    await fs.copyFile(path.join(from, name), path.join(to, name));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baselineDir = args.get("baseline");
  const candidateDir = args.get("candidate");
  const outDir = args.get("out");

  if (!baselineDir || !candidateDir || !outDir) {
    throw new Error(
      "Usage: visual-diff.mjs --baseline <dir> --candidate <dir> --out <dir> [--fail-on-change]",
    );
  }

  await fs.mkdir(path.join(outDir, "diff"), { recursive: true });

  const baselineNames = await listPngs(baselineDir);
  const candidateNames = await listPngs(candidateDir);
  const allNames = [...new Set([...baselineNames, ...candidateNames])].sort();

  const results = [];
  for (const name of allNames) {
    const inBaseline = baselineNames.includes(name);
    const inCandidate = candidateNames.includes(name);

    if (!inBaseline) {
      results.push({
        name,
        status: STATUS.ADDED,
        changedPixels: null,
        changedRatio: null,
      });
      continue;
    }
    if (!inCandidate) {
      results.push({
        name,
        status: STATUS.REMOVED,
        changedPixels: null,
        changedRatio: null,
      });
      continue;
    }
    results.push(await compareOne(name, baselineDir, candidateDir, outDir));
  }

  await copyDir(baselineDir, path.join(outDir, "baseline"));
  await copyDir(candidateDir, path.join(outDir, "candidate"));

  const changed = results.filter((r) => r.status !== STATUS.UNCHANGED);
  const meta = {
    baselineRef: args.get("baseline-ref") ?? "merge-base",
    candidateRef: args.get("candidate-ref") ?? "HEAD",
    totalCount: results.length,
    changedCount: changed.length,
  };

  await fs.writeFile(
    path.join(outDir, "summary.json"),
    `${JSON.stringify({ ...meta, results }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(outDir, "index.html"),
    renderReport(results, meta),
  );

  const lines = changed.map(
    (r) =>
      `  ${r.status.padEnd(13)} ${r.name}${
        r.changedRatio === null
          ? ""
          : ` (${(r.changedRatio * 100).toFixed(3)}% of pixels)`
      }`,
  );

  if (changed.length === 0) {
    process.stdout.write(
      `No visual changes across ${results.length} screens.\n`,
    );
  } else {
    process.stdout.write(
      `${changed.length} of ${results.length} screens changed:\n${lines.join("\n")}\n`,
    );
  }

  if (changed.length > 0 && args.get("fail-on-change") === "true") {
    process.exitCode = 1;
  }
}

// Only run as a CLI. Importing this module (the unit tests do) must not
// execute a diff.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // Stack, not just message: a PNG.sync.read failure on a truncated
    // capture is near-undiagnosable from the message alone.
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
