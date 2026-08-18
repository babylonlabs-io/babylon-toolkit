import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { PNG } from "pngjs";

import {
  changedPixelCutoff,
  compareOne,
  escapeHtml,
  parseArgs,
  STATUS,
} from "../visual-diff.mjs";

test("changedPixelCutoff holds an absolute floor on small captures", () => {
  // Ratio alone would put the cutoff at 0.4px here, so a two-pixel
  // antialiasing wobble on a story would read as a visual change.
  assert.equal(changedPixelCutoff(64, 64), 24);
});

test("changedPixelCutoff scales with area once the ratio clears the floor", () => {
  // Not an exact equality: the cutoff is a float, and it is compared with
  // `>` against an integer pixel count rather than being rounded.
  assert.ok(Math.abs(changedPixelCutoff(1200, 4000) - 480) < 1e-6);
});

test("escapeHtml neutralises a tag in a screen name", () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
});

test("parseArgs reads --flag value pairs", () => {
  const args = parseArgs(["--report", "/tmp/report", "--surfaces", "vault"]);

  assert.equal(args.get("report"), "/tmp/report");
  assert.equal(args.get("surfaces"), "vault");
});

/** Writes a solid PNG, optionally flipping the first `flipped` pixels. */
async function writePng(file, width, height, flipped = 0) {
  const image = new PNG({ width, height });
  image.data.fill(0);
  for (let i = 0; i < image.data.length; i += 4) image.data[i + 3] = 255;
  for (let i = 0; i < flipped * 4; i += 4) {
    image.data[i] = 255;
    image.data[i + 1] = 255;
    image.data[i + 2] = 255;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, PNG.sync.write(image));
}

async function scratch() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "visual-diff-test-"));
  await fs.mkdir(path.join(dir, "diff"), { recursive: true });
  return dir;
}

test("compareOne treats a difference under the cutoff as unchanged", async () => {
  const dir = await scratch();
  await writePng(path.join(dir, "baseline", "a.png"), 64, 64);
  await writePng(path.join(dir, "candidate", "a.png"), 64, 64, 10);

  const result = await compareOne(
    "a.png",
    path.join(dir, "baseline"),
    path.join(dir, "candidate"),
    dir,
  );

  assert.equal(result.status, STATUS.UNCHANGED);
  // No diff image for an unchanged screen: the report links one only where
  // it has something to show.
  await assert.rejects(() => fs.access(path.join(dir, "diff", "a.png")));
});

test("compareOne reports a difference over the cutoff as changed", async () => {
  const dir = await scratch();
  await writePng(path.join(dir, "baseline", "a.png"), 64, 64);
  await writePng(path.join(dir, "candidate", "a.png"), 64, 64, 500);

  const result = await compareOne(
    "a.png",
    path.join(dir, "baseline"),
    path.join(dir, "candidate"),
    dir,
  );

  assert.equal(result.status, STATUS.CHANGED);
  assert.equal(result.changedPixels, 500);
  await fs.access(path.join(dir, "diff", "a.png"));
});

// Full-page captures change height whenever content does. pixelmatch cannot
// diff mismatched buffers, so this must be its own status rather than a
// crash or a forced crop.
test("compareOne reports a size change on its own terms", async () => {
  const dir = await scratch();
  await writePng(path.join(dir, "baseline", "a.png"), 64, 64);
  await writePng(path.join(dir, "candidate", "a.png"), 64, 96);

  const result = await compareOne(
    "a.png",
    path.join(dir, "baseline"),
    path.join(dir, "candidate"),
    dir,
  );

  assert.equal(result.status, STATUS.SIZE_CHANGED);
  assert.equal(result.baselineSize, "64x64");
  assert.equal(result.candidateSize, "64x96");
  assert.equal(result.changedPixels, null);
});

// The silent-green path this manifest exists to close. Both sides of the
// comparison run the same stashed harness against the same committed fixture,
// so a capture failure takes the same screens out on BOTH sides - and a screen
// absent from both never enters the union the diff iterates, so it can never
// be reported as REMOVED. Without an expected set the run says "no visual
// changes" for screens nobody photographed.
test("a screen in the manifest but absent from both sides is reported as never captured", async () => {
  const dir = await scratch();
  await writePng(path.join(dir, "baseline", "kept.png"), 64, 64);
  await writePng(path.join(dir, "candidate", "kept.png"), 64, 64);
  for (const side of ["baseline", "candidate"]) {
    await fs.writeFile(
      path.join(dir, side, "expected-screens.txt"),
      "kept.png\nwithheld.png\n",
    );
  }

  const script = path.join(import.meta.dirname, "..", "visual-diff.mjs");
  const run = spawnSync(
    process.execPath,
    [
      script,
      "--baseline",
      path.join(dir, "baseline"),
      "--candidate",
      path.join(dir, "candidate"),
      "--out",
      path.join(dir, "report"),
      "--expected-baseline",
      path.join(dir, "baseline", "expected-screens.txt"),
      "--expected-candidate",
      path.join(dir, "candidate", "expected-screens.txt"),
      "--fail-on-change",
      "true",
    ],
    { encoding: "utf8" },
  );

  const summary = JSON.parse(
    await fs.readFile(path.join(dir, "report", "summary.json"), "utf8"),
  );

  // The comparison itself is clean - that is exactly the trap.
  assert.equal(summary.changedCount, 0);
  assert.deepEqual(summary.absentScreens, ["withheld.png"]);
  assert.equal(summary.expectedCount, 2);
  assert.match(run.stdout, /Never captured on either side \(1 of 2/);
  assert.equal(run.status, 1);
});

test("a capture with no manifest is reported as unknown rather than complete", async () => {
  const dir = await scratch();
  await writePng(path.join(dir, "baseline", "kept.png"), 64, 64);
  await writePng(path.join(dir, "candidate", "kept.png"), 64, 64);

  const script = path.join(import.meta.dirname, "..", "visual-diff.mjs");
  const run = spawnSync(
    process.execPath,
    [
      script,
      "--baseline",
      path.join(dir, "baseline"),
      "--candidate",
      path.join(dir, "candidate"),
      "--out",
      path.join(dir, "report"),
      "--expected-baseline",
      path.join(dir, "baseline", "expected-screens.txt"),
      "--expected-candidate",
      path.join(dir, "candidate", "expected-screens.txt"),
    ],
    { encoding: "utf8" },
  );

  const summary = JSON.parse(
    await fs.readFile(path.join(dir, "report", "summary.json"), "utf8"),
  );

  assert.equal(summary.expectedCount, null);
  assert.deepEqual(summary.absentScreens, []);
  assert.match(run.stdout, /No expected-screens manifest on either side/);
});
