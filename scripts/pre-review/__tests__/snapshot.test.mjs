import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  changedPathsInWorktree,
  CHECK_STATUS,
  checkSnapshot,
  DELETED,
  digestBlobs,
  parseSnapshots,
  recordBlobs,
} from "../snapshot.mjs";

const SCRIPTS = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function snapshotLine({ branch = "feat/x", files = 3, sha256 = "a".repeat(64) } = {}) {
  return `<!-- pre-review-snapshot v1 base=abc branch=${branch} reviewed-at=2026-09-16T00:00:00Z tier=light files=${files} files-sha256=${sha256} -->`;
}

/**
 * A throwaway repo with one commit on `main`, checked out on `feat/x`, removed
 * when the test `t` ends.
 */
function scratchRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pre-review-snapshot-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir }).toString("utf8").trim();
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  git("config", "commit.gpgsign", "false");
  // A developer's global hook template must not run, or fail, these commits.
  git("config", "core.hooksPath", "/dev/null");
  fs.writeFileSync(path.join(dir, "kept.ts"), "kept\n");
  fs.writeFileSync(path.join(dir, "removed.ts"), "removed\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "base");
  git("switch", "--quiet", "-c", "feat/x");
  const write = (file, content) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  };
  return { dir, git, write };
}

test("digestBlobs hashes byte-ordered path lines exactly as formats.md specifies", () => {
  // Expected value from `printf 'B.ts 22…\na.ts 11…\nsrc/gone.ts deleted\n' | shasum -a 256`.
  // Byte order puts the upper-case `B.ts` before `a.ts`; a locale sort would not.
  const blobs = new Map([
    ["src/gone.ts", DELETED],
    ["a.ts", "1111111111111111111111111111111111111111"],
    ["B.ts", "2222222222222222222222222222222222222222"],
  ]);

  assert.equal(
    digestBlobs(blobs),
    "b7bdeb52efb1004c66ecd22f85daa281f5eeeba324654cecb5bf794868a761ef",
  );
});

test("digestBlobs rejects a value that is neither an object id nor deleted", () => {
  assert.throws(() => digestBlobs(new Map([["a.ts", "not-a-sha"]])), /a\.ts/);
});

test("recordBlobs covers edited, added and deleted files but not /pre-review's own", (t) => {
  const repo = scratchRepo(t);
  repo.write("kept.ts", "kept, edited\n");
  repo.write("src/added.ts", "added\n");
  fs.rmSync(path.join(repo.dir, "removed.ts"));
  repo.write("PR.md", "description\n");
  repo.write(".pre-review/feat__x.md", "description\n");

  const blobs = recordBlobs(changedPathsInWorktree("main", repo.dir), repo.dir);

  assert.deepEqual([...blobs.keys()].sort(), ["kept.ts", "removed.ts", "src/added.ts"]);
  assert.equal(blobs.get("removed.ts"), DELETED);
  assert.equal(blobs.get("src/added.ts"), repo.git("hash-object", "src/added.ts"));
});

test("parseSnapshots finds no record in a hand-written description", () => {
  assert.deepEqual(parseSnapshots("## What\n\nFixes the thing."), []);
});

test("parseSnapshots counts the same line pasted twice as one record", () => {
  const line = snapshotLine();

  assert.equal(parseSnapshots(`${line}\n\n${line}`).length, 1);
});

test("parseSnapshots rejects a snapshot line with a truncated digest", () => {
  assert.throws(() => parseSnapshots(snapshotLine({ sha256: "abc123" })), /files-sha256/);
});

test("parseSnapshots rejects a snapshot line without a branch", () => {
  const line = snapshotLine().replace("branch=feat/x ", "");

  assert.throws(() => parseSnapshots(line), /branch/);
});

test("checkSnapshot reports missing when the description has no record", () => {
  assert.equal(checkSnapshot({ text: "no record", branch: "feat/x" }).status, CHECK_STATUS.MISSING);
});

test("checkSnapshot reports ambiguous for two different snapshot lines", () => {
  const text = `${snapshotLine({ sha256: "a".repeat(64) })}\n${snapshotLine({ sha256: "b".repeat(64) })}`;

  assert.equal(checkSnapshot({ text, branch: "feat/x" }).status, CHECK_STATUS.AMBIGUOUS);
});

test("checkSnapshot rejects a record copied from another branch's PR", () => {
  const text = snapshotLine({ branch: "feat/other" });

  assert.equal(checkSnapshot({ text, branch: "feat/x" }).status, CHECK_STATUS.OTHER_BRANCH);
});

test("checkSnapshot reports malformed, instead of throwing, for a quoted template line", () => {
  const text =
    "Format: <!-- pre-review-snapshot v1 base=<sha> branch=<name> reviewed-at=<iso8601> tier=<light|full> files=<count> files-sha256=<hex> -->";

  const result = checkSnapshot({ text, branch: "feat/x" });

  assert.equal(result.status, CHECK_STATUS.MALFORMED);
  assert.match(result.error, /files=<count>/);
});

test("checkSnapshot does not read a snapshot line across a carriage return", () => {
  // Markdown treats a lone CR as a line ending, so such a line must not reach
  // the malformed comment, where it could close the code fence.
  const text = "<!-- pre-review-snapshot v1 branch=feat/x\r~~~\r**injected** -->";

  assert.equal(checkSnapshot({ text, branch: "feat/x" }).status, CHECK_STATUS.MISSING);
});

test("checkSnapshot accepts a record taken on the PR's branch", () => {
  assert.equal(checkSnapshot({ text: snapshotLine(), branch: "feat/x" }).status, CHECK_STATUS.MATCH);
});

test("the pre-push hook warns about a branch with no record and still lets the push through", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "pre-push.mjs")], {
    cwd: repo.dir,
    input: `refs/heads/feat/x ${repo.git("rev-parse", "HEAD")} refs/heads/feat/x ${"0".repeat(40)}\n`,
    encoding: "utf8",
  });

  assert.equal(run.status, 0);
  assert.match(run.stderr, /no \/pre-review record for feat\/x/);
});

test("the pre-push hook is silent when the branch has a record", (t) => {
  const repo = scratchRepo(t);
  repo.write(".pre-review/feat__x.md", snapshotLine());

  const run = spawnSync("node", [path.join(SCRIPTS, "pre-push.mjs")], {
    cwd: repo.dir,
    input: `refs/heads/feat/x ${repo.git("rev-parse", "HEAD")} refs/heads/feat/x ${"0".repeat(40)}\n`,
    encoding: "utf8",
  });

  assert.equal(run.status, 0);
  assert.equal(run.stderr, "");
});

test("the Claude hook denies gh pr create on a branch with no record", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr create --fill" } }),
    encoding: "utf8",
  });
  const output = JSON.parse(run.stdout);

  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(output.hookSpecificOutput.permissionDecisionReason, /feat\/x has no \/pre-review record/);
});

test("the Claude hook denies gh pr create chained after another command", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git push && gh pr create --fill" } }),
    encoding: "utf8",
  });
  const output = JSON.parse(run.stdout);

  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
});

test("the Claude hook leaves commands other than gh pr create alone", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr view 12" } }),
    encoding: "utf8",
  });

  assert.equal(run.status, 0);
  assert.equal(run.stdout, "");
});

test("the Claude hook allows a draft PR, which CI skips", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr create --draft --fill" } }),
    encoding: "utf8",
  });

  assert.equal(run.status, 0);
  assert.equal(run.stdout, "");
});

test("the Claude hook allows a draft whose flag follows a multi-line body", (t) => {
  const repo = scratchRepo(t);
  const command = "gh pr create --title t --body \"$(cat <<'EOF'\nWhat; why | how\nEOF\n)\" --draft";

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });

  assert.equal(run.status, 0);
  assert.equal(run.stdout, "");
});

test("the Claude hook allows a draft opened with --draft=true", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr create --draft=true --fill" } }),
    encoding: "utf8",
  });

  assert.equal(run.status, 0);
  assert.equal(run.stdout, "");
});

test("the Claude hook denies gh pr create run after a backgrounded command", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "sleep 1 & gh pr create --fill" } }),
    encoding: "utf8",
  });
  const output = JSON.parse(run.stdout);

  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
});

test("the Claude hook allows gh pr create when the branch has a record", (t) => {
  const repo = scratchRepo(t);
  repo.write(".pre-review/feat__x.md", snapshotLine());

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr create --fill" } }),
    encoding: "utf8",
  });

  assert.equal(run.status, 0);
  assert.equal(run.stdout, "");
});
