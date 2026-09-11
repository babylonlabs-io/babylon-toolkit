# Pre-review

`/pre-review` runs an AI review of a change on the author's machine before
the PR is opened. It shows findings in the session with a recommended
decision for each, fixes the ones the author chooses, re-checks only what
changed on the next run, and keeps `PR.md` (the PR description) current. The
human reviewer then starts from code that already passed an AI review, plus a
record of what that review found and what happened to each finding.

CI-side bot review (Greptile) is unaffected. `/pre-review` covers the stage
before any PR exists.

## Requirements

- Claude Code, started in this repository, ideally the same session that
  implemented the change: it already knows what the change is for.
- Node 24 and a working `pnpm install`. The review runs
  `pnpm nx affected -t lint,test` on the changed files.

## Workflow

1. Implement the change.
2. Run `/pre-review`. The findings appear in the session, each with a
   recommendation: **fix now**, **follow-up** (a later PR), or **decline**
   (with a reason).
3. Accept the recommendations or change any of them (for example "7
   follow-up, 12 decline: duplicate of the VP check").
4. Fix the fix-now items: the session offers to do it, or fix them by hand.
5. Run `/pre-review` again. It re-checks only what changed since the last run
   and reports what is fixed, what remains, and anything new the fixes
   introduced. Repeat steps 3–5 until nothing is left to fix.
6. Commit, push, and open the PR with `PR.md` as the body.

`PR.md` is written on the first run and updated on every run after it. The
session asks up to two questions on the first run when it cannot tell what
the change is for. Edits made to `PR.md` by hand are kept wherever they are
still true. Decisions are recorded before any fix starts, so an interrupted
fix loses nothing.

> ⚠️ **Important**: Some packages' `lint` script runs `eslint --fix`, so the
> background checks can rewrite source files, including files outside the
> change, while the review runs. The session names every rewritten file;
> check those before committing, or the PR ships code no one reviewed.

## Tiers

The size and location of the change decide how many reviewers run.

| Tier  | When                                                                             | Reviewers                                            |
| ----- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| light | No CLAUDE.md critical-path file, changed lines within the threshold, no `--full` | `review-generalist`                                  |
| full  | Anything else                                                                    | `review-generalist`, `review-tracer`, `review-panel` |

The threshold is `LIGHT_REVIEW_MAX_CHANGED_LINES` in
`.claude/skills/pre-review/SKILL.md`, a starting value to be tuned from pilot
data. Changed lines exclude `pnpm-lock.yaml` and the generated
`packages/babylon-ts-sdk/docs/api/`.

Later runs judge the earlier findings with one reviewer. They escalate to the
full set when the new changes touch a critical path or exceed the threshold,
when the whole change has grown past the threshold without a full review, or
when `--full` is passed.

| Reviewer            | Method                                                        |
| ------------------- | ------------------------------------------------------------- |
| `review-generalist` | Built-in `/code-review` at high effort, plus repo conventions |
| `review-tracer`     | One deep pass tracing the live call path end to end           |
| `review-panel`      | Up to four focused lanes, each finding re-verified            |

All reviewers are defined in `.claude/agents/` without the Edit and Write
tools, and their instructions forbid touching the working tree or the index.
That is not a sandbox: each reviewer keeps Bash, and `review-panel` can
spawn subagents, so what actually stops a stray write is the author's
permission rules. Review commands that a local allowlist approves (for
example `git stash`) would run without a prompt.

## Files

Three files hold the review, all git-ignored and local to the author.
`<key>` is the branch name with `/` replaced by `__`. The reviewed file
contents themselves are stored as unreferenced git objects, which git prunes
after about two weeks; a later run then reviews those files whole again.

| File                     | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `PR.md`                  | Working copy of the current branch's description, for opening the PR     |
| `.pre-review/<key>.md`   | The branch's description, ending with a collapsed record of the findings |
| `.pre-review/<key>.json` | State between runs: reviewed file contents and findings with decisions   |

`PR.md` is shared by every branch, so the session checks which branch it
belongs to before using or replacing it; each branch's own copy lives in
`.pre-review/`. The state file is not meant to be edited: decisions are made
in the session. Formats are in `.claude/skills/pre-review/formats.md`.

## Reading the pre-review record

The end of `PR.md`, and so of the PR body, carries a collapsed section:

| Outcome                  | Meaning for the reviewer                                      |
| ------------------------ | ------------------------------------------------------------- |
| **open — merge-blocker** | Found, not fixed, no decision to defer or decline. Raise it.  |
| open                     | Found, not fixed yet: either to be fixed, or not yet decided. |
| fixed                    | Re-checked against the code on a later run.                   |
| follow-up: …             | Deferred to a later PR; also listed under "Not in this PR".   |
| declined: …              | The author judged it not worth fixing; the reason is theirs.  |
| moot                     | None of the finding's files is part of the change any more.   |

> **Note**: The record is self-reported: it shows what the author's review
> found and decided, not a gate CI enforces.

## Cost

A light review is one reviewer; a full review is three reviewers and up to
four lanes. A later run is usually one reviewer. The state file records
tokens, tool calls and duration for every reviewer on every run.

## Changing the tooling

The skill (`.claude/skills/pre-review/`) and the reviewers
(`.claude/agents/review-*.md`) are ordinary repository files: change them
through a PR. A personal skill with the same name in `~/.claude/skills/`
takes precedence over the project one, so do not keep a private copy named
`pre-review`.

> **Note**: A CI check that recomputes the `files-sha256` digest in the
> record's hidden snapshot line from the PR head is planned after the pilot
> and is not implemented yet.
