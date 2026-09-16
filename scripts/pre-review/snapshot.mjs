/**
 * The pre-review snapshot: which files a change touches, with what content,
 * reduced to one digest, plus the check that a PR carries a record.
 *
 *   node scripts/pre-review/snapshot.mjs record <base>
 *   node scripts/pre-review/snapshot.mjs check --body-file <file> --branch <name>
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

/** Every snapshot line in a description, e.g. pasted twice by mistake. */
const SNAPSHOT_LINE_PATTERN = /<!-- pre-review-snapshot v1 ([^\n]*?) -->/g;

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const GIT_OBJECT_ID_PATTERN = /^[0-9a-f]{40}$/;

export const CHECK_STATUS = {
  /** The description carries no snapshot line. */
  MISSING: "missing",
  /** More than one different snapshot line; which one counts is unclear. */
  AMBIGUOUS: "ambiguous",
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
      throw new Error(`Snapshot line has no branch=<name>: ${match[0]}`);
    }
    if (files === undefined || !/^\d+$/.test(files)) {
      throw new Error(`Snapshot line has no valid files=<count>: ${match[0]}`);
    }
    if (sha256 === undefined || !SHA256_HEX_PATTERN.test(sha256)) {
      throw new Error(`Snapshot line has no valid files-sha256=<hex>: ${match[0]}`);
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
  const records = parseSnapshots(text);
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
  throw new Error(`Unknown command "${command}". Expected "record" or "check".`);
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
