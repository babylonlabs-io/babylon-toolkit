---
name: pre-review
description: AI review of the current branch's change (commits, staged, unstaged and untracked files) before a PR exists. Presents findings with a recommendation for each, records the author's decisions, re-checks only the diff on later runs, and keeps PR.md up to date.
argument-hint: '[--full] [scope hint]'
disable-model-invocation: true
allowed-tools:
  - Bash(git fetch *)
  - Bash(git merge-base *)
  - Bash(git diff *)
  - Bash(git ls-files *)
  - Bash(git hash-object *)
  - Bash(git cat-file -e *)
  - Bash(git branch --show-current)
  - Bash(git status *)
  - Bash(shasum -a 256 *)
  - Bash(pnpm nx affected *)
---

Arguments: `$ARGUMENTS`

- `--full` → force the full reviewer set over the whole change, even when the
  change qualifies for the light tier or nothing changed since the last run.
- Anything else is a scope hint for the reviewers.

`/pre-review` is one command run in a loop by the engineer who wrote the
change, usually in the same session that implemented it:

1. **Review.** Independent reviewers look at the change. Findings are shown in
   chat, each with a recommendation: fix now, follow-up PR, or decline.
2. **Decide.** The engineer confirms or changes each decision.
3. **Fix.** On request, this session implements the fix-now items.
4. **Run again.** Only what changed since the last run is re-checked. Chat
   reports what is fixed, what remains, and anything new.
5. **Ship.** Every run leaves `PR.md` current: the PR description plus a
   collapsed record of what the review found and what happened to it.

Nothing is posted, committed or staged. Source files change only in step 3,
when the engineer says so.

**Files.** All git-ignored, all at the repo root, never edited by hand except
`PR.md`:

- `.pre-review/<key>.json`: the state (reviewed file contents as git blob ids,
  findings with status and decision). `<key>` is the branch name with `/`
  replaced by `__`.
- `.pre-review/<key>.md`: this branch's PR description, the source of truth.
- `PR.md`: a working copy of the current branch's description, for opening
  the PR. Every branch shares it, so it is reconciled before use (step 6).

Keep them out of `.claude/`: Claude Code treats that directory as protected
and prompts on every write there. Formats (state schema, description layout,
snapshot line) are in [formats.md](formats.md).

**Work directory** ("WORK" below): the session scratchpad when Claude Code
lists one in the system prompt, otherwise `.pre-review/work/`. Name every file
there after this run's number, `run<N>__…`, where N is the number of stored
runs plus one: the scratchpad is shared by every run in a session, and a
file left by an earlier run must never pass for this run's output.

**Commands.** Run everything from the repo root. One plain command per Bash
call: no shell variables, loops, heredocs, `&&`, `;` or pipes. Such a command
matches no permission rule and prompts the engineer every time. Paths are
repo-relative in git and nx arguments and in everything recorded (nx rejects
absolute `--files` paths, and the snapshot digest is defined over relative
ones); only Read/Write tool paths and redirect targets are absolute. A
redirect (`> file`) is checked as a file edit, not by the Bash rule, so
redirect only into the scratchpad. Without a scratchpad, take the command's
output and write it with the Write tool, which also creates the directory.

**Questions.** Ask the engineer only with `AskUserQuestion`, never in plain
chat mid-run: a typed reply ends the turn that holds this skill's pre-approved
commands, and every command after it prompts.

## Phase 0: prep once, before spawning anything

Everything here is a fact every reviewer would otherwise rediscover
separately, at full price each. Do it yourself.

1. `git fetch --quiet origin main`, for a base you can trust. If it fails,
   proceed against the local `origin/main` and say so. **Never
   `git diff main...HEAD`**: the local `main` ref is routinely months stale.
2. `git merge-base HEAD origin/main` → the **base SHA**, and
   `git branch --show-current` → the branch. An empty branch name means a
   detached HEAD: stop and ask the engineer to check out a branch.
3. The **changed-file list**, the authoritative review set:
   - `git diff --name-status --no-renames <base>`: branch commits, staged and
     unstaged, with a rename shown as a delete plus an add.
   - `git ls-files --others --exclude-standard`: untracked new files.
   - Exclude `PR.md` and anything under `.pre-review/`.
   - Keep `git status --porcelain` as it is now, to compare after the checks.
4. `git diff <base> > WORK/run<N>__local.diff`. Untracked files produce no
   hunks in it: list them in the pack under `NEW FILE (untracked): <path>` and
   tell reviewers to `Read` them whole.
5. **Load the state** from `.pre-review/<key>.json`.
   - Missing → **first run**.
   - Its `branch` differs from the current branch (two names that map to one
     key) → ask before touching it.
   - Its `base` is not an ancestor of the current base
     (`git merge-base --is-ancestor <state base> <current base>`) → ask
     before replacing it with a first run. A replaced state's
     `.pre-review/<key>.md` belongs to the old change: ask before reusing it.
   - Otherwise → **later run** (Phase 0b).
6. **Reconcile `PR.md`**, then take the **intent**. Read the snapshot line of
   `PR.md` (see [formats.md](formats.md)):
   - **No snapshot line** (hand-written, or older than this skill): ask
     whether it is this branch's description before using or replacing it.
   - **Names another branch**: compare it with that branch's
     `.pre-review/<other key>.md`. Missing, or different (the engineer edited
     `PR.md` on that branch), → save `PR.md` there first. Then it may be
     replaced.
   - **Names this branch**: if `.pre-review/<key>.md` is missing, save
     `PR.md` as it. If it differs, the engineer edited `PR.md`: take those
     edits into `.pre-review/<key>.md`.

   The intent (what the change is for, what is deliberately out of scope)
   then comes from `.pre-review/<key>.md` when it exists, including on later
   runs, so edits reach the reviewers. Otherwise from what the engineer asked
   this session to build, otherwise ask at most two questions (the goal, and
   what is deliberately left out). Paste it into the pack. Tell reviewers
   plainly: _a finding that re-litigates a decision the intent already
   justifies is worth less than no finding._

7. The binding rules: the nearest `SECURITY_MODEL.md` at or above the changed
   files (else the repo `SECURITY.md`), and which `CLAUDE.md` sections apply.
   **Name the critical paths by section number** for every changed file that
   matches a file or directory under CLAUDE.md > CRITICAL PATHS (a directory
   matches by prefix). Read each whole section, not only its file list: a
   section's rule text can bring more files under it (§7, for example, places
   the vendor-vector generator scripts next to its `src/` directory). Match
   against CLAUDE.md itself; never copy the list anywhere else.
8. **Pick the tier.** `LIGHT_REVIEW_MAX_CHANGED_LINES = 150`, a starting value
   to be tuned from pilot data. Count changed lines as added + deleted from
   `git diff --numstat <base>`, plus the line count of each untracked file,
   excluding `pnpm-lock.yaml` and `packages/babylon-ts-sdk/docs/api/`.
   - **light**: no critical-path file, changed lines ≤
     `LIGHT_REVIEW_MAX_CHANGED_LINES`, no `--full`. One reviewer:
     `review-generalist`.
   - **full**: everything else. `review-generalist`, `review-tracer`,
     `review-panel`.

9. **Lint, then snapshot the content.** Some packages' `lint` runs
   `eslint --fix`, which rewrites files. So lint runs first, in the
   foreground, before anything is snapshotted or reviewed:

   ```
   pnpm nx affected -t lint --files=<comma-separated changed files> --skip-nx-cache
   ```

   Then compare `git status --porcelain` with step 3's copy. Every file lint
   modified was **rewritten by the checks**: tell the engineer, record it in
   the run's `rewritten_by_checks`, and redo steps 3–4 so the review set and
   `run<N>__local.diff` include the rewritten content. The review then covers
   exactly what the snapshot records.

   Snapshot: one `git hash-object -w <path>` per file that exists. `-w` stores
   the content in git's object database, so a later run can diff against
   exactly what was reviewed, whether or not it was ever committed. A deleted
   file has no content, and `git hash-object` exits 128 on it, aborting the
   rest of that call: record it as `deleted`. This snapshot is what the state
   records. Never re-hash after fixes: that would make the fixes look already
   reviewed.

10. **Tests**, in the background, after the snapshot:

    ```
    pnpm nx affected -t test --files=<comma-separated changed files> --skip-nx-cache
    ```

    For both nx runs, `--skip-nx-cache` is not optional: a cached replay
    prints success without executing anything. `No tasks were run` means no
    nx project is affected: **nothing affected**, never passed. Redirect each
    run's output to a WORK file and read nx's own exit status. The run's
    `checks` is `failed` if either run failed, `nothing affected` if neither
    ran a task, otherwise `passed`. A failure is not automatically a finding:
    stale `dist/` is the standing hazard in this repo (rebuild `core-ui` and
    `ts-sdk` before vault), so characterise it first. Tests should not write
    source files; if `git status --porcelain` shows one changed when they
    finish, report it as rewritten by the checks.

Collect steps 1–9 into a short **context pack** and paste it verbatim into
every reviewer prompt. Open it with:

> **LOCAL REVIEW: there is no PR.** Do not run any `gh` command. Do not
> `git diff main...HEAD`. The file list and diff below are authoritative.

On a later run, the pack also carries every stored finding as one line (id,
status, claim) and the `refuted` list. Reviewers report a known defect by its
id (a regression of a fixed finding as "regressed #N"), never as new, and
drop a refuted claim unless they have new evidence.

## Phase 0b: later runs, checking only what changed

Compare the step-9 snapshot with the state's `files` map:

- **unchanged**: same blob, or still deleted.
- **moved**: both sides are blobs, and they differ. For each moved file,
  `git cat-file -e <state blob>` first. If git has pruned it (unreferenced
  objects expire after about two weeks), treat the file as entered. Otherwise
  `git diff <state blob> <current blob> > WORK/run<N>__d<k>.diff`, numbering
  the moved files k = 1, 2, … (a name derived from the path could collide:
  `a/b.ts` and `a__b.ts`). Count its lines with
  `git diff --numstat <state blob> <current blob>`. Put a table of each diff
  file and its path in the pack.
- **entered**: in the change now and not in the state, or changed between
  `deleted` and content, or its stored blob was pruned. Reviewed whole; a
  file deleted since the last run is judged from `run<N>__local.diff`. Its
  lines count as its numstat against the base (tracked) or its length
  (untracked).
- **left**: in the state, no longer in the change.

If the base moved since the last run (a rebase onto a newer `origin/main`),
list the files upstream changed: `git diff --name-only <state base> <current base>`.
A moved file on that list goes to **entered** instead: its blob-to-blob diff
would present upstream work as the author's. It is reviewed through its diff
against the current base, `git diff <current base> -- <path>`, which holds
only the branch's own change, and counted by that diff's numstat. Say in the
pack that the base moved.

If nothing overlaps (every stored file left and every current file entered),
this is probably a different change under a reused branch name: ask before
continuing.

**Nothing moved, entered or left, and no `--full`**: spawn no reviewers. Wait
for the checks, then go to Phase 4 with the stored findings (the engineer may
have new decisions to record). With `--full`, run Phases 1–3 over the whole
change.

**Anything else**: first mark `moot` every finding whose anchor files have
all left the change. That needs only the buckets, not a reviewer, and a
finding with no file left in the change must not stay open. If files only
left, stop there: wait for the checks and go to Phase 4. Otherwise run a
**verdict pass** and a **new-defect pass**.

The verdict pass is one `review-lane`. Give it every finding that is not
`moot` and has an anchor file that moved or entered, **including `fixed`
ones**, so a regression is caught; each with its full `detail`, plus the
buckets, the per-file diffs and the pack. Ask for one line per finding and no
word limit. It owes a verdict for each, none skipped (give it the count): judge
the current code and return `fixed` (cite the line), `partially fixed` (say
what remains), `open`, or regressed (a `fixed` finding that is wrong again),
with the current anchors. A finding whose anchor files are all unchanged, or
only unchanged and left, keeps its stored status and is not sent.

The new-defect pass depends on escalation. **Escalate** when any of these
holds:

- a moved or entered file is on a critical path (step 7);
- the numstat lines of the moved files plus the entered files exceed
  `LIGHT_REVIEW_MAX_CHANGED_LINES`;
- the step-8 total exceeds it and no earlier run's tier was `full`;
- `--full` was passed.

- **Escalated on size since the last run, or on a critical path**: run
  Phases 1–3 with the full tier's reviewers, the review set narrowed to the
  moved and entered files, the per-file diffs plus the entered files as the
  diff.
- **Escalated on the total, or `--full`**: run Phases 1–3 over the whole
  change: those files have never had the full set.
- **Not escalated**: the verdict lane also reviews the per-file diffs and the
  entered files for new defects, giving each a severity (merge-blocker or
  normal) and a confidence. Those defects then go through Phase 3 like any
  other.

Verify every `fixed` and every regression yourself against the current code
before recording it: a wrong `fixed` retires a live finding. "The line
changed" is not "the defect is gone". Where a test can settle it, run that one
test (Phase 3 step 4).

## Phase 1: independent reviews, in parallel

Spawn the tier's reviewers with the `Agent` tool, `subagent_type` set to the
agent name, all in **one message**. Each prompt carries the context pack and
the scope hint. The agent definitions carry the method and the constraints:
do not restate them, and do not split the reviewers into non-overlapping
lenses. Overlapping judgment is where divergent findings come from.

## Phase 2: wait

Do not review the change yourself while they run.

By default an interactive session runs every subagent in the background, and
completion notifications reach this session: yours, and also those of the
agents your reviewers start (`review-panel`'s lanes). Treat a lane's
notification as part of `review-panel`'s review. The lanes' findings go
through Phase 3 like the panel's own, whether or not the panel ever sees
them.

A reviewer can stop and notify you while its children are still working
("still waiting on the lanes"). That is not its report:

- If the `ListAgents` tool is available, check it. A reviewer whose children
  are still running is waiting, not lost: wait for more notifications. When
  `ListAgents` is unavailable, count the children's notifications instead.
- Once every child has notified and the reviewer has still returned no
  findings of its own, resume it once and tell it to report.
- A child that never notifies is not coming back. Its dimension is
  **uncovered**: cover it yourself or say so in the chat summary.

When a reviewer sends several notifications, use the last one with findings.
Also wait for the checks (Phase 0 step 10) before Phase 4.

## Phase 3: dedup and verify

1. Merge the lists, lanes included. Collapse findings naming the same defect;
   keep the sharpest statement and the best evidence.
2. Compare with what is stored. A claim in `refuted` is dropped unless it
   brings new evidence. A defect that matches a `fixed` finding **reopens
   that finding** (status `open`, note "regressed") instead of taking a new
   id. A defect that matches an open finding is merged into it.
3. **Agreement is not evidence.** Two reviewers agreeing without checking the
   source is a correlated guess.
4. Verify yourself, against the code, every finding you keep and anything
   reviewers disagree on, and record how in `verified_by`. A single targeted
   test run may settle one; never a blanket suite run. There is no `vitest`
   at the repo root: `pnpm --filter <package name> exec vitest run <test file>`,
   except `@babylonlabs-io/ts-sdk`, which CLAUDE.md sends through its own
   `test` script (`pnpm --filter @babylonlabs-io/ts-sdk run test`).
5. Add disproved claims to `refuted`.

## Phase 4: present, decide, record

**Recommend a decision** for every finding that is open or partially fixed
after this run and is new, reopened, undecided, or changed status in this
run:

- **fix now**: it belongs in this PR. Say how, in one or two sentences.
- **follow-up**: real, but outside this PR's intent or too large for it. Say
  what the follow-up is.
- **decline**: not worth fixing. Give the reason in one line.

A merge-blocker is recommended **fix now** unless the intent puts it out of
scope. Every other finding keeps its stored decision, and is shown with it.

**Show it in chat**, compact, most severe first. Put the verdict line first:
findings, open merge-blockers, and the checks result in the header's words
(`passed`, `failed`, `nothing affected`, …). Never say "passed" when nothing
executed.

- **First run**: each finding as `<id> — <claim>. <path>:<line>`, then one or
  two sentences on why, then severity, confidence and the recommendation.
- **Later run**: the changes since the last run first, then what is new:
  - `Fixed: 3, 5 (verified at …)`
  - `Still open: 7 (partially: …)`
  - `Regressed: 4`
  - `Moot: 9`
  - `New: 12 — …`, with a recommendation
  - `Unchanged: 8, with its decision`

**Ask for decisions** with `AskUserQuestion`: accept the recommendations, or
change some (the engineer names them, e.g. "7 follow-up, 12 decline:
duplicate of the VP check"). Accepting never changes a stored decision that
was not re-recommended in this run. A finding stays `undecided` only if the
engineer defers the choice.

**Record before fixing.** Write the state ([formats.md](formats.md)): the
step-9 snapshot as `files`, the intent from step 6, this run's entry (`tier`
is the reviewer set that actually ran), and every finding's status, anchors,
`verified_by`, decision and `raised_in_run`. Then update the description
(Phase 5). Both happen before any fix, so an interrupted fix loses nothing.

**Offer to fix**: if any finding is **fix now**, ask whether to implement those
now. On yes, implement them in this session, then tell the engineer to run
`/pre-review` again to verify. On no, leave the code alone.

## Phase 5: keep the description current

`PR.md` was reconciled in step 6. Write `.pre-review/<key>.md`, then copy it
to `PR.md`. **Update, do not regenerate**: keep the engineer's wording
wherever it is still true, fix only claims the change no longer supports, and
say in chat what changed. Two parts are regenerated from the state on every
run: the follow-up entries in "Not in this PR" (only findings whose outcome
is a follow-up), and the collapsed Pre-review record at the end. Layout and
rules are in [formats.md](formats.md).

## Close

End with the verdict line and the next step:

- **Open fix-now items**: fix them (offered above), then run `/pre-review`
  again.
- **Undecided findings** (open or partially fixed with no decision): list
  them. They show as `open` in the record until the engineer decides.
- **Nothing open, or only follow-up and declined**: "`PR.md` is ready: commit,
  push, and open the PR with it as the body."
- **Uncovered dimensions, files the checks rewrote, or checks that failed**:
  say which, plainly.
