---
name: pre-review
description: AI review of the current branch's change (commits, staged, unstaged and untracked files) before a PR exists. Presents findings with a recommendation for each, records the author's decisions, re-checks only the diff on later runs, and keeps PR.md up to date.
argument-hint: '[--final] [--full] [--pr <n>] [--ci "<summary>"] [scope hint]'
disable-model-invocation: true
allowed-tools:
  - Bash(git fetch *)
  - Bash(git merge-base *)
  - Bash(git diff *)
  - Bash(git ls-files *)
  - Bash(git cat-file -e *)
  - Bash(git hash-object -w *)
  - Bash(git branch --show-current)
  - Bash(git status *)
  - Bash(node scripts/pre-review/snapshot.mjs record *)
  - Bash(node scripts/pre-review/snapshot.mjs final *)
  - Bash(pnpm nx affected *)
  - Bash(pnpm --filter @babylonlabs-io/ts-sdk run test)
---

Arguments: `$ARGUMENTS`

- `--full` → force the full reviewer set over the whole change, even when the
  change qualifies for the light tier or nothing changed since the last run.
- `--final` - verify pending fixes, then run the independent final review.
  Reuse a completed final review only while its inputs still match. A first
  invocation still performs the initial review. `--full --final` forces both
  the full review and a new final review.
- `--pr <n>` → the branch's PR number, for Phase 5's rendered-body check.
- `--ci "<summary>"` → CI results the engineer has read, passed to reviewers
  attributed to them.
- Anything else is a scope hint for the reviewers.

**Parse the flags off before computing the scope hint, and never pass a flag
or its value through as one.** Everything the orchestrator reads out of
`$ARGUMENTS` for its own use needs a flag, or it is indistinguishable from the
hint: a bare `2615` typed for Phase 5 is useless to reviewers as a hint and
unrecoverable to the orchestrator as a value, so it fails twice. This is not
the Phase 1 anti-steering rule, which binds the orchestrator's own additions
and explicitly lets the engineer's hint through unchanged. The hint is what
remains after the flags are removed, and only that passes through.

`/pre-review` is one command run in a loop by the engineer who wrote the
change, usually in the same session that implemented it:

1. **Review.** Independent reviewers look at the change. Findings are shown in
   chat, each with a recommendation: fix now, follow-up PR, or decline.
2. **Decide.** The engineer confirms or changes each decision.
3. **Fix.** On request, this session implements the fix-now items.
4. **Run again.** Only what changed since the last run is re-checked. Chat
   reports what is fixed, what remains, and anything new.
5. **Finalize.** Run `/pre-review --final` when the fixes are complete. One
   independent reviewer reads the whole change without the previous findings.
6. **Hand off.** Every run updates `PR.md`. A completed final review makes it
   ready for CI and human review. It does not approve a merge.

Nothing is posted, committed or staged. Source files change only in step 3,
when the engineer says so.

**Files.** All git-ignored, all at the repo root, never edited by hand except
`PR.md`:

- `.pre-review/<key>.json`: the state (reviewed file contents as git blob ids,
  findings with status and decision). `<key>` is the branch name with `/`
  replaced by `__`.
- `.pre-review/<key>.context.txt`: stable review inputs for the final check.
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
   what is deliberately left out).

   **The intent is sections 1–5 of that file and never section 6.** Section 6
   is the collapsed Pre-review record ([formats.md](formats.md)): the snapshot
   line, the run summary and a row for every stored finding. Taking the file
   whole would hand the ledger — with the run count and `reviewed-at` — to
   every reviewer as "the intent", which for the cold lane means the one
   component it is required to be given carries the one thing it must not see.
   That defeats both the withholding in Phase 1 and the run-number strip, in a
   single step, and it gets worse every run as the table grows. It is not
   hypothetical: on the run that first wrote a description for a branch, the
   file did not exist and the intent came from the state's one-paragraph
   `intent` string, so the leak was latent until Phase 5 created the file the
   next run would read.

   Paste sections 1–5 into the pack — **verbatim, not condensed** —
   **excluding every part of it that states or restates a known
   open defect**: an entry in the "Not in this PR" list matching a stored
   finding whose `decision` is `follow-up` and whose status is neither
   `fixed` nor `moot` (the same condition Phase 5 regenerates that section
   with, so the two never disagree about one finding), and equally any
   sentence **anywhere in the description, that list included**, matching a
   stored finding whose status is neither `fixed` nor `moot` — whatever its
   decision — that presents that finding's subject as settled design. Both
   clauses use the same status test, so a `partially fixed` finding is
   withheld by both: the part that remains is still open, and a reviewer told
   it is settled will not look for it. The second clause is not restricted to
   the other sections: a hand-written "Not in this PR" bullet describing an
   open *declined* blocker matches neither the first clause (wrong decision)
   nor a clause scoped to "elsewhere", and descriptions written by hand —
   carrying no `(pre-review N<id>)` markers — are the expected case, not the
   exception.

   Both extensions are load bearing, and both failed on this skill's own
   branch the first run that could exercise them. Keying only on
   `follow-up` left a **declined** merge-blocker stated in "What" as a
   deliberate design choice, so the intent waived a blocker the skill says it
   cannot. And summarising the intent instead of pasting it reintroduced a
   deferred blocker as "out of scope, settled" in the orchestrator's own
   words, one step after the exclusion had removed it — the filter cannot see
   a paraphrase.

   **Mark every hole where you cut, and list them once at the top.** A
   deletion made silently still reads as verbatim, so a reviewer cannot tell
   a cut from an author who never wrote the sentence. Leave the literal
   marker `[withheld: N<id>]` in place of the removed text — mid-bullet, mid
   paragraph, or as the whole list entry — and open the intent block with
   `withheld: N<id>, N<id>` naming every one. Then the omission is auditable
   from the pack alone, and a reviewer who rediscovers the defect knows it is
   already on the ledger rather than reporting it as new. A finding the engineer
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

   Then the **authoritative source**: whatever this change is mirroring,
   implementing or claiming conformance to, and where to read it. A vendored
   spec or reference client; a sibling repository the code cites, read at the
   commit it pins rather than at its head; a protocol definition; a design
   doc; an API contract; a Figma node for UI work. Name the path, and the pin
   where the code itself states one — a constant, a lockfile, a comment.
   Do not reach for `git log` or `git -C <repo>` to discover a sha: neither
   matches a permission rule, and a prompt mid-run costs more than the
   precision buys. Say "at the pin the code cites" and let the reviewer read
   it.

   The binding rules above say which standards apply. This says what the code
   must *match*, which is a different question and usually the one a defect
   turns on. Without it a reviewer either guesses or marks every conformance
   claim UNVERIFIED, and both are expensive: **a finding contradicted by the
   authoritative source is worse than no finding**, because it costs tokens to
   produce and more to refute.

   **If there is no external contract, say so explicitly.** That is also
   information — it tells reviewers that correctness here is judged against
   this repository alone, and stops them hunting for a spec that does not
   exist.

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
     `LIGHT_REVIEW_MAX_CHANGED_LINES`, bounded impact on callers, no `--full`.
     One reviewer:
     `review-generalist`.
   - **full**: everything else, including broad or unclear impact on shared
     behavior or contracts. `review-generalist`, `review-tracer`, `review-panel`.
   State the reason for the tier. Use the caller map and the source; do not
   infer low risk from line count alone.

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
     foreground on every invocation, before the snapshot is taken. It also
     schedules a project's `build` and `typecheck` concurrently over one
     `.tsbuildinfo`, since `^build` adds no edge to the project's own build.
     Note what this reason is **not**: `nx.json` already gives **`test`**
     that same `dependsOn: ["^build"]`, so the dependency builds — including
     `babylon-proto-ts`'s `build-proto`, which `git clone`s a repository and
     regenerates its tracked `src/generated` tree — already happen at step
     10. Adding the edge to `typecheck` would move them in front of the
     snapshot and into the foreground; it would not introduce them. See step
     10 for what that means for the test run.
   - A module-not-found may mean the dependency has never been built in this
     clone rather than that the change is broken — or it may be a real defect
     with byte-identical output. **`TS2307` cannot be read at face value, and
     no rule below tries to**; it is recorded `failed` and named, so the
     engineer settles it. See "There is no discount".

   **Settle the typecheck here, not in step 10.** The reviewers are spawned
   from the pack, the pack is built from steps 1–9, and step 10 runs in the
   background — so a verdict reached there reaches nobody. **Redirect each
   command's output to a WORK file and read nx's own exit status**, not a
   pipeline's, before you route on either. Then decide it now, from nx's own
   output, **first match wins**:

   - **Any compiler error** → `typecheck: failed`. Put the first ~40 lines of
     real compiler output in the pack. This is first deliberately: a run where
     one project stubs and another emits real errors is `failed`, and no other
     branch may claim it.
   - **An nx error with zero tasks executed** → `typecheck: aborted`, with the
     error quoted. This is **its own verdict, not `nothing affected`**.
     (`aborted` is a distinct word from the `not run` this skill retired,
     which meant something else and now has a legacy read rule; do not merge
     the two.)
     Nothing was compiled, so it is not `passed`; no compiler spoke, so
     "does not compile" would be a claim about something never attempted; and
     it is emphatically not the docs-only case, because the sync abort
     documented above is exactly how a newly added package with no
     `typecheck` script fails, and it stops the typecheck for **the whole
     affected set**. Folding that into the same word a `.claude/`-only change
     gets would let a run where nothing was type-checked aggregate to
     `passed` on a clean lint and a clean suite — the false green this step
     exists to prevent. Say which projects went unchecked, which is all of
     them.
   - **`No tasks were run`** → `typecheck: nothing affected`. Never
     `passed`: nothing was compiled. This is the ordinary case for a change
     that touches no nx project, such as one confined to `.claude/` or
     `docs/`.
   - **Exit 0, with tasks actually run** → `typecheck: passed`.
   - **Anything else** — a task ran and exited non-zero with no compiler
     diagnostic — → `typecheck: failed`, with the tail of nx's output in the
     pack and the failure named as a **tool** failure, not a type error. A
     `typecheck` script can die without ever reaching a diagnostic: `tsc` runs
     out of heap (which is why three projects set
     `NODE_OPTIONS=--max-old-space-size`), nx kills the task, the script fails
     for its own reasons.

   The five branches are exhaustive over the two facts you have — did any task
   run, and did the command exit zero — so every run gets a word, which the
   mandatory `CHECKS` section requires. This last branch is the catch-all the
   lint and test settlements below keep as "any other error → `failed`"; the
   typecheck list lost it when it was rewritten into ordered branches, leaving
   an executed-but-failed run with no verdict at all.

   **A `noEmit`-disabled project is a qualifier on the verdict, not a verdict
   of its own.** nx substitutes a stub that exits 0 by construction, so the
   project compiled nothing whatever the run's outcome: name it in `uncovered`
   and report the run as `passed, with <project> stubbed` — or `failed, with
   <project> stubbed` — rather than replacing the verdict with the word
   `stubbed`. Reporting it instead would let a run where one project stubs and
   another does not compile read as `stubbed`, and the rule that puts compiler
   output in the pack's opening lines keys on `failed`, a word that run would
   never produce. `runs[].checks` still takes `stubbed` as a single value, and
   step 10 says when.

   **Settle the lint the same way, in the same vocabulary**, because the pack
   is required to report it: `No tasks were run` → `nothing affected`;
   exit 0 with tasks run → `passed`; an nx error with zero tasks executed →
   `aborted` with the error quoted; any other error → `failed`. `stubbed` has
   no lint meaning — it is defined by a `noEmit`-disabled typecheck target —
   so lint never takes it. Without this, a clean lint and a lint that ran
   nothing are indistinguishable in the pack, and no reviewer may rebuild to
   tell them apart.

   **There is no discount.** A module-not-found (`TS2307`) on a workspace
   package may mean the dependency was never built in this clone rather than
   that the change is broken — but `TS2307` is emitted identically for an
   undeclared package, an unbuilt one, a subpath missing from the
   dependency's `exports`, a subpath present but unbuilt, and a plain
   missing relative import, so the message cannot tell you which. When every
   error is a module-not-found on a workspace package, **say so in the pack
   and name the packages**: the dependencies may simply be unbuilt here, and
   one `pnpm build` settles it. Record `failed` regardless and let the
   engineer decide.

   This deliberately errs toward telling reviewers the change did not
   compile. A rule that decides the question automatically was tried three
   times — on the error text, then on a "declared and unbuilt" test, then on
   a `tsc --traceResolution` probe — and each version shipped a defect, twice
   a false green. The cost of the honest rule is a sentence the engineer
   reads on a fresh clone; the cost of the clever one was a run reporting
   `passed` on code that does not compile.

   Then compare `git status --porcelain` with step 3's copy. Every file lint
   modified was **rewritten by the checks**: tell the engineer, record it in
   the run's `rewritten_by_checks`, and redo steps 3–4 so the review set and
   `run<N>__local.diff` include the rewritten content. **Redo steps 7–8 as
   well** when the rewrite pulled a file into the change that was not there
   before: that file has had no blast-radius entry and no line counted toward
   the tier, and it can be on a critical path. The review then covers exactly
   what the snapshot records.

   Snapshot: `node scripts/pre-review/snapshot.mjs record <base>`. It hashes
   every file in the change (the step-3 set) with `git hash-object -w`, which
   stores the content in git's object database, so a later run can diff
   against exactly what was reviewed, whether or not it was ever committed. A
   deleted file is recorded as `deleted`. Copy its JSON output verbatim,
   never compute it another way: `files` is the state's `files` map, `count`
   is the snapshot line's `files=`, and `sha256` is its `files-sha256=`. This snapshot is what
   the state records. Never re-run it after fixes: that would make the fixes
   look already reviewed.

   **Bind this run to its inputs before reviewers or background tests start.**
   Write `.pre-review/<key>.context.txt` with these stable inputs:

   - the exact filtered intent from step 6 and the engineer's scope hint;
   - the content hashes of `CLAUDE.md`, this skill, `formats.md`, the reviewer
     definitions, `snapshot.mjs`, and any other binding instruction source;
   - the authoritative source paths and pinned revisions, plus content hashes
     for local sources the review depends on;
   - the engineer's CI summary, when one was supplied.

   Use `git hash-object -w -- <path>` for local source hashes and list each
   path with its hash. Preserve context text byte-for-byte when its inputs
   have not changed. Exclude timestamps, run numbers, check output and stored
   findings. Keep this file outside the final reviewer's inputs.

   Run `node scripts/pre-review/snapshot.mjs final --base <base> --state-file .pre-review/<key>.json --context-file .pre-review/<key>.context.txt`.
   Save its `input_key` for this run even when the status is blocked or pending.
   The helper can emit a key before a first-run state exists. Store that key
   on the run after it finishes. Never replace it with a newer key to make
   changed content look checked. Clear `final_review` when `--full` is set.

10. **Tests**, in the background, after the snapshot:

    ```
    pnpm nx affected -t test --files=<comma-separated changed files> --skip-nx-cache
    ```

    For every nx run, `--skip-nx-cache` is not optional: a cached replay
    prints success without executing anything. `No tasks were run` means no
    nx project is affected: **nothing affected**, never passed. Redirect this
    run's output to a WORK file and read nx's own exit status, as step 9 says
    for its two.

    **This target carries `dependsOn: ["^build"]` in `nx.json`,** so with
    `--skip-nx-cache` it rebuilds every dependency of every affected project
    before a single test runs — including `babylon-proto-ts`'s `build-proto`,
    which `git clone`s a repository and regenerates that package's tracked
    `src/generated` tree. Expect it whenever the change affects a dependent of
    that package, and expect the run to fail offline or when the pinned
    upstream is unreachable, for a reason that has nothing to do with the
    change.

    **Expecting the regeneration to run is not expecting it to change
    nothing.** If it leaves `src/generated` byte-identical, `git status
    --porcelain` shows nothing and there is nothing to record — say the
    rebuild ran and changed nothing. If it *does* change tracked content, that
    happened after the snapshot and while the reviewers are reading, so the
    record now describes a tree the PR will not ship: report it in
    `rewritten_by_checks` like any other check-driven rewrite, name
    `babylon-proto-ts` as the cause so the engineer is not hunting a mystery,
    and tell them the generated files on the branch were stale or upstream has
    moved — which is a real thing to know, not noise to suppress. Never let
    "expected" mean "unrecorded": the field exists precisely so the reviewed
    content and the shipped content cannot silently differ.

    The typecheck and the lint were already settled in step 9. This step
    settles the tests in the same vocabulary — `No tasks were run` →
    `nothing affected`, exit 0 with tasks run → `passed`, an nx error with
    zero tasks executed → `aborted` with the error quoted, any other error →
    `failed` — and then aggregates the three.

    The run's `checks`, first match wins: `failed` if any of the three is
    `failed`; **`aborted` if any is `aborted`**, because a check that never
    ran cannot be summarised by the outcome of the two that did; `stubbed` if
    a project reported its typecheck target disabled for `noEmit` (those
    projects are in `uncovered`, recorded at step 9); `nothing affected` if
    none of the three is `passed`; otherwise `passed`.

    `aborted` outranks everything below it deliberately. An nx sync abort
    type-checks nothing across the whole affected set, so letting a clean lint
    and a clean suite carry the run to `passed` would report a change nobody
    compiled as checked.

    **`passed` here never means the change compiled.** Once the `failed` and
    `stubbed` clauses have been applied every verdict is either `passed` or
    `nothing affected`, so this aggregate says only "everything that ran, ran
    clean". A change touching a lint-only project — `tools/eslint-config` has
    a lint target and no typecheck target at all — lints clean, compiles
    nothing, and still records `passed`, and no wording of this clause
    prevents that: the information lives in the three separate verdicts, not
    in the aggregate. So **always report the three, not the word**: say which
    were `nothing affected` and which projects went unchecked. The single
    value exists for the record, not for the reader.

    A failure is not automatically a finding, so characterise it first. Tests
    should not write source files; if `git status --porcelain` shows one
    changed when they finish, report it as rewritten by the checks — the
    regeneration above included, with its cause named. There is no exemption:
    a file the checks changed is recorded whatever changed it.

Collect steps 1–9 into a short **context pack** and paste it verbatim into
every reviewer prompt. Open it with:

> **LOCAL REVIEW: this is the working tree, not a PR.** Do not run any `gh`
> command. Do not `git diff main...HEAD`. The file list and diff below are
> authoritative.

The opener states what the review *is*, not what does not exist. A PR may well
exist — the engineer keeps running this after pushing, and Phase 5 has a
branch for exactly that — so "there is no PR" was a claim the orchestrator
cannot make and does not need: the two instructions that follow it are what
actually bind, and they hold either way.

**The pack must carry a `CHECKS` section, and it is not optional.** Step 9
finishes before the reviewers are spawned, so its results are available and
they are exactly what a reviewer cannot rediscover under the no-builds rule.
Give, for lint and typecheck, the verdict step 9 settled — `passed`, `failed`,
`aborted` or `nothing affected`, each optionally qualified as "with
`<project>` stubbed" — and the project count nx reported. **A `failed` check
says which kind**, `failed (compile)` or `failed (tool)`, because the two
carry opposite information and the bare word cannot distinguish them: the
first means a compiler rejected the code, the second means no compiler ever
ran. An `aborted` check carries the error nx printed, because it means nothing
was checked at all and a reviewer cannot rediscover that. **Never a bare
`stubbed`**: it
is a qualifier, not a verdict, and lint cannot take it at all. A bare
`stubbed` would let a run where one project stubs and another does not
compile reach reviewers without the word `failed`, which is what the rule
above keys on to put compiler output at the top of the pack. Bare `stubbed`
exists only as a `runs[].checks` value, which step 10 sets and no reviewer
reads.
Tests are still running at this point, so say so rather than implying they
passed.

If the typecheck **failed**, put that in the pack's opening lines, above the
file list — but say **which kind of failure**, because step 9 produces two and
they tell a reviewer opposite things:

- **a compile failure**, where a compiler diagnostic was produced: give the
  first ~40 lines of the real compiler output and say the change does not
  compile. That is the single most useful thing a reviewer can be told, and
  burying it in a table at the bottom wastes the check.
- **a tool failure**, the catch-all branch where a task ran and died without
  ever reaching a diagnostic: give the tail of nx's output and say so in those
  words. There is no compiler output to give, and nothing is known about
  whether the change compiles. Claiming it does not would be inventing a
  result — the same mistake as claiming it does.

Spawn the reviewers either way — a type error is usually local and the rest of
the review still has value — but never let the pack read as though the change
builds, and never let it read as though a compiler spoke when none did.

**Say what CI has checked and this run has not.** The local typecheck reads
each project against its dependencies' **last built** `dist`, so a signature
change in one package against a caller in another passes here and fails in
CI's full build. Stale `dist/` is the standing hazard in this repo, and a
reviewer who does not know that reads a green typecheck as more than it is.

Say only what you know. **This run has no CI result for the tree it
reviewed** — that is the sentence to put in the pack, and it is true however
the tree got there. Do not go further: nothing in Phases 0–0b establishes
whether a PR exists, `allowed-tools` carries no command that reports check
runs, and an unverified claim about CI would be pasted verbatim into every
reviewer prompt. If the engineer states CI results in `--ci "<summary>"`,
pass them through attributed; otherwise say nothing about them.

Do not reach for "because the review covers uncommitted work": nothing forces
the tree to be dirty. Step 3 keeps `git status --porcelain`, so a run on a
clean tree is a state this skill can observe and the documented workflow
produces — re-running after pushing fixes for review comments. The sentence
above needs no such premise.


On a later run, the pack also carries every stored finding as one line (id,
status, claim) and the `refuted` list. Reviewers report a known defect by its
id (a regression of a fixed finding as "regressed N<id>"), never as new, and
drop a refuted claim unless they have new evidence. The cold reviewer of
Phase 6 gets none of that paragraph — see there for what it does get.

## Phase 0b: later runs, checking only what changed

Before either skip gate, check reviewer coverage across the stored runs.
A qualifying initial run has a whole-change review, a full report from every reviewer
required by its tier, and no uncovered reviewer dimension. A later
whole-change full review with all three required reports can repair missing
coverage. Missing completion fields do not prove coverage. If neither
record exists, run the whole-change full tier before any final review.
Also repair any later incomplete review. A clean initial review does not
cover a lost reviewer on new code. Keep that missing coverage open until a
later whole-change full review completes. A no-review run or final reviewer
cannot clear it. This repair overrides both skip gates and the breadth picker.
Failed checks can be repaired by later checks; they do not require a repeat
of completed reviewer work.

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

**Nothing moved, entered or left, no outside anchor's value changed, and no
`--full`**: spawn no reviewers. Wait for the checks, then go to Phase 4 with
the stored findings (the engineer may have new decisions to record). With
`--full`, run Phases 1–3 over the whole change.

**Anything else**: first mark `moot` every finding **none of whose anchor
paths was ever in `files`** other than the ones that have now left, and whose
anchor files have all left the change. That needs only the buckets, not a
reviewer, and a finding with no file left in the change must not stay open.

Say it that way and not "no anchor path outside the changed-file list": a
file that has *left* is outside the changed-file list by definition, so that
phrasing is unsatisfiable for exactly the findings the sweep is meant to
retire — nothing would ever be mooted, and every such finding would then trip
the `left`-anchor condition on the gate below and spawn reviewers for a
finding with no file in the change at all.

The test is the anchor *path*, not an entry in `outside_anchors`. The map
starts empty and is never backfilled, so "has no entry in the map" is true of
every finding raised before it existed — and a legacy finding with one anchor
in the change and one on an untouched caller would be retired the moment the
changed anchor left, while the no-backfill rule says it keeps its stored
status until one of its files enters the change. That is "closes wrongly",
the worst of the four defects this redesign replaced. **An anchor path that
was never in `files` is not "left"**, because the question is undefined for a
file that was never there: treat it as not all left, so the finding is not
mooted.

Then, **if files only left, no outside anchor's value changed, no non-`moot`
finding still has a `left` anchor, and no `--full`**, stop there: wait for
the checks and go to Phase 4. With `--full`, run Phases 1–3 over the whole
change.

**Both gates carry the same four qualifiers, and both need all four.** An
earlier version put the outside-anchor condition on the first gate only,
which left the ordinary shape of a fix — revert the changed file, correct the
untouched caller — taking the files-only-left exit: no reviewer, and a
finding the moot sweep is forbidden to retire, open for the life of the
branch. A later version fixed that and still omitted `--full` and the
`left`-anchor condition here, so `--full` was a silent no-op on this gate
while the Arguments contract promised it forces a full run "even when nothing
changed since the last run", and the very case `left` was added to the
verdict-pass send list for could never reach that send list.

**An anchor outside the change is tracked in its own map, not in a bucket.**
The four buckets are defined over the changed-file list, so an anchor on a
file the branch never touched — a caller, a fixture, a document — is in none
of them, and reviewers are told to raise exactly these findings, so this is
the common case rather than the corner. They are tracked separately:

- **`outside_anchors`** in the state, `{ "<path>": "<blob>" }`, is the second
  map. It is **not** `files` and must never be merged into it. `files`,
  the snapshot line's `files=` count and its `files-sha256=` digest are three
  views of one map that `snapshot.mjs record` builds from changed paths
  alone; an entry added to `files` is erased by the next `record`, and a path
  folded into the digest makes the record unmatchable by the stricter CI
  check *planned* against `git ls-tree` — which can only ever reconstruct
  changed paths. That check is a TODO today; the first reason stands alone.
- **Populate it in Phase 4**, when the findings are known, by the rule stated
  there and only that rule — which is narrower than "every stored finding":
  it skips `moot` findings and findings raised before the map existed. Do not
  restate the filter here, or the two copies drift and this one, being the
  looser, wins. In outline: for each eligible anchor path not in the
  changed-file list, `git hash-object -w -- <path>` and store the blob under
  that path, recording `deleted` for a path that no longer exists. Do not use
  `snapshot.mjs` for this: its three outputs come from one map by
  construction.
- **Not eligible**: `PR.md` and anything under `.pre-review/`. The snapshot
  script excludes them structurally, they are review tooling rather than the
  change, and Phase 5 regenerates the description every run anyway. A finding
  anchored only there is judged by hand.
- **Compare it at the start of Phase 0b**, alongside the buckets. For each
  stored path: if the file exists now, `git hash-object -w -- <path>`; if it
  does not, its current value is `deleted`. Compare with the stored value.
  - **Same value** → the finding keeps its stored status.
  - **Both sides are blobs and they differ** → the finding goes to the
    verdict pass with `git diff <stored blob> <current blob>` — but
    `git cat-file -e <stored blob>` first, exactly as the `moved` bucket
    does. Unreferenced objects expire in about two weeks, and on an old
    branch that diff would abort the run; when the stored blob is gone, send
    the finding with the file whole instead.
  - **Either side is `deleted`** → there is no pair of blobs to diff. Send
    the finding to the verdict pass and say which way it went: a file that
    has appeared is read whole; one that has vanished is **named as gone**,
    and the lane judges from the finding's `detail` and the anchors still in
    the tree. Do not say "judged from the stored blob": `allowed-tools`
    carries `git cat-file -e` for existence and nothing that reads blob
    content, so that instruction either dead-ends or emits a command matching
    no permission rule, which prompts mid-run and degrades every command
    after it.
- **The buckets never apply to it.** An outside anchor is not `unchanged`,
  `moved`, `entered` or `left`, and in particular **`left` does not reach
  it** — "in the state, no longer in the change" describes `files`, not this
  map. It is therefore never mooted by the sweep below, whether every anchor
  of the finding is outside or only some are.
- **It escalates nothing.** Its diff lines are not counted toward the
  size trigger. It decides which findings get re-judged. Its current content
  also binds the final-review result.

**Both gates above carry its condition**, so a run where no changed file moved
but an outside anchor's value did — the engineer fixed the untouched caller
and nothing else — does not take a spawn-no-reviewers path. What such a run
records is settled by the breadth picker below, which has a branch for it;
do not decide it here.

This replaces an earlier attempt that hashed outside anchors into `files`
itself. That version had four defects, the worst of which was silent: an
outside anchor in `files` satisfies the `left` definition exactly, so the moot
sweep retired the finding without a reviewer, turning "never closes" into
"closes wrongly". Every rule above exists because of one of them.

**Do not backfill.** Existing states carry no `outside_anchors`, and it
cannot be reconstructed: an anchor absent from `files` today is equally a
genuine outside anchor and a file that was in the change and later left it,
and the final state does not distinguish them. Start the map empty and let it
populate from the next run. A finding raised before this existed keeps its
stored status until one of its files enters the change, or you judge it by
hand.

Also do not let the moot sweep take credit for a fix. When an author removes
the change that caused a finding, its anchors leave and the mechanical rule
says `moot` — but the defect is *gone*, which is `fixed`, and `moot` publishes
as "none of the finding's files is part of the change any more", telling a
reviewer nothing was checked. Record it as `fixed` with what you verified.

The verdict pass is one `review-lane`. Give it every finding that is not
`moot` and has an anchor file that **moved, entered or left**, **or an outside
anchor whose stored value changed**, **including `fixed` ones**, so a
regression is caught. `left` is in that list because a finding can have one
anchor in the change and one outside it: when the author reverts the changed
end, that anchor leaves while the outside one hashes unchanged, and without
`left` no rule would send the finding anywhere while the moot sweep is
forbidden to retire it — so it would stay open for the life of the branch.
Each with its full `detail`, plus the
buckets, the per-file diffs and the pack. Ask for one line per finding and no
word limit. It owes a verdict for each, none skipped (give it the count):
judge the current code and return `fixed` (cite the line), `partially fixed`
(say what remains), `open`, or regressed (a `fixed` finding that is wrong
again), with the current anchors.

**An anchor the lane cannot open is named, not fetched.** A `left` anchor is
by definition out of the changed-file list, so it is in neither the per-file
diffs nor the pack, and a `deleted` outside anchor has no content at all —
`allowed-tools` carries `git cat-file -e` for existence and nothing that
reads blob content. Tell the lane which anchors are gone and let it judge
from the finding's `detail` and the anchors that remain: for the case `left`
was added for, the question is whether reverting the changed end removed the
defect or merely moved it to the untouched anchor, and that is answerable
from the file still in the tree.

A finding whose anchor files are all unchanged, and whose outside anchors (if
any) all match their stored value, keeps its stored status and is not sent.
**A `left` anchor never qualifies**, and neither does an outside anchor whose
stored or current value is `deleted` — both are in the send list above, for
the reasons given there. An earlier version of this sentence excluded
"unchanged and left" and so cancelled the `left` rule four lines above it on
exactly the case that rule was written for.

**Escalate to the full reviewer set** when any of these holds:

- a moved or entered file is on a critical path;
- the moved and entered lines exceed `LIGHT_REVIEW_MAX_CHANGED_LINES`;
- the total change exceeds that threshold and has no whole-change full review;
- changed contracts or shared behavior have broad or unclear impact;
- `--full` was passed.

Use the callers and authoritative sources from the context pack to assess
impact. A short change can affect many callers. State the escalation reason.
Do not widen a review only because several runs have passed. Phase 6 supplies
the independent whole-change check once the fixes are complete.

A legacy run without `breadth` counts as a whole-change full review only when
it has `kind: first` and `tier: full`. A final reviewer alone never counts as
a full-tier review.

Pick the review set, first match wins:

- **`--full`, broad or unclear impact, or total size without an earlier
  whole-change full review:** use the full tier over the whole change.
  Record `breadth: whole change` and every changed path in `reviewed`.
- **Critical path or size since the last run:** use the full tier over moved
  and entered files, plus the affected callers. Record `breadth: narrowed`
  and the paths supplied to those reviewers.
- **Outside-anchor changes only:** use the verdict pass over affected
  findings. Record `breadth: narrowed` and `reviewed: []`.
- **Other fix checks:** use the verdict pass to verify affected findings and
  inspect the per-file diffs, entered files and affected callers for new
  defects. Send those defects through Phase 3. Record `breadth: narrowed`
  and the moved and entered paths.

Ordinary runs record `cold: false`. The two no-review gates record
`breadth: none` and `reviewed: []`. Both still reach Phase 6: neither may
skip a requested final review. Retain the outside-anchor and regression
checks above, including findings that were previously marked fixed.

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

The first run uses the tier selected in Phase 0. Later runs use the review
set selected in Phase 0b. A normal fix check uses only the verdict pass;
it does not add a whole-change reviewer. The independent reviewer runs in
Phase 6, after the fixes and checks are complete.

Spawn the selected reviewers together with the `Agent` tool. Each receives
the context pack and the engineer's scope hint. Keep overlapping judgment
in a full review. Include the Phase 3 finding filter in every reviewer brief
so reviewers do not spend time generating cosmetic findings. Do not repeat
the agent definitions in the prompts.

**Never tell reviewers where you expect the defect to be.** State facts — what
changed, which files moved, what the checks did, what the intent is — and stop
there. A scope hint that names the risky area ("this round is corrections to
corrections", "every blocker so far came from the escalation rules, weight
your lanes accordingly") concentrates every reviewer on one place and licenses
them to skim the rest. The engineer's `$ARGUMENTS` hint is theirs to give and
passes through unchanged; the orchestrator adds no theory of its own. If you
believe an area is risky, review it yourself in Phase 3 rather than steering
four reviewers into it.

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

   **The general form is not in `allowed-tools`, and that is deliberate: it
   will prompt.** Only the ts-sdk script, which is a fixed string, is
   pre-approved. A pattern wide enough to cover any package —
   `pnpm --filter * exec vitest run *` — puts a wildcard in the middle of the
   command, where it can span the argument boundary and pre-approve a payload
   that has nothing to do with vitest. This session reads diffs and reviewer
   output it does not control, so a mid-pattern wildcard is a real widening
   and not a convenience. Accept the prompt, or add one trailing-wildcard
   entry per package you actually need.
5. Add disproved claims to `refuted`.
6. **Rank, then filter from the first run.** Keep verified defects and
   required-rule violations. Omit preferences about names, prose and optional
   refactors when they have no concrete failure or required-rule violation.
   Do not give cosmetic suggestions an id or a decision. They must not start
   another fix cycle.

   Preserve incorrect user-facing text, specifications, critical-path JSDoc
   and documents that are the deliverable. A wrong instruction or contract
   is a defect even when it is written in Markdown. Merge-blockers are never
   filtered. For old cosmetic entries, retain their history, record the
   decision to decline, and stop asking for it again.

   Merge repeated findings into the stored entry. Reopen a refuted finding
   only with new evidence. Verify regressions even when the loop introduced
   the changed code as a fix.

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
(`passed`, `failed`, `aborted`, `stubbed`, `nothing affected`). Never say
"passed" when nothing
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
entry, every finding's status, anchors, `verified_by`, decision and
`raised_in_run`, and **`outside_anchors_since` carried forward unchanged** —
or, when the loaded state has no such field, set to this run's index.

**Set it on the first state write that lacks it, whether or not the map ends
up with anything in it.** The map is rebuilt every run and is `{}` whenever no
finding anchors a file outside the change, which is most runs. Tying the field
to the run that first *populates* the map would leave the boundary unset
through every empty run, sliding it forward so that findings raised in the
meantime are permanently ineligible — and it is circular besides, since
whether a run populates the map depends on eligibility, which depends on the
boundary.

That last one is the easiest field in the state to lose, and losing it is
silent. The state is rewritten whole every run, so a run that omits it makes
the next run believe it is the first: the boundary moves forward, and every
finding raised before that point quietly stops having outside anchors
tracked. Never recompute it and never move it.

Then write `outside_anchors`. It is **rebuilt each run, not updated in
place**, so there is one rule and no drift between what is added and what is
dropped: walk every stored finding's `anchors`, take each path that is not in
the changed-file list, **was not in the state's `files` as loaded at the start
of this run**, and is not `PR.md` or under `.pre-review/`,
`git hash-object -w -- <path>` it, and store the blob under that path
(`deleted` if the file is gone).

**The second condition is what keeps `left` out of the map,** and without it
the principle stated below is violated by this very step. A path that left the
change *in this run* is not in the changed-file list, so a walk testing only
that would hash it as an outside anchor — and then it is in the map forever,
where `left` never reaches it and the moot sweep may not retire it. Concretely:
a finding anchored on A and C, A leaves while C stays, A becomes an outside
anchor; when C leaves too, the sweep sees A outside the change and the finding
is pinned to a verdict pass for the life of the branch. The loaded state's
`files` is the one record of what was in the change a moment ago, so it is the
only thing that can tell a genuine outside anchor from a path that just left.

What the walk does not produce is not in the map. That retires a path no
finding anchors any more, and equally a path that has since entered the
change — which an incremental update would leave behind
with a stale blob, so the same finding would be routed to the verdict pass
twice, once as a bucket and once as an outside anchor. This is the one place
the map is written, because it is the first point at which both the findings
and the changed-file list are settled.

**Only findings raised while this map existed are eligible, and only findings
that are still live.** Skip every `moot` finding: its anchors have all left
the change by definition, the verdict pass excludes `moot` so those entries
can never route anything, and the no-spawn gate reads the whole map — so a
retired finding's stale anchor would spawn a reviewer pass over nothing the
next time anyone edits that file.

Then apply the boundary, which the state **records explicitly**: the first
state write that finds no `outside_anchors_since` sets
**`outside_anchors_since: <that run's index>`** at the top level — whether or
not the map it writes alongside is empty — and no later run changes it.

A finding is eligible when its `raised_in_run` is at or
after that value. `raised_in_run` is an existing field written for every
finding; `outside_anchors_since` is **new with this map**, is defined in
[formats.md](formats.md), and is on the "Record before fixing" list above as a
field to carry forward unchanged. Both are read straight from the state, so
the test needs no history the state does not keep — which is the whole point.

Record the boundary rather than deriving it. Two earlier attempts could not
be evaluated at all. Keying on whether a run entry *records* `cold` fails
because `formats.md` tells a reader to treat an absent `cold` as `false`, so
an orchestrator that normalises the state first resolves a value for every
legacy entry and the presence test never fails — a guard that cannot fail
admits everything. Keying on "the first run written by a `version: 2` state
carrying the key" fails differently and worse: the state is rewritten whole
every run, so nothing preserves when the key first appeared, `version: 2`
predates this map, and run entries carry no index field at all in
`formats.md`. That guard cannot be evaluated either way, which leaves the
orchestrator to admit everything or nothing — the first restores the
pinned-open defect below, the second leaves the map permanently empty.
Phase 0b
forbids backfilling because an anchor absent from `files` is equally a genuine
outside anchor and a file that was in the change and later left, and this walk
applies that same ambiguous test; without the guard, the first run after this
ships would populate the map with exactly what that rule refuses to
reconstruct, and `left` does not reach the map, so a finding whose cause the
author removed would be pinned open.

For each run, record the actual `tier`, `breadth`, `reviewed`, `cold`,
reviewer usage, reviewer completion and `input_key`. Set `completed: true`
only after the full report arrives and its child reports are resolved. A
waiting notification does not prove completion. Keep the key captured before
review. Do not recompute it after a fix. `breadth: none` means no reviewers ran.
`reviewed` lists the paths supplied to the non-cold reviewers; a separate
final run lists the whole change. Do not rewrite older run entries.

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

**This file becomes a PR body, so check it as one.** GitHub does things to
this text that a Markdown file never shows: it autolinks `#<number>` to a real
issue or PR, expands `@name` to a real account, and normalises line endings. A
bare `#97` in the record is a finding id, not issue 97, and rendered as a link
it points at unrelated work in this repository. Finding ids use `N<id>` for
exactly this reason (see [formats.md](formats.md)).

Two checks, and the difference matters:

- **Always, on the file you just wrote**: scan it for anything the platform
  will transform — `#` followed by digits, a bare `@name`, a reference-style
  link. This needs no PR and no network, and it is the check that catches the
  text *this run* produced.
- **After the engineer pushes, when a PR exists**: read the posted body back
  with `gh pr view <number> --json body --jq .body` and confirm it matches
  what was written. Note what this can and cannot settle: the field returns
  the raw stored Markdown, and autolinking happens at render time and leaves
  the body byte-identical, so **this confirms the upload, never the
  rendering**. The scan above is the only check that catches an autolink, and
  it needs no PR.

  **This command is not in `allowed-tools` and will prompt, deliberately** —
  the same call made for the vitest form in Phase 3. A pattern wide enough to
  cover any PR number puts the wildcard mid-command, where it pre-approves
  arbitrary extra flags in a session that reads untrusted diffs and reviewer
  output; `gh pr view` only reads, so the harm is bounded, but "bounded" is
  not a reason to widen. The check runs once, at the very end, after the
  reviewers are done, so a prompt there costs almost nothing.

  It needs the PR number, which only the engineer has, so it comes
  from `--pr <n>` and nowhere else: do not go looking, and **skip the check
  rather than ask**. Asking mid-run costs more than the check is worth — a
  typed reply ends the turn holding the pre-approved commands, so every
  command after it prompts. Note that it reads the last *pushed* body, so it
  confirms the previous description, not the one just written.

No reviewer can do either for you: reviewers read the description as a
Markdown file, which is the one context where none of this happens.

## Phase 6: final review

Refresh the stable context inputs after Phase 5 on every invocation, then
run the final-state check. Its command is:

`node scripts/pre-review/snapshot.mjs final --base <base> --state-file .pre-review/<key>.json --context-file .pre-review/<key>.context.txt`

Use its `status` and `reasons` in the closing report. A normal invocation can
reuse a completed final result but never starts a final reviewer. `--final`
requests that reviewer only when the result is pending and no eligibility
reason blocks it. A no-review gate in Phase 0b still reaches this phase.
`--full` clears `final_review` before review, so it never reuses a result.
Update the collapsed record in both description files with this current
status. Keep the reconciled intent unchanged.

Before a final reviewer starts, all fix-now items must be verified, substantive
decisions recorded, and applicable checks complete. Failed, aborted or stubbed
checks, uncovered review dimensions and any unresolved merge-blocker block
completion. Deferring or declining a blocker does not clear it. On a first
`--final` invocation, perform the initial tier and these steps before the
final reviewer. Do not turn `--final` into a cheaper initial review.

Capture the helper's `input_key` before the final reviewer starts. After it
returns, verify and merge its findings using Phase 3, record decisions using
Phase 4, and refresh the description using Phase 5. Do not apply fixes inside
this final pass. Preserve the original key even if the inputs change.

Record a separate final run with that key, the check results and reviewer
usage. Set the review-lane's `completed: true` only after its full report
arrives. Set `final_review: {input_key, run}` to this run's one-based index
only after its findings and decisions are recorded. Refresh the stable
context and run the helper again after the final run is recorded. Update the
collapsed record in both description files with that result. Only `complete`
permits the completion statement. A changed input or new blocker leaves the
final review pending or blocked. Fix the issue, verify it,
and use `--final` for the new candidate. There is no promise of one final
pass for the life of a PR.

### Independent final reviewer

Spawn one `review-lane`. Record a separate `kind: final` run with
`tier: light`, `breadth: whole change`, every changed path in `reviewed`, and
`cold: true`. This does not count as a full-tier review. An old `cold: true`
entry does not establish final completion.

Build its prompt from this closed list of inputs:

- the mandatory opening line and base SHA;
- the whole changed-file list, with added / modified / deleted status;
- deleted-file diff hunks, pasted inline;
- the binding rules and authoritative source;
- `CALLERS OF CHANGED EXPORTS`, `CHECKS` and the CI-gap statement;
- the filtered intent, rewritten as described below;
- the method and finding filter below.

Give it no diff-file path or scratchpad path. Those names contain run numbers
and disclose the review history. Paste deletion hunks inline because deleted
files cannot be read from the working tree. Normal source files are read
whole. Include the opening line and check results required by the agent's
contract; an abbreviated prompt must not hide failed checks.

Withhold previous findings, decisions, the refuted list, scope hints, run
numbers, prior verdicts, the context file and all other inputs. Do not tell
it that a previous review exists. Earlier findings can make an independent
reviewer treat a disputed rule as settled.

Apply step 6's open-defect filter before rewriting intent. Then state what
the change does and its deliberate scope. Remove references to this branch's
review history. Never describe an open finding as settled or out of scope.
Do not include withheld markers or a withheld header: those also disclose
the findings. Filter first; paraphrasing a known defect before filtering can
hide it from the filter.

Tell the reviewer not to read `PR.md`, `.pre-review/`, the work directory,
or a file whose sole purpose is to store review output. Do not omit a source
or document under review merely because it mentions prior reviews. This
skill and its documentation remain in scope when they change. If a changed
file is solely a review artifact, withhold it from this reviewer, tell the
engineer and record that path as uncovered. Do not claim final completion
while a changed file was withheld. These are instructions, not a sandbox.

Give the reviewer this method:

- Read each changed source or document end to end. Follow its outputs into
  affected callers and contracts, including unchanged files.
- Follow the behavior in order. Check that each input is produced and each
  output reaches its consumer. A missing connection may have no diff hunk.
- Check each stated reason against the current implementation. A condition
  that cannot occur does not justify the rule built around it.
- Report verified defects and required-rule violations. Apply Phase 3's
  cosmetic filter. Do not assume a rule is sound because its comment says
  that earlier reviews accepted it.
- Return one entry per finding, with evidence and both anchors for an
  outside-file defect. Override the agent's default word cap so it can
  report every substantive finding.

Merge this review's findings only after it returns. Its independence is
preserved during discovery; verification and deduplication still use Phase 3.

## Close

Lead with the final-state helper's result and any open blockers.

- **Open fix-now items:** offer the fixes, then request `/pre-review` to
  verify them. Do not call the change complete.
- **Undecided substantive findings:** list the decisions still needed.
- **Unresolved merge-blockers:** show their ids and decisions, including
  deferred and declined blockers. The author can open a draft that declares
  them; pre-review remains blocked.
- **Failed, aborted or stubbed checks, or uncovered work:** state what failed
  and what was not checked. Keep the final result blocked.
- **Eligible, but final review pending:** say "Fix checks are complete. Run
  `/pre-review --final` before requesting human review."
- **Final result complete:** say "Pre-review is complete for this snapshot.
  Open the PR with `PR.md`. CI and human code review are still required."

Report each reviewer's tokens, tool calls and duration from its completion
notification. Also sum the recorded reviewer tokens across all runs for this
branch and show the run count. Mark a missing value as `not reported` and the
sum as partial. Do not count a reused final result as another reviewer call.
These figures exclude the orchestrator. Do not present them as total model
usage or invent missing measurements.
