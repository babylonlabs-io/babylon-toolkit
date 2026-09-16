/**
 * Claude Code PreToolUse hook: stops Claude from running `gh pr create` on a
 * branch where `/pre-review` has not run.
 *
 * Opt-in, from each engineer's own settings (see docs/pre-review.md): the
 * repository's `.claude/settings.json` is git-ignored. It only covers PRs
 * Claude opens; the `pre-review-check` CI job covers every PR.
 *
 * It reads the command it is asked about, so a settings entry without the
 * `if` filter still leaves every other Bash call alone. A draft PR is allowed,
 * as CI skips drafts until they are ready for review.
 *
 * `/pre-review` is user-invoked (`disable-model-invocation`), so the reason
 * tells Claude to hand the step back to the engineer rather than run it.
 */

import fs from "node:fs";
import process from "node:process";

import {
  CHECK_STATUS,
  checkBranchRecord,
  currentBranch,
  repositoryRoot,
} from "./snapshot.mjs";

/** Shell operators and line breaks that can start a new command. */
const COMMAND_SEPARATOR_PATTERN = /&&|\|\||[;|&\n]/;
const PR_CREATE_PATTERN = /^gh\s+pr\s+create(\s|$)/;
/** `gh pr create` flags that open a draft. */
const DRAFT_FLAGS = new Set(["--draft", "-d", "--draft=true"]);

/**
 * Whether a Bash command opens a non-draft PR. Best effort, not a shell
 * parser: the draft flag is looked for anywhere after `gh pr create`, so it is
 * still found after a multi-line `--body`, and a flag quoted inside a title
 * reads as a draft. CI is the enforcement; this only saves a round trip.
 */
function opensReadyPullRequest(command) {
  const segments = command.split(COMMAND_SEPARATOR_PATTERN);
  const createIndex = segments.findIndex((segment) => PR_CREATE_PATTERN.test(segment.trim()));
  if (createIndex === -1) return false;
  const tokens = segments.slice(createIndex).join(" ").split(/\s+/);
  return !tokens.some((token) => DRAFT_FLAGS.has(token));
}

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
  if (status === CHECK_STATUS.MALFORMED) {
    return `The /pre-review record for ${branch} has an unreadable snapshot line. ${next}`;
  }
  return null;
}

function main() {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const command = input.tool_input?.command;
  if (typeof command !== "string" || !opensReadyPullRequest(command)) return;

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
