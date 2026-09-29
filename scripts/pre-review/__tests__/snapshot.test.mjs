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
  checkFinalReview,
  checkSnapshot,
  DELETED,
  digestBlobs,
  finalReviewInputKey,
  finalReviewStatus,
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
  // Stored, not only hashed: a later run diffs against this object and treats
  // a missing one as pruned, which would force a full re-review.
  assert.doesNotThrow(() => repo.git("cat-file", "-e", blobs.get("src/added.ts")));
});

test("parseSnapshots finds no record in a hand-written description", () => {
  assert.deepEqual(parseSnapshots("## What\n\nFixes the thing."), []);
});

test("parseSnapshots counts the same line pasted twice as one record", () => {
  const line = snapshotLine();

  assert.equal(parseSnapshots(`${line}\n\n${line}`).length, 1);
});

// Each error message ends with the offending line, so these assertions match
// the message's own text, which the input line cannot contain.
test("parseSnapshots rejects a snapshot line with a truncated digest", () => {
  assert.throws(
    () => parseSnapshots(snapshotLine({ sha256: "abc123" })),
    /no valid files-sha256=<hex>/,
  );
});

test("parseSnapshots rejects a snapshot line without a branch", () => {
  const line = snapshotLine().replace("branch=feat/x ", "");

  assert.throws(() => parseSnapshots(line), /no branch=<name>/);
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
  assert.match(result.error, /no valid files=<count>/);
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

test("the Claude hook allows a stacked PR into a branch other than main, which CI does not check", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr create --base feat/parent --fill" } }),
    encoding: "utf8",
  });

  assert.equal(run.status, 0);
  assert.equal(run.stdout, "");
});

test("the Claude hook denies gh pr create with an explicit --base main", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr create --base=main --fill" } }),
    encoding: "utf8",
  });
  const output = JSON.parse(run.stdout);

  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
});

test("the Claude hook denies gh pr create with a spaced, quoted -B main", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: 'gh pr create -B "main" --fill' } }),
    encoding: "utf8",
  });
  const output = JSON.parse(run.stdout);

  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
});

test("the Claude hook allows a PR into another repository", (t) => {
  const repo = scratchRepo(t);

  const run = spawnSync("node", [path.join(SCRIPTS, "claude-pr-create-hook.mjs")], {
    cwd: repo.dir,
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr create -R other/repo --fill" } }),
    encoding: "utf8",
  });

  assert.equal(run.status, 0);
  assert.equal(run.stdout, "");
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

function finalCandidate() {
  const inputs = {
    base: "1".repeat(40),
    branch: "feat/x",
    files: new Map([["changed.ts", "2".repeat(40)]]),
    outsideAnchors: new Map([["caller.ts", "3".repeat(40)]]),
    context: "Fix the caller. Apply the current rules and protocol revision.",
  };
  const inputKey = finalReviewInputKey(inputs);
  const run = {
    input_key: inputKey,
    kind: "first",
    tier: "light",
    breadth: "whole change",
    checks: "passed",
    uncovered: [],
    reviewers: [{ name: "review-generalist", completed: true }],
  };
  const state = {
    base: inputs.base,
    branch: inputs.branch,
    files: Object.fromEntries(inputs.files),
    outside_anchors: Object.fromEntries(inputs.outsideAnchors),
    findings: [],
    runs: [
      run,
      {
        ...run,
        kind: "final",
        cold: true,
        breadth: "whole change",
        reviewed: ["changed.ts"],
        reviewers: [{ name: "review-lane", completed: true }],
      },
    ],
    final_review: {
      input_key: inputKey,
      outside_anchors_sha256: digestBlobs(inputs.outsideAnchors),
      run: 2,
    },
  };
  return { ...inputs, inputKey, state };
}

test("final completion is reused only for identical code, base, branch and context", () => {
  const candidate = finalCandidate();
  assert.equal(finalReviewStatus(candidate).status, "complete");
  for (const change of [
    { base: "4".repeat(40) },
    { branch: "feat/other" },
    { files: new Map([["changed.ts", "5".repeat(40)]]) },
    { context: "Changed intent or binding rules." },
  ]) {
    const changed = { ...candidate, ...change };
    changed.inputKey = finalReviewInputKey(changed);
    assert.notEqual(changed.inputKey, candidate.inputKey);
    assert.equal(finalReviewStatus(changed).status, "blocked");
  }
});

test("an edited outside anchor blocks final completion without changing the key", () => {
  const candidate = finalCandidate();
  const edited = { ...candidate, outsideAnchors: new Map([["caller.ts", "6".repeat(40)]]) };
  assert.equal(finalReviewInputKey(edited), candidate.inputKey);
  assert.equal(finalReviewStatus(edited).status, "blocked");
});

test("a final reviewer's finding that adds an outside anchor keeps the key and the result", () => {
  const candidate = finalCandidate();
  candidate.state.outside_anchors["other-caller.ts"] = "7".repeat(40);
  candidate.outsideAnchors = new Map(Object.entries(candidate.state.outside_anchors));
  candidate.state.final_review.outside_anchors_sha256 = digestBlobs(candidate.outsideAnchors);
  assert.equal(finalReviewInputKey(candidate), candidate.inputKey);
  assert.equal(finalReviewStatus(candidate).status, "complete");
});

test("an outside anchor edited after final review stays stale after a rerun records it", () => {
  const candidate = finalCandidate();
  const edited = new Map([["caller.ts", "6".repeat(40)]]);
  candidate.state.outside_anchors = Object.fromEntries(edited);
  candidate.outsideAnchors = edited;
  candidate.state.runs.push({
    ...candidate.state.runs[0],
    kind: "later",
    breadth: "narrowed",
    reviewers: [{ name: "review-lane", completed: true }],
  });
  assert.equal(finalReviewInputKey(candidate), candidate.inputKey);
  assert.equal(finalReviewStatus(candidate).status, "pending");
});

test("legacy cold runs and incomplete final reviewers do not complete final review", () => {
  for (const change of [
    (state) => {
      delete state.final_review;
    },
    (state) => {
      state.final_review.run = 0;
    },
    (state) => {
      state.runs[1].kind = "later";
    },
    (state) => {
      state.runs[1].cold = false;
    },
    (state) => {
      delete state.runs[1].reviewers[0].completed;
    },
    (state) => {
      state.runs[1].reviewed = [];
    },
    (state) => {
      state.runs[1].input_key = "old";
      state.runs.push({ ...state.runs[0] });
    },
  ]) {
    const candidate = finalCandidate();
    change(candidate.state);
    assert.equal(finalReviewStatus(candidate).status, "pending");
  }
});

test("final review requires an initial review and current checks with complete coverage", () => {
  for (const change of [
    (state) => {
      state.runs[0].reviewers = [];
    },
    (state) => {
      delete state.runs[1].input_key;
    },
    (state) => {
      state.runs[1].checks = "failed";
    },
    (state) => {
      state.runs[1].checks = "aborted";
    },
    (state) => {
      state.runs[1].checks = "stubbed";
    },
    (state) => {
      state.runs[1].checks = "not run";
    },
    (state) => {
      state.runs[1].uncovered = ["typecheck-stub: vault"];
    },
  ]) {
    const candidate = finalCandidate();
    change(candidate.state);
    assert.equal(finalReviewStatus(candidate).status, "blocked");
  }
  const candidate = finalCandidate();
  candidate.state.runs[1].checks = "nothing affected";
  assert.equal(finalReviewStatus(candidate).status, "complete");
});

test("declining or deferring a blocker cannot complete final review", () => {
  for (const severity of ["merge-blocker", "normal"]) {
    for (const decision of ["fix now", "undecided", "follow-up", "decline"]) {
      for (const status of ["open", "partially fixed", "fixed", "moot"]) {
        const candidate = finalCandidate();
        candidate.state.findings = [{ id: 7, severity, decision, status }];
        const blocks =
          !["fixed", "moot"].includes(status) &&
          (severity === "merge-blocker" || ["fix now", "undecided"].includes(decision));
        assert.equal(finalReviewStatus(candidate).status, blocks ? "blocked" : "complete");
      }
    }
  }
});

test("the final CLI detects code edits after checks and does not restamp the saved run", (t) => {
  const repo = scratchRepo(t);
  const base = repo.git("rev-parse", "main");
  repo.write("kept.ts", "reviewed change\n");
  const state = {
    base,
    branch: "feat/x",
    findings: [],
    outside_anchors: {},
    files: Object.fromEntries(recordBlobs(changedPathsInWorktree(base, repo.dir), repo.dir)),
    runs: [
      {
        kind: "first",
        tier: "light",
        breadth: "whole change",
        checks: "passed",
        uncovered: [],
        reviewers: [{ name: "review-generalist", completed: true }],
      },
    ],
  };
  const context = "Fix the behavior. Current rules and protocol revision.";
  const initial = checkFinalReview({ base, state, context, cwd: repo.dir });
  assert.equal(initial.status, "blocked");
  state.runs[0].input_key = initial.input_key;
  assert.equal(checkFinalReview({ base, state, context, cwd: repo.dir }).status, "pending");
  state.runs.push({
    ...state.runs[0],
    kind: "final",
    cold: true,
    breadth: "whole change",
    reviewed: ["kept.ts"],
    reviewers: [{ name: "review-lane", completed: true }],
  });
  state.final_review = {
    input_key: initial.input_key,
    outside_anchors_sha256: initial.outside_anchors_sha256,
    run: 2,
  };
  repo.write(".pre-review/state.json", JSON.stringify(state));
  repo.write(".pre-review/context.txt", context);
  const args = [
    path.join(SCRIPTS, "snapshot.mjs"),
    "final",
    "--base",
    base,
    "--state-file",
    ".pre-review/state.json",
    "--context-file",
    ".pre-review/context.txt",
  ];
  const run = () =>
    JSON.parse(execFileSync(process.execPath, args, { cwd: repo.dir, encoding: "utf8" }));
  assert.equal(run().status, "complete");
  assert.equal(run().status, "complete");
  fs.rmSync(path.join(repo.dir, ".pre-review/state.json"));
  const missing = run();
  assert.equal(missing.status, "blocked");
  assert.equal(missing.input_key, initial.input_key);
  repo.write(".pre-review/state.json", JSON.stringify(state));
  repo.write("kept.ts", "rewritten while checks ran\n");
  const stale = run();
  assert.equal(stale.status, "blocked");
  assert.notEqual(stale.input_key, initial.input_key);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(repo.dir, ".pre-review/state.json"))).final_review
      .input_key,
    initial.input_key,
  );
});

test("a final reviewer cannot replace incomplete initial review coverage", () => {
  const candidate = finalCandidate();
  candidate.state.runs[0].reviewers[0].completed = false;
  candidate.state.runs[0].uncovered = ["correctness"];
  candidate.state.runs.splice(1, 0, {
    kind: "later",
    tier: "light",
    breadth: "none",
    reviewers: [],
    input_key: candidate.inputKey,
    checks: "passed",
    uncovered: [],
  });
  candidate.state.final_review.run = 3;
  const result = finalReviewStatus(candidate);
  assert.equal(result.status, "blocked");
  assert.match(result.reasons.join(" "), /Run \/pre-review --full/);

  const repair = candidate.state.runs[1];
  repair.tier = "full";
  repair.breadth = "whole change";
  repair.reviewers = ["review-generalist", "review-tracer", "review-panel"].map((name) => ({
    name,
    completed: true,
  }));
  assert.equal(finalReviewStatus(candidate).status, "complete");
  repair.reviewers.pop();
  assert.equal(finalReviewStatus(candidate).status, "blocked");
});

test("initial mechanical check failures can be repaired without repeating completed reviewers", () => {
  const candidate = finalCandidate();
  candidate.state.runs[0].checks = "failed";
  candidate.state.runs[0].uncovered = ["typecheck-stub: vault", "typecheck-unbuilt: sdk"];
  assert.equal(finalReviewStatus(candidate).status, "complete");
  candidate.state.runs[0].uncovered.push("correctness");
  assert.equal(finalReviewStatus(candidate).status, "blocked");
  candidate.state.runs[0].uncovered = [];
  delete candidate.state.runs[0].reviewers[0].completed;
  assert.equal(finalReviewStatus(candidate).status, "blocked");
});

test("a missing findings ledger cannot be treated as an empty review", () => {
  const candidate = finalCandidate();
  delete candidate.state.findings;
  const result = finalReviewStatus(candidate);
  assert.equal(result.status, "blocked");
  assert.equal(result.input_key, candidate.inputKey);
  assert.match(result.reasons.join(" "), /findings ledger is missing/);
});

test("later missing review coverage survives no-review runs until a whole-change full repair", () => {
  for (const makeIncomplete of [
    (run) => {
      run.reviewers[0].completed = false;
    },
    (run) => {
      delete run.reviewers[0].completed;
    },
    (run) => {
      run.reviewers.pop();
    },
    (run) => {
      run.uncovered = ["correctness"];
    },
    (run) => {
      run.reviewers = [];
    },
    (run) => {
      run.breadth = "none";
    },
    (run) => {
      run.tier = "light";
    },
  ]) {
    const candidate = finalCandidate();
    const fullReviewers = () =>
      ["review-generalist", "review-tracer", "review-panel"].map((name) => ({
        name,
        completed: true,
      }));
    const later = {
      kind: "later",
      tier: "full",
      breadth: "narrowed",
      reviewers: fullReviewers(),
      input_key: candidate.inputKey,
      checks: "passed",
      uncovered: [],
    };
    makeIncomplete(later);
    const repair = {
      kind: "later",
      tier: "light",
      breadth: "none",
      reviewers: [],
      input_key: candidate.inputKey,
      checks: "passed",
      uncovered: [],
    };
    candidate.state.runs.splice(1, 0, later, repair);
    candidate.state.final_review.run = 4;
    assert.equal(finalReviewStatus(candidate).status, "blocked");

    repair.tier = "full";
    repair.reviewers = fullReviewers();
    repair.breadth = "narrowed";
    assert.equal(finalReviewStatus(candidate).status, "blocked");
    repair.breadth = "whole change";
    assert.equal(finalReviewStatus(candidate).status, "complete");
  }
});

test("later mechanical check failures do not discard completed reviewer coverage", () => {
  const candidate = finalCandidate();
  candidate.state.runs.splice(
    1,
    0,
    {
      kind: "later",
      tier: "light",
      breadth: "narrowed",
      reviewers: [{ name: "review-lane", completed: true }],
      input_key: candidate.inputKey,
      checks: "failed",
      uncovered: ["typecheck-stub: vault"],
    },
    {
      kind: "later",
      tier: "light",
      breadth: "none",
      reviewers: [],
      input_key: candidate.inputKey,
      checks: "passed",
      uncovered: [],
    },
  );
  candidate.state.final_review.run = 4;
  assert.equal(finalReviewStatus(candidate).status, "complete");
});
