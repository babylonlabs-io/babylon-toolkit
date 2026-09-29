/**
 * The pre-review snapshot: which files a change touches, with what content,
 * reduced to one digest, plus the check that a PR carries a record.
 *
 *   node scripts/pre-review/snapshot.mjs record <base>
 *   node scripts/pre-review/snapshot.mjs check --body-file <file> --branch <name>
 *   node scripts/pre-review/snapshot.mjs final --base <sha> --state-file <file> --context-file <file>
 *
 * `record` runs in the author's working tree, right after lint. It stores
 * every changed file's content in git's object database (so a later run can
 * diff against exactly what was reviewed) and prints the state's `files` map
 * with the count and digest for the snapshot line.
 *
 * `check` reads the snapshot line from a PR description and confirms that
 * `/pre-review` ran on the PR's branch. It prints the result as JSON and
 * always exits 0 on a completed check: the caller decides what a missing
 * record means.
 *
 * The digest format is specified in `.claude/skills/pre-review/formats.md` >
 * "Snapshot line".
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** Files `/pre-review` itself writes; never part of the reviewed change. */
const PR_DESCRIPTION_PATH = "PR.md";
const STATE_DIRECTORY_PREFIX = ".pre-review/";

/** The blob value recorded for a file the change deletes. */
export const DELETED = "deleted";

/**
 * Every snapshot line in a description, e.g. pasted twice by mistake. A line
 * never spans a line ending, including a lone `\r`, which Markdown also treats
 * as one: CI quotes an unreadable line back inside a code fence.
 */
const SNAPSHOT_LINE_PATTERN = /<!-- pre-review-snapshot v1 ([^\r\n]*?) -->/g;

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const GIT_OBJECT_ID_PATTERN = /^[0-9a-f]{40}$/;

export const CHECK_STATUS = {
  /** The description carries no snapshot line. */
  MISSING: "missing",
  /** More than one different snapshot line; which one counts is unclear. */
  AMBIGUOUS: "ambiguous",
  /** A snapshot line with a missing or invalid field, e.g. a quoted template. */
  MALFORMED: "malformed",
  /** The record was taken on another branch, e.g. copied from another PR. */
  OTHER_BRANCH: "other-branch",
  /** `/pre-review` ran on this branch. */
  MATCH: "match",
};

function git(args, cwd) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
}

/** Splits `-z` output. Paths are kept byte-exact, never unquoted by hand. */
function splitNul(buffer) {
  return buffer
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry.length > 0);
}

function isReviewTooling(filePath) {
  return filePath === PR_DESCRIPTION_PATH || filePath.startsWith(STATE_DIRECTORY_PREFIX);
}

/**
 * Committed, staged, unstaged and untracked changes against `base`, with a
 * rename listed as a delete plus an add. Matches Phase 0 step 3 of the skill.
 */
export function changedPathsInWorktree(base, cwd) {
  const tracked = splitNul(git(["diff", "--name-only", "-z", "--no-renames", base], cwd));
  const untracked = splitNul(git(["ls-files", "-z", "--others", "--exclude-standard"], cwd));
  return [...new Set([...tracked, ...untracked])].filter((p) => !isReviewTooling(p));
}

/**
 * Hashes each path as it is on disk now and stores the content in the object
 * database. A path that no longer exists is `deleted`.
 */
export function recordBlobs(paths, cwd) {
  const blobs = new Map();
  for (const filePath of paths) {
    if (!fs.existsSync(path.join(cwd, filePath))) {
      blobs.set(filePath, DELETED);
      continue;
    }
    blobs.set(filePath, git(["hash-object", "-w", "--", filePath], cwd).toString("utf8").trim());
  }
  return blobs;
}

/**
 * SHA-256 over one `<path> <blob>` line per file, sorted by path in byte
 * order, each ending in a line feed.
 */
export function digestBlobs(blobs) {
  for (const [filePath, blob] of blobs) {
    if (blob !== DELETED && !GIT_OBJECT_ID_PATTERN.test(blob)) {
      throw new Error(`Expected a git object id or "${DELETED}" for ${filePath}, got "${blob}"`);
    }
  }
  const text = [...blobs.keys()]
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map((filePath) => `${filePath} ${blobs.get(filePath)}\n`)
    .join("");
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Bind completion to the code, its base, and the stable review context.
 * Outside anchors stay out of the key: Phase 4 rebuilds that map from the
 * run's own findings after the key is captured. `finalReviewStatus` compares
 * their content with the state, and with the digest the `final_review` marker
 * recorded when the final review completed.
 */
export function finalReviewInputKey({ base, branch, files, context }) {
  if (!GIT_OBJECT_ID_PATTERN.test(base) || !branch || !context.trim()) {
    throw new Error("Final review requires a base commit, branch and nonempty context.");
  }
  return createHash("sha256")
    .update(JSON.stringify([base, branch, digestBlobs(files), context]))
    .digest("hex");
}

/** A completion record cannot replace checks or decisions for these inputs. */
export function finalReviewStatus({ state, inputKey, base, branch, files, outsideAnchors }) {
  const reasons = [];
  const runs = state.runs ?? [];
  const findings = state.findings;
  if (!Array.isArray(runs)) throw new Error("Final review requires a runs array in the state file.");
  if (!Array.isArray(findings)) reasons.push("The findings ledger is missing or invalid.");
  const latest = runs.at(-1);
  const checksPassed = (run) =>
    ["passed", "nothing affected"].includes(run?.checks) &&
    Array.isArray(run.uncovered) &&
    run.uncovered.length === 0;
  if (
    state.base !== base ||
    state.branch !== branch ||
    digestBlobs(new Map(Object.entries(state.files ?? {}))) !== digestBlobs(files) ||
    digestBlobs(new Map(Object.entries(state.outside_anchors ?? {}))) !==
      digestBlobs(outsideAnchors)
  ) {
    reasons.push("The saved review inputs differ from the current inputs.");
  }
  if (latest?.input_key !== inputKey)
    reasons.push("Checks are missing or belong to different inputs.");
  if (!checksPassed(latest)) reasons.push("Checks must pass with no uncovered work.");
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (["fixed", "moot"].includes(finding.status)) continue;
    if (
      finding.severity === "merge-blocker" ||
      !["follow-up", "decline"].includes(finding.decision)
    ) {
      reasons.push(`Finding N${finding.id} still requires a fix or a decision.`);
    }
  }
  const hasRequiredCoverage = (reviewRuns) => {
    let initialComplete = false;
    let incomplete = false;
    let covered = new Set();
    // A no-review run must not erase a missing reviewer from an earlier run.
    for (const run of reviewRuns) {
      if (run.kind === "final") continue;
      const noReview = run.kind === "later" && run.breadth === "none";
      const required = noReview ? [] : run.tier === "full"
        ? ["review-generalist", "review-tracer", "review-panel"]
        : run.tier === "light"
          ? [run.kind === "first" ? "review-generalist" : "review-lane"] : [];
      const complete = ["first", "later"].includes(run.kind) &&
        (noReview || (required.length > 0 &&
          (run.breadth === "whole change" || (run.kind === "later" && run.breadth === "narrowed")))) &&
        Array.isArray(run.uncovered) &&
        run.uncovered.every((item) => /^typecheck-(stub|unbuilt): /.test(item)) &&
        Array.isArray(run.reviewers) &&
        run.reviewers.every((reviewer) => reviewer.completed === true) &&
        (noReview ? run.reviewers.length === 0 :
          required.every((name) => run.reviewers.some((reviewer) => reviewer.name === name)));
      const listed = Array.isArray(run.reviewed) ? run.reviewed : [];
      if (!complete) incomplete = true;
      else if (run.kind === "first") {
        initialComplete = true;
        covered = new Set(listed);
      } else if (run.tier === "full" && run.breadth === "whole change") {
        initialComplete = true;
        incomplete = false;
        covered = new Set(listed);
      } else {
        for (const reviewedPath of listed) covered.add(reviewedPath);
      }
    }
    // Paths that entered after the whole-change run are listed by later runs.
    return initialComplete && !incomplete && [...files.keys()].every((p) => covered.has(p));
  };
  if (!hasRequiredCoverage(runs)) {
    reasons.push("Required review coverage is incomplete. Run /pre-review --full before final review.");
  }
  const outsideAnchorsSha256 = digestBlobs(outsideAnchors);
  if (reasons.length) {
    return {
      input_key: inputKey,
      outside_anchors_sha256: outsideAnchorsSha256,
      status: "blocked",
      reasons,
    };
  }

  const marker = state.final_review;
  const finalRun = Number.isInteger(marker?.run) && marker.run > 0 ? runs[marker.run - 1] : null;
  const reviewed = new Set(finalRun?.reviewed);
  const complete =
    marker?.input_key === inputKey &&
    marker.outside_anchors_sha256 === outsideAnchorsSha256 &&
    finalRun?.input_key === inputKey &&
    finalRun.kind === "final" &&
    finalRun.cold === true &&
    finalRun.breadth === "whole change" &&
    checksPassed(finalRun) &&
    reviewed.size === files.size &&
    [...files.keys()].every((p) => reviewed.has(p)) &&
    hasRequiredCoverage(runs.slice(0, marker.run - 1)) &&
    finalRun.reviewers?.some(
      (reviewer) => reviewer.name === "review-lane" && reviewer.completed === true,
    );
  return {
    input_key: inputKey,
    outside_anchors_sha256: outsideAnchorsSha256,
    status: complete ? "complete" : "pending",
    reasons: complete ? [] : ["Final review has not completed for these inputs."],
  };
}

/** Read current files again so edits made during checks cannot retain completion. */
export function checkFinalReview({ base, state, context, cwd }) {
  const branch = currentBranch(cwd);
  const files = recordBlobs(changedPathsInWorktree(base, cwd), cwd);
  const outsideAnchors = recordBlobs(Object.keys(state.outside_anchors ?? {}), cwd);
  const inputKey = finalReviewInputKey({ base, branch, files, context });
  return finalReviewStatus({
    state,
    inputKey,
    base,
    branch,
    files,
    outsideAnchors,
  });
}

/** A snapshot line that cannot be read as a record. */
export class MalformedSnapshotError extends Error {}

/**
 * The distinct snapshot records in a description. A line missing its branch,
 * file count or digest, or with a malformed value, is rejected rather than
 * skipped, so a hand-edited record cannot read as absent.
 */
export function parseSnapshots(text) {
  const records = new Map();
  for (const match of text.matchAll(SNAPSHOT_LINE_PATTERN)) {
    const fields = new Map(
      match[1].split(" ").map((token) => {
        const separator = token.indexOf("=");
        return separator === -1
          ? [token, ""]
          : [token.slice(0, separator), token.slice(separator + 1)];
      }),
    );
    const branch = fields.get("branch");
    const files = fields.get("files");
    const sha256 = fields.get("files-sha256");
    if (branch === undefined || branch === "") {
      throw new MalformedSnapshotError(`Snapshot line has no branch=<name>: ${match[0]}`);
    }
    if (files === undefined || !/^\d+$/.test(files)) {
      throw new MalformedSnapshotError(`Snapshot line has no valid files=<count>: ${match[0]}`);
    }
    if (sha256 === undefined || !SHA256_HEX_PATTERN.test(sha256)) {
      throw new MalformedSnapshotError(
        `Snapshot line has no valid files-sha256=<hex>: ${match[0]}`,
      );
    }
    records.set(`${branch} ${files} ${sha256}`, { branch, files: Number(files), sha256 });
  }
  return [...records.values()];
}

/**
 * Confirms that a description carries a `/pre-review` record taken on
 * `branch`. The code is not compared with the record: fixing findings, and
 * any change after the review, are the author's to own.
 *
 * TODO: once /pre-review is standard practice across the team, compare the
 * record with the code again: find the commit whose content has the recorded
 * digest (recomputed per commit from `git ls-tree` against its merge-base with
 * main), and require a re-run when the change since that commit exceeds
 * LIGHT_REVIEW_MAX_CHANGED_LINES (150, in .claude/skills/pre-review/SKILL.md)
 * or touches a CLAUDE.md critical path.
 */
export function checkSnapshot({ text, branch }) {
  let records;
  try {
    records = parseSnapshots(text);
  } catch (error) {
    // A result, not a crash: CI turns it into a comment the author can act on.
    if (error instanceof MalformedSnapshotError) {
      return { status: CHECK_STATUS.MALFORMED, error: error.message };
    }
    throw error;
  }
  if (records.length === 0) return { status: CHECK_STATUS.MISSING };
  if (records.length > 1) return { status: CHECK_STATUS.AMBIGUOUS, recorded: records };

  const [recorded] = records;
  const status = recorded.branch === branch ? CHECK_STATUS.MATCH : CHECK_STATUS.OTHER_BRANCH;
  return { status, recorded };
}

/**
 * The local hooks' check: the description `/pre-review` keeps for a branch
 * (`/` in the name becomes `__`). `missing` when it never ran there.
 */
export function checkBranchRecord({ branch, cwd }) {
  const recordPath = path.join(cwd, STATE_DIRECTORY_PREFIX, `${branch.replaceAll("/", "__")}.md`);
  if (!fs.existsSync(recordPath)) return { status: CHECK_STATUS.MISSING };
  return checkSnapshot({ text: fs.readFileSync(recordPath, "utf8"), branch });
}

/** The checked-out branch, or `""` on a detached HEAD. */
export function currentBranch(cwd) {
  return git(["branch", "--show-current"], cwd).toString("utf8").trim();
}

/** Git prints paths relative to the repository root, so every call runs there. */
export function repositoryRoot(cwd) {
  return git(["rev-parse", "--show-toplevel"], cwd).toString("utf8").trim();
}

function parseFlags(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) {
      throw new Error(`Expected --flag value pairs, got: ${argv.join(" ")}`);
    }
    flags.set(argv[i].slice(2), argv[i + 1]);
  }
  return flags;
}

function requireFlag(flags, name) {
  const value = flags.get(name);
  if (value === undefined) throw new Error(`Missing --${name}`);
  return value;
}

function main(argv) {
  const [command, ...rest] = argv;
  if (command === "record") {
    const [base] = rest;
    if (base === undefined || rest.length !== 1) throw new Error("Usage: record <base>");
    const cwd = repositoryRoot(process.cwd());
    const blobs = recordBlobs(changedPathsInWorktree(base, cwd), cwd);
    const output = {
      files: Object.fromEntries(blobs),
      count: blobs.size,
      sha256: digestBlobs(blobs),
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }
  if (command === "check") {
    const flags = parseFlags(rest);
    const result = checkSnapshot({
      text: fs.readFileSync(requireFlag(flags, "body-file"), "utf8"),
      branch: requireFlag(flags, "branch"),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === "final") {
    const flags = parseFlags(rest);
    const statePath = requireFlag(flags, "state-file");
    const result = checkFinalReview({
      base: requireFlag(flags, "base"),
      state: fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : {},
      context: fs.readFileSync(requireFlag(flags, "context-file"), "utf8"),
      cwd: repositoryRoot(process.cwd()),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error(`Unknown command "${command}". Expected "record", "check" or "final".`);
}

// Only run as a CLI: the hooks and the tests import this module.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
