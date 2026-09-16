/**
 * Claude Code PreToolUse hook: stops Claude from running `gh pr create` on a
 * branch where `/pre-review` has not run.
 *
 * Opt-in, from each engineer's own settings (see docs/pre-review.md): the
 * repository's `.claude/settings.json` is git-ignored. It only covers PRs
 * Claude opens; the `pre-review-check` CI job covers every PR.
 *
 * `/pre-review` is user-invoked (`disable-model-invocation`), so the reason
 * tells Claude to hand the step back to the engineer rather than run it.
 */

import process from "node:process";

import {
  CHECK_STATUS,
  checkBranchRecord,
  currentBranch,
  repositoryRoot,
} from "./snapshot.mjs";

function reasonFor(branch, status) {
  const next =
    "Ask the engineer to run /pre-review (it is user-invoked, do not try to run it), then open the PR with PR.md as the body. A trivial PR can instead be opened by hand with the skip-pre-review label.";
  if (status === CHECK_STATUS.MISSING) {
    return `${branch} has no /pre-review record, so the PR's pre-review-check would fail. ${next}`;
  }
  if (status === CHECK_STATUS.OTHER_BRANCH) {
    return `The /pre-review record stored for ${branch} names another branch, so the PR's pre-review-check would fail. ${next}`;
  }
  if (status === CHECK_STATUS.AMBIGUOUS) {
    return `The /pre-review record for ${branch} has more than one snapshot line. ${next}`;
  }
  return null;
}

function main() {
  const cwd = repositoryRoot(process.cwd());
  const branch = currentBranch(cwd);
  if (branch === "") return;

  const reason = reasonFor(branch, checkBranchRecord({ branch, cwd }).status);
  if (reason === null) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
}

try {
  main();
} catch (error) {
  // A broken check must not wedge the session; CI still enforces.
  const [firstLine] = String(error.message).split("\n");
  process.stderr.write(`pre-review: PR check skipped (${firstLine})\n`);
}
