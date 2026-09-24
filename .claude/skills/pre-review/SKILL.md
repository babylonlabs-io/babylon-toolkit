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
  - Bash(git cat-file -e *)
  - Bash(git branch --show-current)
  - Bash(git status *)
  - Bash(node scripts/pre-review/snapshot.mjs record *)
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
   what is deliberately left out). Paste it into the pack — **verbatim, not
   condensed** — **excluding every part of it that states or restates a known
   open defect**: an entry in the "Not in this PR" list matching a stored
   finding whose `decision` is `follow-up` and whose status is neither
   `fixed` nor `moot` (the same condition Phase 5 regenerates that section
   with, so the two never disagree about one finding), and equally any
   sentence **anywhere in the description, that list included**, that
   presents an open finding's subject as settled design, whatever its
   decision. The second clause is not restricted to the other sections: a
   hand-written "Not in this PR" bullet describing an open *declined*
   blocker matches neither the first clause (wrong decision) nor a clause
   scoped to "elsewhere", and descriptions written by hand — carrying no
   `(pre-review N<id>)` markers — are the expected case, not the exception.

   Both extensions are load bearing, and both failed on this skill's own
   branch the first run that could exercise them. Keying only on
   `follow-up` left a **declined** merge-blocker stated in "What" as a
   deliberate design choice, so the intent waived a blocker the skill says it
   cannot. And summarising the intent instead of pasting it reintroduced a
   deferred blocker as "out of scope, settled" in the orchestrator's own
   words, one step after the exclusion had removed it — the filter cannot see
   a paraphrase. Say in the pack what was withheld and why (`withheld:
   #<id>`), so the omission is auditable and a reviewer who rediscovers the
   defect knows it is already on the ledger. A finding the engineer
   deferred is a known defect, not a settled decision, and folding it into the
   intent lets the process immunise its own backlog: that section is
   regenerated from the follow-up findings each run, so a defect deferred in
   one run comes back as settled scope in the next. Once it is fixed it is no
   longer a known defect, so it stops being stripped; without the status guard
   an engineer-written scope line matching it would keep being deleted from
   what reviewers see for the life of the branch.

   **Withhold what states a known open defect; keep everything else.** The
   test is the sentence's subject, not the section it sits in: an entry or
   sentence anywhere that presents an open finding's subject as settled is
   withheld, and an entry or sentence that does not — the engineer's own
   "what is deliberately left out", the second of the two questions this step
   asks — stays, wherever it sits. Both halves cost something when they go
   wrong: withholding too little leaves an open blocker standing as settled
   design, and withholding too much makes reviewers re-raise settled scope
   every run. Match against the stored findings, not against the
   `(pre-review N<id>)` marker: a description written or edited by hand
   carries no markers, including on its genuine follow-ups.

   Tell reviewers plainly: _the intent settles WHAT to build and WHAT is out
   of scope. It never settles whether the code does it safely. Re-proposing a
   rejected approach is worth less than no finding. Showing that a declared
   design produces a concrete failure — a wrong value, a thrown error, a
   blocked user action — is a finding like any other: name the intent sentence
   it contradicts and what the user loses._

7. The binding rules: the nearest `SECURITY_MODEL.md` at or above the changed
   files (else the repo `SECURITY.md`), and which `CLAUDE.md` sections apply.
   **Name the critical paths by section number** for every changed file that
   matches a file or directory under CLAUDE.md > CRITICAL PATHS (a directory
   matches by prefix). Read each whole section, not only its file list: a
   section's rule text can bring more files under it (§7, for example, places
   the vendor-vector generator scripts next to its `src/` directory). Match
   against CLAUDE.md itself; never copy the list anywhere else.

   Then the **blast radius**, in the same step: for each exported symbol the
   change modifies, the files that reference it. This is exactly the kind of
   fact this phase exists for — every reviewer would otherwise rediscover it
   separately, at full price, and most will not rediscover it at all, because
   a caller that the change does not touch never enters the review set. Use
   the Grep tool, not a Bash `grep`, which matches no permission rule and
   prompts the engineer mid-run.

   Cap it or it is unusable: `CALLER_LIST_MAX_FILES = 20` and
   `CALLER_LIST_MIN_NAME_LENGTH = 6`, both starting values to be tuned from
   pilot data. List a symbol's referencing files only when there are
   `CALLER_LIST_MAX_FILES` or fewer; skip names shorter than
   `CALLER_LIST_MIN_NAME_LENGTH`, or so common in this repo that the list
   says nothing (`COPY`, `Vault`, `Warning`, `calculate`). The cap is what
   makes it readable — a mid-size change can otherwise export well over a
   hundred names across a thousand references.

   **Record what the cap dropped.** A symbol over the cap is the widest-reach
   symbol in the change, which is exactly where a caller on a risk-reducing
   path lives; an entry silently missing reads as "nothing else calls this".
   Emit it as `<symbol> — N files, not listed` so a reviewer can see there is
   something there and go looking. Put the list, elisions included, in the
   pack under `CALLERS OF CHANGED EXPORTS`, and say plainly when a symbol was
   skipped for its name rather than its count.
8. **Pick the tier.** `LIGHT_REVIEW_MAX_CHANGED_LINES = 150`, a starting value
   to be tuned from pilot data. Count changed lines as added + deleted from
   `git diff --numstat <base>`, plus the line count of each untracked file,
   excluding `pnpm-lock.yaml` and `packages/babylon-ts-sdk/docs/api/`.
   - **light**: no critical-path file, changed lines ≤
     `LIGHT_REVIEW_MAX_CHANGED_LINES`, no `--full`. One reviewer:
     `review-generalist`.
   - **full**: everything else. `review-generalist`, `review-tracer`,
     `review-panel`.

9. **Lint and typecheck, then snapshot the content.** Some packages' `lint`
   runs `eslint --fix`, which rewrites files. So lint runs first, in the
   foreground, before anything is snapshotted or reviewed:

   ```
   pnpm nx affected -t lint --files=<comma-separated changed files> --skip-nx-cache
   ```

   Then typecheck, also foreground, before the snapshot:

   ```
   pnpm nx affected -t typecheck --files=<comma-separated changed files> --skip-nx-cache
   ```

   ESLint does not typecheck and vitest strips types, so a green lint and a
   green suite say nothing about whether the change compiles — a type error
   in a test file passes both and fails the build. It costs a few seconds and
   a change that does not compile is a fact the reviewers should be handed,
   not one they rediscover. If a project reports that its `typecheck` target
   is *disabled because one or more project references set `noEmit: true`*,
   that project is checking nothing: note those projects — step 10 decides the
   final `checks` value — and record each as `typecheck-stub: <project>` in
   the run's `uncovered`, because nx substitutes a stub that always succeeds
   and the names are otherwise lost with the session. Every project that nx
   infers a typecheck target for currently has a script overriding it, so
   this is the path a newly added package takes, not a live case to go
   hunting for.

   **Know what this check does not cover.** Every project with a `build`
   carries an explicit `typecheck` script — that build's type-checking pass,
   with `--noEmit` added where the build itself emits — and that is load
   bearing twice over. It overrides the stub nx infers for a `noEmit`
   project, and it keeps the project off nx's *inferred* target, which
   registers `@nx/js:typescript-sync`; a single inferred-target project in
   the affected set aborts the whole run with "The workspace is out of sync"
   and **zero tasks executed**, because the workspace tsconfigs' project
   references are incomplete relative to what that generator wants to write.
   (They are not absent — several projects do reference their dependencies —
   so do not go looking for a missing `references` array.) If a new package
   is added without a `typecheck` script, that is how it will fail.

   Two projects sit outside that pattern. `tools/release` has a `typecheck`
   (`tsc --noEmit -p tsconfig.json`) and no `build` at all, so there are more
   typecheck targets than build targets; it is in the lint set too.
   `tools/eslint-config` is plain JavaScript with no tsconfig, so nx never
   infers a typecheck target for it and there is no stub to override, but it
   does carry a lint target. The lint set is therefore exactly one larger
   than the typecheck set: a whole-workspace run reports 10 lint projects and
   9 typecheck projects. That offset is the baseline — read a discrepancy
   against it, not against equality.

   Cross-package types resolve through `node_modules` to each dependency's
   built `dist`, not through a path mapping, so this step checks each project
   against its dependencies' **last built** declarations:

   - It does catch what it was added for: a type error anywhere inside the
     project's own tsconfig, including in the test files that config
     includes, which lint and vitest both pass.
   - It does **not** reach what that config leaves out, and the config is per
     project: most run `tsconfig.lib.json`, `core-ui` runs that plus
     `tsconfig.node.json`, `tools/release` runs `tsconfig.json`. So
     `wallet-connector`'s `tests/` and most of vault's `e2e/` — including the
     real-wallet CLI CLAUDE.md calls load-bearing — are checked by nothing
     here. Do not tell reviewers "typecheck passed" about a change confined
     to those.
   - It does **not** catch a signature change in one package against its
     caller in another when the dependency's `dist` is stale. Stale `dist/`
     is the standing hazard in this repo; CI's full build is what closes
     that, not this step. Giving `typecheck` a `dependsOn: ["^build"]` in
     `nx.json` was tried and reverted: it works as an nx edge, but with
     `--skip-nx-cache` mandatory it re-runs every dependency build in the
     foreground on every invocation — including `babylon-proto-ts`'s
     `build-proto`, which `git clone`s a repository and regenerates 84
     tracked files before the snapshot is taken. It also schedules a
     project's `build` and `typecheck` concurrently over one
     `.tsbuildinfo`, since `^build` adds no edge to the project's own build.
   - A module-not-found on a workspace package **may** mean the dependency has
     never been built in this clone rather than that the change is broken —
     but it may equally mean the change imports a package this project does
     not declare, which is a real defect with the identical error text. Never
     assume the first: settle it before recording anything (step 10 says how).

   Then compare `git status --porcelain` with step 3's copy. Every file lint
   modified was **rewritten by the checks**: tell the engineer, record it in
   the run's `rewritten_by_checks`, and redo steps 3–4 so the review set and
   `run<N>__local.diff` include the rewritten content. The review then covers
   exactly what the snapshot records.

   Snapshot: `node scripts/pre-review/snapshot.mjs record <base>`. It hashes
   every file in the change (the step-3 set) with `git hash-object -w`, which
   stores the content in git's object database, so a later run can diff
   against exactly what was reviewed, whether or not it was ever committed. A
   deleted file is recorded as `deleted`. Copy its JSON output verbatim,
   never compute it another way: `files` is the state's `files` map, `count`
   is the snapshot line's `files=`, and `sha256` is its `files-sha256=`. This snapshot is what
   the state records. Never re-run it after fixes: that would make the fixes
   look already reviewed.

10. **Tests**, in the background, after the snapshot:

    ```
    pnpm nx affected -t test --files=<comma-separated changed files> --skip-nx-cache
    ```

    For every nx run, `--skip-nx-cache` is not optional: a cached replay
    prints success without executing anything. `No tasks were run` means no
    nx project is affected: **nothing affected**, never passed. Redirect each
    run's output to a WORK file and read nx's own exit status.

    First consider whether a target did not really run. A typecheck that
    failed **only** with a module-not-found on a workspace package is the one
    candidate — but it is **not** automatically discountable, because a real
    defect produces the identical error: a change that imports a package the
    project does not declare in its `package.json` fails exactly this way, and
    so does one importing a path a package does not export. Discounting
    blindly turns a change that does not compile into `checks: passed`, which
    is the false green this whole step exists to prevent.

    **Prove it before discounting.** For each unresolved specifier, check both:

    - the dependency is **declared** — the importing project's `package.json`
      lists that package (`dependencies`, `devDependencies` or
      `peerDependencies`); and
    - its build output is **absent** — the resolved `dist` (or whatever its
      `main`/`exports`/`types` point at) does not exist on disk.

    Only when a specifier is declared *and* unbuilt is the failure an artifact
    of this clone. Then drop that target from the set the value below is
    computed from, name it in `uncovered` as `typecheck-unbuilt: <project>`,
    and say so in the verdict line so nobody reads the run as fully checked.
    If any specifier is undeclared, or is declared and built, the typecheck
    **failed** — record it that way and hand the reviewers the error.

    Then, over the targets that remain, the run's `checks` is `failed` if any
    failed; `stubbed` if none failed but a project reported its typecheck
    target disabled for `noEmit` (the projects are in `uncovered`, recorded at
    step 9); `nothing affected` if none of them ran a task; `not run` if every
    target was discounted; otherwise `passed`. A discounted typecheck never
    turns a green lint and a green suite into `not run` — that value is for
    the run where nothing was checked at all. A failure is not automatically a
    finding, so characterise it first. Tests should not write source files; if
    `git status --porcelain` shows one changed when they finish, report it as
    rewritten by the checks.

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

**A finding with an anchor outside the change has no bucket for it, and this
skill does not yet route it.** The four buckets are defined over the
changed-file list, so an anchor on a file the branch never touched — a
caller, a fixture, a document — is in none of them. Two shapes follow, and
neither is rare, because reviewers are told to raise exactly these findings:

- **Every anchor outside.** Not sent for a verdict, and not mooted either,
  since it never left the change. It keeps its stored status.
- **Mixed: one anchor that left the change, one that was never in it.** The
  moot sweep asks whether the anchors have *all* left, and the answer is
  undefined for a file that was never there. Treat it as **not** all left, so
  the finding is not mooted.

In both shapes, judge it by hand or leave it at its stored status, and say
which in the chat summary rather than reporting it as verified. **Do not moot
either shape**: an untouched caller can still be wrong, and a finding that
stays visibly open costs a sentence, while one wrongly retired costs the
defect.

Also do not let the moot sweep take credit for a fix. When an author removes
the change that caused a finding, its anchors leave and the mechanical rule
says `moot` — but the defect is *gone*, which is `fixed`, and `moot` publishes
as "none of the finding's files is part of the change any more", telling a
reviewer nothing was checked. Record it as `fixed` with what you verified.

A version of this that hashed outside anchors into the state's `files` map
was tried and removed. `files` is bound to the step-9 snapshot, which the
script builds from changed paths only, so the entry was overwritten by the
same run that wrote it; and once stored, an outside anchor satisfies the
`left` definition exactly, so the moot sweep retired the finding silently —
turning "never closes" into "closes wrongly", which is worse. Routing these
properly still needs its own change: a separate map the snapshot digest does
not see, an explicit re-hash step, and an exclusion in the `left` definition.
The fourth prerequisite is already in place — all four reviewer contracts ask
for both ends of such a finding.

The verdict pass is one `review-lane`. Give it every finding that is not
`moot` and has an anchor file that moved or entered, **including `fixed`
ones**, so a regression is caught; each with its full `detail`, plus the
buckets, the per-file diffs and the pack. Ask for one line per finding and no
word limit. It owes a verdict for each, none skipped (give it the count):
judge the current code and return `fixed` (cite the line), `partially fixed`
(say what remains), `open`, or regressed (a `fixed` finding that is wrong
again), with the current anchors. A finding whose anchor files are all
unchanged, or only unchanged and left, keeps its stored status and is not
sent.

The new-defect pass depends on escalation. **Escalate** when any of these
holds:

- a moved or entered file is on a critical path (step 7);
- the numstat lines of the moved files plus the entered files exceed
  `LIGHT_REVIEW_MAX_CHANGED_LINES`;
- none of the last `WHOLE_CHANGE_REFRESH_RUNS` runs with a recorded `breadth`
  other than `none` covered the whole change, and there are at least that many
  such runs (the refresh rule, below, which defines that set exactly — a
  legacy run with no `breadth` does not count, however much it reviewed);
- the step-8 total exceeds `LIGHT_REVIEW_MAX_CHANGED_LINES` and no earlier run
  reviewed the whole change with the full tier (see the legacy default below);
- `--full` was passed.

`WHOLE_CHANGE_REFRESH_RUNS = 3`, a starting value to be tuned from pilot
data, like the other four tunable constants this skill declares:
`LIGHT_REVIEW_MAX_CHANGED_LINES` (step 8), `CALLER_LIST_MAX_FILES` and
`CALLER_LIST_MIN_NAME_LENGTH` (step 7), and `DOCUMENT_CHANGE_SHARE`
(Phase 3).

**The refresh rule, and what it actually costs.** A file that stops moving
stops being reviewed, while the change keeps evolving around it — so it is
judged against behaviour that has since changed, by no one. The only way to
catch that is to re-read everything periodically, and this rule says so
plainly rather than pretending to be cleverer:

> Walk `runs[]` backwards collecting **qualifying** runs — those with a
> `breadth`, skipping `breadth: none`, which spawned no reviewers, and legacy
> runs with no `breadth` recorded — until you have
> `WHOLE_CHANGE_REFRESH_RUNS` of them. Widen when none of those reviewed the
> whole change. **If fewer than `WHOLE_CHANGE_REFRESH_RUNS` qualifying runs
> exist, the rule does not fire at all.**
>
> A legacy run is skipped whatever it reviewed: the field that would say is
> not there. Never substitute "runs that reviewed something" for this set —
> that counts legacy runs, meets the floor on a state that has none of the
> data, and fires on every branch with history.

The window slides past non-qualifying runs rather than shrinking, and the
floor in the last sentence is what keeps it safe. Without it an empty
qualifying set satisfies "none of them reviewed the whole change" vacuously,
and every state whose runs are all skipped widens on its next invocation: a
version-1 state, where no entry records `breadth`, and equally a version-2
branch whose last three runs were `breadth: none` because the engineer re-ran
only to record decisions. Both are the misfire the legacy defaults below and
formats.md exist to prevent, arriving through the other trigger.

**It is a cadence, and that is the honest description.** A narrowed run
records only the moved and entered files in `reviewed`, so it can never
refresh a file that did not move — the two sets are disjoint by construction.
Any rule keyed on per-file read-recency therefore fires on a fixed schedule,
whatever it is called. Stating it as "no whole-change run in the last N" makes
the cost visible and computable: roughly one wide pass every
`WHOLE_CHANGE_REFRESH_RUNS + 1` runs on a branch that keeps being narrowed.
If that is too expensive for a given branch, raise the constant or pass the
wide run deliberately; do not expect it to disappear on its own.

**Reading a run entry written before the state reached version 2.** Neither
`breadth` nor `reviewed` exists on those. Both triggers read `breadth`, so
each needs a default or they misfire on every branch with history. (Neither
reads `reviewed`; see the note under Phase 4 for what that field is for.)

- For the **refresh rule**, a run without `breadth` did not record what it
  reviewed, so it cannot count as a whole-change run. It is skipped, exactly
  like a `none` run — and skipped runs do not fill the window, so a state made
  entirely of them never reaches the floor and never fires.
- For the **whole-change-total** trigger, a run without `breadth` whose `kind`
  is `first` **and** whose `tier` is `full` counts as a whole-change full run.
  A first run has no Phase 0b and always reviews everything, so the breadth is
  true by construction — but the tier is not: a first run under the line
  threshold records `tier: light` and one reviewer. Both halves must be read
  from the entry. Getting this wrong is a live hazard in both directions:
  asserting the breadth from nothing makes the trigger vacuously true on every
  legacy state and escalates all of them at once, while asserting the tier
  from `kind` alone silently disables the trigger forever on a branch whose
  first run was light — which is the case this trigger exists to catch.

The fourth trigger is the one the old `no earlier run's tier was full` bullet
was meant to be. Keyed on tier alone it could never fire after run 1, since
every escalated later run records `full`; keyed on whether a **whole-change
full** run has happened, it still catches the change that crosses the
threshold in small steps — where no per-run delta is ever large enough.

Then pick the breadth, **first match wins**:

- **`--full`, the refresh rule, or a total past the threshold with no
  whole-change full run yet**: record `breadth: whole change` and run
  Phases 1–3 over the whole change **with the full tier's reviewers**,
  whatever tier step 8 picked — a whole-change pass by one reviewer would
  record `tier: light`, which does not satisfy the fourth trigger's disable
  condition and so leaves it firing forever.
- **Escalated on size since the last run, or on a critical path**: record
  `breadth: narrowed` and run Phases 1–3 with the full tier's reviewers, the
  review set narrowed to the moved and entered files, the per-file diffs plus
  the entered files as the diff.
- **Not escalated**: record `breadth: narrowed`. The verdict lane also reviews
  the per-file diffs and the entered files for new defects, giving each a
  severity (merge-blocker or normal) and a confidence. Those defects then go
  through Phase 3 like any other.

Breadth is not the main defence and should not be treated as one. A narrowed
run can and does find cross-file defects; what loses them is grading a fix at
its anchor. The refresh rule exists for the file no run has opened in a long
time, not as a substitute for verifying a claim across what it names.

Verify every `fixed` and every regression yourself against the current code
before recording it: a wrong `fixed` retires a live finding. "The line
changed" is not "the defect is gone". Where a test can settle it, run that one
test (Phase 3 step 4).

**Never record a merge-blocker as `fixed` on the verdict lane's word alone.**
Re-derive it yourself from the data the finding is about — read the files, run
the one command, compute the case — and write in `status_note` what you
actually did, not what the lane reported. On a run that did not escalate the
lane is the only reviewer, so its verdict is the sole thing standing between a
live blocker and a closed one; and a lane that has just read the fix is
primed to find it convincing. Set `verified_by` to how you checked (`code`
when you read it, `test` when you ran something); the account of what you
checked goes in `status_note`, which is free text.

This is not hypothetical, in either direction. A verdict lane cleared a
blocker in this skill's own review as "reproduces the previous behaviour",
two other reviewers called it a defect, and running the old and new conditions
against the stored data showed the other two were right. A later run's lane
reported a declined blocker as `fixed` while three other reviewers reported it
open; re-running the experiment the decline rested on showed the experiment
had been invalidated by a different fix in the same PR, and the one-line
change it asked for now worked.

**Verify across what the finding says, not only where it points.** `anchors`
are the diff lines the finding was written against, so checking them is not
checking the claim. A fix is `fixed` only when every file path and symbol the
finding's own `detail` names has been re-read and confirmed — in the review
set or not. If the `detail` says a value, string, fixture or constant is
*shared*, name the sharing mechanism (the exported symbol, the constant, the
fixture identifier) and check its declaration site plus the files in the same
package that reference it. Record what you checked in `status_note`. A fix
applied only at the anchor is `partially fixed`, never `fixed`.

Bound it by the finding's own words. Never sweep a language construct or a
common word repo-wide: a finding about rounding does not oblige you to read
every `Math.round` in the repo, and one about an import path does not oblige
you to read every use of the constant. A finding that names another file is
the case this rule exists for — that is how a fix at one site leaves the
other wrong and still verifies clean.

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
6. **Rank, then cut.** Only a small fraction of findings are ever
   merge-blockers, and a real defect that arrives as one line inside a list of
   sixteen is as good as missed. Order by severity and keep the list short
   enough to act on. Two cuts, because volume is what buries severity:

   - **From run 3 onwards** (that is, once two runs are stored), a finding
     about prose that merely *describes* code or process — a comment, a
     JSDoc block, a README paragraph, a line in a document — does not take an
     id, unless it falls under the carve-out below. Collapse those into one
     unnumbered "docs nits" line with no decision and no verdict-pass slot.
     Every id enters the ledger permanently and is re-judged on every later
     run whose anchor moves, so a prose nit is not a one-off cost.

     The carve-out turns on what the prose *is*, not on where it lives, so a
     sentence in a `.md` file is not automatically exempt and a comment is
     not automatically cut. Prose that is itself the deliverable takes an id
     like any other finding: a
     user-facing string in `copy.ts` or `errorMessages.ts`, JSDoc on a
     critical-path or `@stability frozen` symbol, a specification, and any
     change where documents account for at least `DOCUMENT_CHANGE_SHARE = 0.5`
     of the **changed lines** — the step-8 count, not the file count, because
     a handful of one-line config edits otherwise outvotes the deliverable.
     A document here is `.md`, `.mdx`, `.txt`, or an instruction file under
     `.claude/`. When a document is the product, a wrong sentence in it is a
     defect, not a nit.
   - A finding that only restates a stored one is merged into it, never
     re-raised.

   None of this applies to a merge-blocker: severity is the thing being
   protected, so it is never cut.

   A third cut — suppressing findings about code the loop's own earlier fixes
   introduced — was tried and removed: nothing in the state records which
   lines a fix produced, so it could only be keyed on "everything that moved",
   which suppresses genuine new defects in fresh work. Re-propose it if the
   fix step ever records the paths it touched.

## Phase 4: present, decide, record

**Recommend a decision** for every finding that is open or partially fixed
after this run and is new, reopened, undecided, or changed status in this
run:

- **fix now**: it belongs in this PR. Say how, in one or two sentences.
- **follow-up**: real, but outside this PR's intent or too large for it. Say
  what the follow-up is.
- **decline**: not worth fixing. Give the reason in one line.

A merge-blocker is always recommended **fix now**. The intent can put work out
of scope; it cannot make a defect stop blocking. Every other finding keeps its
stored decision, and is shown with it.

The engineer may still defer one — it is their call — but a deferred
merge-blocker is never reported as though it were resolved. It keeps its
severity in the record, renders as `open — merge-blocker (deferred: <reason>)`
and still counts in the header's merge-blocker total. The Close then treats it
as open, because a PR that ships with a known blocker should say so on its own
description rather than in a decision nobody reads.

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

**Record before fixing.** Write the state ([formats.md](formats.md)): `version`
set to `2`, the step-9 snapshot as `files`, the intent from step 6, this run's
entry, and every finding's status, anchors, `verified_by`, decision and
`raised_in_run`.

For the run entry: `tier` is the reviewer set that actually ran, and `breadth`
with `reviewed` is the review set they were actually given — `whole change` or
`narrowed` with the paths, or **`none` with `reviewed: []` when this run
spawned no reviewers at all** (nothing moved, or files only left).

`breadth` is what both triggers read, so it is required on every run. Record
`none` rather than omitting it: the two are equivalent to the triggers, which
skip either, but only the recorded value says *this run reviewed nothing*
rather than *this run predates the field*. `reviewed` feeds no trigger. It is
the audit trail of what was handed out — the thing to read when a defect
survived several runs and the question is who was given the file — and it is
what makes a `breadth` claim checkable rather than self-asserted. Keep it
accurate for that, not for a computation.

Then update the description (Phase 5). Both happen before any fix, so an
interrupted fix loses nothing.

**Offer to fix**: if any finding is **fix now**, ask whether to implement those
now. On yes, implement them in this session, then tell the engineer to run
`/pre-review` again to verify. On no, leave the code alone.

## Phase 5: keep the description current

`PR.md` was reconciled in step 6. Write `.pre-review/<key>.md`, then copy it
to `PR.md`. **Update, do not regenerate**: keep the engineer's wording
wherever it is still true, fix only claims the change no longer supports, and
say in chat what changed. Two parts are regenerated from the state on every
run: the follow-up entries in "Not in this PR" — findings whose **decision** is
`follow-up` **and whose status is neither `fixed` nor `moot`** — and the
collapsed Pre-review record at the end.

Both halves of that condition matter. Keying on the decision rather than the
outcome keeps a deferred merge-blocker listed, whose outcome renders as
`open — merge-blocker`; the status guard is what drops a follow-up once it is
actually fixed, which the outcome used to do for free because `fixed` outranks
`follow-up` in the table. Without the guard the PR body advertises finished
work as a deliberate omission for the life of the branch. Layout and
rules are in [formats.md](formats.md).

## Close

End with the verdict line and the next step:

- **Open fix-now items**: fix them (offered above), then run `/pre-review`
  again.
- **Undecided findings** (open or partially fixed with no decision): list
  them. They show as `open` in the record until the engineer decides.
- **A merge-blocker that is deferred, declined, or left undecided**: say so as
  the first line, with its id, and the decision and its reason where there is
  one. Deferring is the engineer's call; presenting the PR as ready is not.
  This outranks the "nothing open" line below. A merge-blocker still decided
  `fix now` belongs to the first bullet instead — it has no deferral reason to
  quote, and it is about to be fixed.

  Then give the next step, which this bullet suppresses but does not replace
  — **but only if nothing else is open.** With no fix-now item and no
  undecided finding left, the PR **may** be opened, because the record
  carries the blocker and a human reviewer will see it: say so plainly,
  "`PR.md` is ready and declares <N> open merge-blocker(s); commit, push, and
  open the PR with it as the body", so the engineer is not left with a
  warning and no instruction. If anything else is open, the first two bullets
  stand and this one adds no instruction: fix those, then run `/pre-review`
  again. Never print both — "fix these and re-run" together with "ready,
  commit and push" is the "0 open, ready to ship" report this skill exists to
  prevent.
- **Nothing open, or only follow-up and declined**: "`PR.md` is ready: commit,
  push, and open the PR with it as the body."
- **Uncovered dimensions, files the checks rewrote, checks that failed, a
  `stubbed` typecheck, or a discounted one**: say which, plainly, and name the
  projects a stub left unchecked or an unbuilt dependency left unverified.
