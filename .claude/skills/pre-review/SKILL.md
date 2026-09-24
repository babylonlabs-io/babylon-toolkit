---
name: pre-review
description: AI review of the current branch's change (commits, staged, unstaged and untracked files) before a PR exists. Presents findings with a recommendation for each, records the author's decisions, re-checks only the diff on later runs, and keeps PR.md up to date.
argument-hint: '[--full] [--pr <n>] [--ci "<summary>"] [scope hint]'
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
  - Bash(pnpm nx affected *)
  - Bash(pnpm --filter * exec vitest run *)
  - Bash(pnpm --filter @babylonlabs-io/ts-sdk run test)
  - Bash(gh pr view * --json body --jq .body)
---

Arguments: `$ARGUMENTS`

- `--full` → force the full reviewer set over the whole change, even when the
  change qualifies for the light tier or nothing changed since the last run.
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
   - **An nx error with zero tasks executed** → `typecheck: nothing affected`,
     and say which error. Nothing was compiled, so this is not `failed`
     either: the sync abort documented above exits non-zero with no compiler
     output at all, and routing it to `failed` would put "does not compile"
     in the pack's opening lines for a change that compiles.
   - **`No tasks were run`** → `typecheck: nothing affected`. Never
     `passed`: nothing was compiled. This is the ordinary case for a change
     that touches no nx project, such as one confined to `.claude/` or
     `docs/`.
   - **Exit 0, with tasks actually run** → `typecheck: passed`.

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
   `nothing affected` with the error named; any other error → `failed`.
   `stubbed` has no lint meaning — it is defined by a `noEmit`-disabled
   typecheck target — so lint never takes it. Without this, a clean lint and a
   lint that ran nothing are indistinguishable in the pack, and no reviewer
   may rebuild to tell them apart.

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
    change. That regeneration is deterministic and expected: name it as such
    rather than reporting it under `rewritten_by_checks`, which means a check
    rewrote the author's work.

    The typecheck and the lint were already settled in step 9. This step
    settles the tests in the same vocabulary — `No tasks were run` →
    `nothing affected`, exit 0 with tasks run → `passed`, an nx error with
    zero tasks executed → `nothing affected` with the error named, any other
    error → `failed` — and then aggregates the three.

    The run's `checks` is `failed` if any of the three is `failed`; `stubbed`
    if none failed but a project reported its typecheck target disabled for
    `noEmit` (those projects are in `uncovered`, recorded at step 9);
    `nothing affected` if none of the three is `passed`; otherwise `passed`.

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
    changed when they finish, and it is not the expected regeneration above,
    report it as rewritten by the checks.

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
Give, for lint and typecheck, the outcome in the same vocabulary step 9
settles each of them in (`passed`, `failed`, `stubbed`, `nothing affected`)
and the project count nx reported. Name any project whose target was a stub.
Tests are still running at this point, so say so rather than implying they
passed.

If the typecheck **failed**, put that in the pack's opening lines, above the
file list, with the first ~40 lines of the real compiler output. A change that
does not compile is the single most useful thing a reviewer can be told, and
burying it in a table at the bottom wastes the check. Spawn the reviewers
anyway — a type error is usually local and the rest of the review still has
value — but never let the pack read as though the change builds.

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
Phase 1 gets none of that paragraph — see there for what it does get.

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

**Nothing moved, entered or left, no outside anchor's value changed, and no
`--full`**: spawn no reviewers. Wait for the checks, then go to Phase 4 with
the stored findings (the engineer may have new decisions to record). With
`--full`, run Phases 1–3 over the whole change.

**Anything else**: first mark `moot` every finding **none of whose anchor
paths is outside the changed-file list**, and whose anchor files have all
left the change. That needs only the buckets, not a reviewer, and a finding
with no file left in the change must not stay open.

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
- **Populate it in Phase 4**, when the findings are known. For every anchor
  path of every stored finding that is not in the changed-file list, run
  `git hash-object -w -- <path>` and store the blob under that path. A path
  that no longer exists is recorded as `deleted`. Do not use
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
  size trigger, and it is not part of "the whole change" for the refresh
  rule. It decides which findings get re-judged, nothing else.

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

The new-defect pass depends on escalation, and two different things can
happen: the reviewer set can grow (**escalate**) or the review set can grow
(**widen**). Keep them apart — the refresh rule widens without escalating, so
listing it with the others would describe a run as escalated while it records
`tier: light`, and the breadth picker would then read the wrong list.

**Escalate** — run the full tier's reviewers — when any of these holds:

- a moved or entered file is on a critical path (step 7);
- the numstat lines of the moved files plus the entered files exceed
  `LIGHT_REVIEW_MAX_CHANGED_LINES`;
- the step-8 total exceeds `LIGHT_REVIEW_MAX_CHANGED_LINES` and no earlier run
  reviewed the whole change with the full tier (see the legacy default below);
- `--full` was passed.

**Widen** — review the whole change, at the full tier if any Escalate trigger
above also holds and otherwise at the tier step 8 picked — when this holds:

- none of the last `WHOLE_CHANGE_REFRESH_RUNS` runs with a recorded `breadth`
  other than `none` covered the whole change, and there are at least that many
  such runs (the refresh rule, below, which defines that set exactly — a
  legacy run with no `breadth` does not count, however much it reviewed).

`--full` and the whole-change-total trigger do both at once; their branch in
the picker says so.

`WHOLE_CHANGE_REFRESH_RUNS = 3`, a starting value to be tuned from pilot
data, like the other four tunable constants this skill declares:
`LIGHT_REVIEW_MAX_CHANGED_LINES` (step 8), `CALLER_LIST_MAX_FILES` and
`CALLER_LIST_MIN_NAME_LENGTH` (step 7), and `DOCUMENT_CHANGE_SHARE`
(Phase 3).

**The refresh rule, and what it actually costs.** A file that stops moving
drops out of the narrowed set, while the change keeps evolving around it — so
it is judged against behaviour that has since changed, by none of the
reviewers holding the ledger. The cold lane does re-read it, on every later
run that spawns anyone, and that is a genuine partial answer rather than a
full one: one reviewer, without the findings, is not the tier. The only way to
put the file back in front of the ledgered reviewers is to re-read everything
periodically, and this rule says so plainly rather than pretending to be
cleverer:

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
branch whose last `WHOLE_CHANGE_REFRESH_RUNS` runs were `breadth: none`
because the engineer re-ran only to record decisions. Both are the misfire the
legacy defaults below and formats.md exist to prevent, arriving through the
other trigger.

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

The whole-change-total trigger is the one the old `no earlier run's tier was
full` bullet was meant to be. Keyed on tier alone it could never fire after
run 1, since
every escalated later run records `full`; keyed on whether a **whole-change
full** run has happened, it still catches the change that crosses the
threshold in small steps — where no per-run delta is ever large enough.

Then pick the breadth, **first match wins**:

- **`--full`, or a total past the threshold with no whole-change full run
  yet**: record `breadth: whole change` and run Phases 1–3 over the whole
  change **with the full tier's reviewers**, whatever tier step 8 picked — a
  whole-change pass by one reviewer would record `tier: light`, which does not
  satisfy the whole-change-total trigger's disable condition and so leaves it
  firing forever.
- **The refresh rule**: record `breadth: whole change` and run Phases 1–3 over
  the whole change **with the full tier if any Escalate trigger also holds,
  otherwise the tier step 8 picked**. This branch deliberately does not force
  the full set on its own, but it must not *downgrade* a run either: because
  the picker is first-match-wins and this branch sits above the escalated one,
  a run whose inter-run churn exceeds `LIGHT_REVIEW_MAX_CHANGED_LINES` while
  its base-to-head total does not — the ordinary "author rewrites the new
  lines to fix findings" case — would otherwise land here and get one
  reviewer, recording `escalated: true` beside `tier: light`. Check the
  Escalate list before choosing the tier, not only step 8.

  The whole-change-total trigger cannot be stranded by a light refresh run:
  it needs the step-8 total to exceed `LIGHT_REVIEW_MAX_CHANGED_LINES`, so
  below the threshold it cannot fire and there is nothing to disable, and
  above it step 8 has already picked `full`. That argument covers only that
  trigger; the size-since-last-run trigger is why the sentence above exists.
  Forcing three reviewers unconditionally here would charge a small branch the
  full tier roughly every `WHOLE_CHANGE_REFRESH_RUNS + 1` runs.
- **Escalated on size since the last run, or on a critical path**: record
  `breadth: narrowed` and run Phases 1–3 with the full tier's reviewers, the
  review set narrowed to the moved and entered files, the per-file diffs plus
  the entered files as the diff.
- **Nothing moved or entered, but an outside anchor's value changed**: record
  `breadth: narrowed` with `reviewed: []`, and run the verdict pass over the
  findings whose outside anchors changed. There is no moved-or-entered set,
  so the non-cold reviewers receive nothing and `reviewed` must say so.
  **Phase 1 is still entered, for the cold lane** — which does receive the
  whole change, and `cold: true` is what records that. Do not write
  `breadth: whole change` here: that would tell the refresh rule a wide pass
  happened when the only reviewer who read the change was the unledgered one,
  suppressing the next genuine refresh for `WHOLE_CHANGE_REFRESH_RUNS` runs.
- **Not escalated**: record `breadth: narrowed`. The verdict lane also reviews
  the per-file diffs and the entered files for new defects, giving each a
  severity (merge-blocker or normal) and a confidence. Those defects then go
  through Phase 3 like any other. **Phase 1 is still entered, for the cold
  lane only** — it runs on every later run, and this branch is the one it was
  added for.

Every branch records a `breadth`, and no branch is reachable without one:
that is what "first match wins" over an exhaustive list buys. A run that
reaches the picker at all has spawned at least the cold lane, so no branch
here records `none`; `none` belongs to the two gates above.

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

**Which reviewers this phase spawns is the breadth branch's decision, not
this phase's.** Read the branch you took before spawning anything, or the
most common later-run path pays for the full tier it was routed away from —
and a refresh run buys nothing at all. The branches, in the picker's order:

- a **first run**, a **`--full` or whole-change-total** run, and a run
  **escalated on size or a critical path** spawn the tier's reviewers;
- a **refresh (widen)** run spawns the reviewers of whatever tier it recorded
  — the full three when an escalate trigger also held, otherwise
  `review-generalist`. It must not be routed to the cold lane alone: the
  rule's whole purpose is to put a long-unread file back in front of the
  **ledgered** reviewers, and the cold lane already reads every changed file
  on every later run, so a cold-only refresh costs a run and buys nothing;
- a **non-escalated** later run and an **outside-anchor-only** run enter
  Phase 1 for the cold lane alone, beside the verdict pass Phase 0b already
  described.

Spawn whichever reviewers that branch calls for with the `Agent` tool,
`subagent_type` set to the agent name, all in **one message** — the cold lane
included, so nothing waits on anything else. Each prompt carries the context
pack and, **except for the cold lane**, the scope hint — see below for the
five things that lane is not given. The agent definitions carry the method
and the
constraints: do not restate them, and do not split the reviewers into
non-overlapping lenses. Overlapping judgment is where divergent findings
come from.

**Never tell reviewers where you expect the defect to be.** State facts — what
changed, which files moved, what the checks did, what the intent is — and stop
there. A scope hint that names the risky area ("this round is corrections to
corrections", "every blocker so far came from the escalation rules, weight
your lanes accordingly") concentrates every reviewer on one place and licenses
them to skim the rest. The engineer's `$ARGUMENTS` hint is theirs to give and
passes through unchanged; the orchestrator adds no theory of its own. If you
believe an area is risky, review it yourself in Phase 3 rather than steering
four reviewers into it.

**From run 2 onward, one reviewer is cold** — on every later run that spawns
any reviewer at all, including a non-escalated one. That branch is the
ordinary fix-and-re-run and the sequence this lane exists to break, so it is
the last place to skip it: on a non-escalated run the cold lane is spawned
alongside the verdict lane, and Phase 1 is entered for it alone.

**The exception is the run that reviews nothing** — either gate in Phase 0b
taken in full, qualifiers included: nothing moved, entered or left, no
outside anchor's value changed and no `--full`; or files only left with no
outside anchor's value changed. Those spawn no reviewers by design and record
`breadth: none`; spawning a cold lane there would review a change nobody has
touched since the last run. Record `cold: false`.

Quote the gates whole or not at all. An earlier version named them by their
opening phrases — "nothing moved, entered or left" and "files only left" —
which dropped `--full` and the outside-anchor condition, so an explicit
`--full` re-run over the whole change with the full tier would have recorded
`breadth: none` and `cold: false`.

Spawn an extra `review-lane` whose dimension is the whole changed-file list —
**the whole change, not the narrowed set**, whatever breadth the run records.
That is the point of the lane, and it is why `reviewed` is scoped the way it
is: record `reviewed` as what the *other* reviewers were handed, and let
`cold` say that one reviewer saw everything. `reviewed` is therefore an upper
bound on what the non-cold reviewers opened, not on what every reviewer
opened — `formats.md` says the same.

**Give it the context pack minus the ledger** — the mandatory opening line,
the file list, the base SHA, the binding rules, the authoritative source,
`CALLERS OF CHANGED EXPORTS`, `CHECKS`, the CI-gap statement and the intent.
The opener and the CI-gap statement are required of *every* reviewer prompt,
and the lane told to read whole files and follow them through is the most
likely to reach for `git diff main...HEAD` to orient itself if nothing forbids
it.

**Not the per-file diffs.** They are named `run<N>__d<k>.diff` and captioned
"since run N", which announces both that earlier runs happened and exactly
which lines moved — the ledger and the scope hint, in one table. Give it the
files instead, as below.

**But the file list must carry each file's status**, added / modified /
deleted, as `git diff --name-status` gives it. A deleted file has no content
to read, so a lane handed only paths cannot see the largest absence in the
change — and absence is what this lane exists to find. Where the change
deletes a file, hand it that file's diff hunks specifically, under a name
carrying no run number.

**Strip the run number from everything else you hand it.** Every scratchpad
path is mandated to carry `run<N>__`, so the whole-change diff arrives as
`run<N>__local.diff` and a pack header saying which run this is arrives with
it. Either is the same disclosure the per-file diffs were withheld for, in
one token. Copy the diff to a run-agnostic name for this lane, or leave the
diff out and let it read the files; either way, no `run<N>` and no run count
reaches it.

Everything else in that list is required by its own agent contract: it is told
the pack is authoritative, that the check results are in it, and to judge a
defect against the base SHA. A bespoke three-item prompt would leave it unable
to satisfy the file it is spawned as, and would leave the one reviewer added
to catch structural defects as the only one not told whether the change
compiles.

Withhold five things: **the stored findings, the `refuted` list, "what changed
this round", any scope hint, and every run number.** Do not tell it the
change has been reviewed before.

**Render its intent without the withholding markers.** Everyone else gets
`[withheld: N<id>]` at each cut and a `withheld:` header, which exists so a
reviewer holding the ledger can reconcile the omission. For this lane those
markers announce that a ledger exists and point at the exact sentences it
covers — the scope hint banned two paragraphs above, in a different font. Cut
silently for the cold lane: it has no ledger to reconcile against, and a
finding it raises on withheld ground is deduplicated in Phase 3 like any
other.

Record `cold: true` on the run entry when it ran, `false` when it did not.

Run 1 needs none: with no ledger, every reviewer is already cold.

**Give it the files whole, not the diff, and ask it to execute them.** This is
what makes the lane worth its cost, and it is not the same instruction the
others get. Its brief is:

- **Read each changed file end to end**, as the thing it will be, not as a set
  of changed lines. A defect can be the *absence* of a connection — a value
  produced in one step that never reaches the step needing it — and absence
  appears in no diff hunk.
- **Follow the whole thing through once, in order**, as if executing it. Where
  is each output consumed? Which step reads something an earlier step never
  wrote? Which state can be produced that a later step cannot represent?
- **Check every stated reason.** Where the text says "we do X because Y", ask
  whether Y is true and whether it can even occur. A justification whose
  precondition cannot hold is a defect even when the rule it defends looks
  sensible.
- **Ask of any load-bearing claim: is this sentence true?** Not "was it
  changed", not "does the fix match the finding" — true, now, about this
  repository.

Give it an explicit output instruction, or it inherits `review-lane`'s
400-word default — the tightest cap in the set, on the one reviewer asked to
read every file end to end. One line per finding, no word limit, same as the
verdict pass.

The ledger is handed to the others so they report a known defect by its id
instead of as new. That convenience costs something, and the cost is the
reason this lane exists: a reviewer holding a hundred findings reads the text
they cover as already accounted for, and asks whether each fix landed rather
than whether the rule was ever right. A sentence can carry several closed
findings and still be false. Deduplicating a cold reviewer's repeats is cheap
and already specified — Phase 3 step 2 merges a defect matching an open
finding into it — so the only thing lost is a little volume, and the thing
gained is the one reviewer who can still see the obvious.

The three defects that prompted this lane were all of the kinds above, and all
were found from outside after a loop reported clean: a rule whose stated cause
was simply untrue, a check whose result reached no reviewer because the step
that computed it ran after the pack was built, and a cost justified by a
trigger that could not fire in the case it was justifying. None is visible
from a diff; each is obvious to someone reading the whole thing once.

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

Then write `outside_anchors`. It is **rebuilt each run, not updated in
place**, so there is one rule and no drift between what is added and what is
dropped: walk every stored finding's `anchors`, take each path that is not in
the changed-file list and is not `PR.md` or under `.pre-review/`,
`git hash-object -w -- <path>` it, and store the blob under that path
(`deleted` if the file is gone). What the walk does not produce is not in the
map. That retires a path no finding anchors any more, and equally a path that
has since entered the change — which an incremental update would leave behind
with a stale blob, so the same finding would be routed to the verdict pass
twice, once as a bucket and once as an outside anchor. This is the one place
the map is written, because it is the first point at which both the findings
and the changed-file list are settled.

**Only findings raised while this map existed are eligible, and only findings
that are still live.** Skip every `moot` finding: its anchors have all left
the change by definition, the verdict pass excludes `moot` so those entries
can never route anything, and the no-spawn gate reads the whole map — so a
retired finding's stale anchor would spawn a reviewer pass over nothing the
next time anyone edits that file. Then take a finding's anchors into the walk
only if it was raised in a run whose `n` is at or after the first run written
by a state with `version: 2` and an `outside_anchors` key.

Key it on that, not on whether the run entry *records* `cold`: `formats.md`
tells a reader to treat an absent `cold` as `false`, so an orchestrator that
normalises the state before walking it resolves a value for every legacy
entry and the presence test can never fail. A guard that cannot fail admits
everything. Phase 0b
forbids backfilling because an anchor absent from `files` is equally a genuine
outside anchor and a file that was in the change and later left, and this walk
applies that same ambiguous test; without the guard, the first run after this
ships would populate the map with exactly what that rule refuses to
reconstruct, and `left` does not reach the map, so a finding whose cause the
author removed would be pinned open.

For the run entry: `tier` is the reviewer set that actually ran, and `breadth`
with `reviewed` is the review set they were actually given — `whole change` or
`narrowed` with the paths, or **`none` with `reviewed: []` when this run
spawned no reviewers at all** — that is, when one of Phase 0b's two gates was
taken, each with all four of its qualifiers. Do not paraphrase them as
"nothing moved, or files only left": that short form is what let a `--full`
run record `breadth: none`, and this is the step where the value is actually
written.

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
  it needs no PR. This needs the PR number, which only the engineer has, so
  it comes
  from `--pr <n>` and nowhere else: do not go looking, and **skip the check
  rather than ask**. Asking mid-run costs more than the check is worth — a
  typed reply ends the turn holding the pre-approved commands, so every
  command after it prompts. Note that it reads the last *pushed* body, so it
  confirms the previous description, not the one just written.

No reviewer can do either for you: reviewers read the description as a
Markdown file, which is the one context where none of this happens.

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
  `stubbed` typecheck**: say which, plainly, and name the projects a stub
  left unchecked, or the workspace packages a module-not-found suggests are
  unbuilt in this clone.
- **What this run cost**: one line per reviewer — name, tokens, tool calls,
  duration — from the completion notifications you actually received, then the
  run total and the count of stored runs. Report only figures a notification
  carried; write "not reported" rather than estimating, or the footer stops
  being a measurement. State that it covers subagents only and excludes the
  orchestrator, which you cannot see.

  This is here because the cost is otherwise invisible until someone adds it
  up afterwards. A branch that has run many times, with each run finding less
  than the one before, is paying for reassurance; the numbers are what make
  that visible while there is still a decision to make.

**Say what a quiet run means, and what it does not.** This qualifies the
bullets above; it does not replace their wording. When the "nothing open"
bullet fires, print its instruction **and** this qualification, in that order
and as one closing statement — not two competing verdicts:

> `PR.md` is ready: commit, push, and open the PR with it as the body. That
> means this loop found nothing further, not that the change is safe to
> merge — CI and human review have not run yet.

The distinction is the point. A quiet run means the reviewers you spawned,
holding the ledger you gave them, stopped finding things; it says nothing
about the classes they were never pointed at. Name what ran, and name what has
not.

This is not a hedge. A `/pre-review` loop on this skill's own branch ran seven
times, found twenty-one merge-blockers, reported clean — and a bot review on
the opened PR immediately found a merge-blocker in the check this skill had
just added, because it read a sentence the ledger had taught every other
reviewer to treat as settled. The cold reviewer above exists for that class;
this paragraph exists because no reviewer set closes it entirely.
