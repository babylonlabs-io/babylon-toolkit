/**
 * Git pre-push hook (`.husky/pre-push`): warns when a pushed branch has no
 * `/pre-review` record.
 *
 * It never blocks. Work-in-progress pushes are normal, and a local hook is
 * skipped by `--no-verify` anyway: the enforcement is the `pre-review-check`
 * CI job. This only saves a round trip to a red check.
 *
 * Git passes one line per pushed ref on stdin:
 *   <local ref> SP <local sha> SP <remote ref> SP <remote sha>
 */

import fs from "node:fs";
import process from "node:process";

import { CHECK_STATUS, checkBranchRecord, repositoryRoot } from "./snapshot.mjs";

const BRANCH_REF_PREFIX = "refs/heads/";
/** The branch PRs target; pushing it needs no record. */
const BASE_BRANCH = "main";
/** Git's local sha for a ref being deleted on the remote. */
const DELETED_REF_PATTERN = /^0+$/;

function warningFor(branch, status) {
  if (status === CHECK_STATUS.MISSING) {
    return `pre-review: no /pre-review record for ${branch}. The PR's pre-review-check will fail until you run /pre-review and use PR.md as the body.`;
  }
  if (status === CHECK_STATUS.OTHER_BRANCH) {
    return `pre-review: the record stored for ${branch} names another branch. Run /pre-review on ${branch}.`;
  }
  if (status === CHECK_STATUS.AMBIGUOUS) {
    return `pre-review: the record for ${branch} has more than one snapshot line. Run /pre-review again to rewrite it.`;
  }
  if (status === CHECK_STATUS.MALFORMED) {
    return `pre-review: the record for ${branch} has an unreadable snapshot line. Run /pre-review again to rewrite it.`;
  }
  return null;
}

function main() {
  const cwd = repositoryRoot(process.cwd());
  const lines = fs.readFileSync(0, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    const [localRef, localSha] = line.split(" ");
    if (!localRef.startsWith(BRANCH_REF_PREFIX) || DELETED_REF_PATTERN.test(localSha)) continue;
    const branch = localRef.slice(BRANCH_REF_PREFIX.length);
    if (branch === BASE_BRANCH) continue;

    const warning = warningFor(branch, checkBranchRecord({ branch, cwd }).status);
    if (warning !== null) process.stderr.write(`${warning}\n`);
  }
}

try {
  main();
} catch (error) {
  // Never block a push over the nudge itself; say why it did not run.
  const [firstLine] = String(error.message).split("\n");
  process.stderr.write(`pre-review: push check skipped (${firstLine})\n`);
}
