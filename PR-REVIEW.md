<!-- prcombolocal-snapshot v1
base: a92d0c2d49b9428937403765f74dc3a6299b06de   head: a92d0c2d49b9428937403765f74dc3a6299b06de   branch: chore/pre-review-typecheck-reporting
reviewed-at: 2026-09-24T14:05:00Z   pr-md: present
mode: full
checks: nx affected lint,test — nothing affected (no project matched the changed paths; real invocation, not a cache replay)
files:
  a1dfd448524c77c11135daef725f5aca3b9526c4 .claude/agents/review-generalist.md
  e2e7f952518a616fee18be7bc9a0e21f146a5cd2 .claude/agents/review-lane.md
  543a4cae7dc29653f5c24e82802009ce68c05e0d .claude/agents/review-panel.md
  d17b46a832332d68ec5f5c6a4afcd856cef17885 .claude/agents/review-tracer.md
  b7003c80571276145e62467dafb099849a6d0bec .claude/skills/pre-review/SKILL.md
  98d0e6ae32add4f3fa2bf025d6643a45858856c5 .claude/skills/pre-review/formats.md
  a4309941199e2cd8d4e2c8b9dd43ff54ec25d306 docs/pre-review.md
-->

# Pre-PR review — chore/pre-review-typecheck-reporting

**24 findings · 7 merge-blockers · lint and tests: nothing affected (no project matched; nothing was linted, compiled or tested).**

Every finding below was re-derived against the files by the orchestrator. Three independent reviews ran; only two of the seven merge-blockers were found by more than one of them, and the most consequential was found by one.

The change has no automated evidence behind it: `nx affected` matched no project, so no finding here is settled by a test and none could be. Everything rests on reading.

---

## Merge-blockers

### 1 — The cold lane is handed the full findings ledger through the intent, on every later run. `SKILL.md:127-135`, `921-923`, `123-125` + `formats.md:212-228`

This nullifies the headline feature of the PR. Step 6 sources the intent from `.pre-review/<key>.md`, which step 6 itself creates by saving `PR.md` verbatim (`:123-125`), and mandates pasting it into the pack **"verbatim, not condensed"** with exactly one exclusion — "Not in this PR" entries matching an open `follow-up` finding. `formats.md:212-228` defines section 6 of that same file as the collapsed Pre-review record: the full findings table, the snapshot line, and a summary reading `Pre-review: 63 findings · 59 fixed · …`. Line `921-923` then gives the cold lane "the intent".

So the reviewer defined at `:949-951` as withholding "the stored findings … and every run number", under the heading **"Do not tell it the change has been reviewed before"**, receives every stored finding, the run count, and `reviewed-at` — in the one component it is explicitly required to be given. The run-number strip at `:934-940` is defeated in the same stroke. On this branch that means handing the cold lane a 63-row table.

The parenthetical at `:127` ("what the change is for, what is deliberately out of scope") can be read as naming sections 1–5, which is presumably the intent; but the operative verb is "Paste **it**", the referent is the file, and the author enumerated one exclusion without reaching this one. **Fix:** state in step 6 that the intent is sections 1–5 and never the Pre-review record, and repeat the exclusion at `:921-923`.

*Confidence: high. Verified by reading all four passages and the generated `PR.md` on this branch.*

### 2 — `--full` is a silent no-op when files only left the change. `SKILL.md:561-566`

The first gate is qualified "and no `--full`" and carries an explicit `--full` branch (`:556-559`). The second — "If files only left **and no outside anchor's value changed**, stop there" — carries neither, and it is evaluated before the escalate list and the breadth picker ever run. So `/pre-review --full` on a run whose only delta is a file leaving spawns nobody and records `breadth: none`, `cold: false`, despite `:22-23` defining the flag as forcing the full set "even when … nothing changed since the last run". Phase 1 faithfully propagates the omission (`:900-905`), and `docs/pre-review.md:73-74` asserts the opposite: "so does `--full`, so neither is a free no-op". This is precisely the defect `:907-911` says an earlier version had and this change fixed — surviving on the other gate. **Fix:** add the qualifier and the escape to the second gate, then requote in Phase 1 and the doc.

*Confidence: high. Verified by reading both gates, Phase 1's re-quotation, and the doc.*

### 3 — Phase 1 routes a refresh run to the cold lane alone, emptying the refresh rule. `SKILL.md:869-874` vs `788-795`, `712-720`

Phase 1's new routing sentence enumerates three cases: "A first run and an escalated later run spawn the tier's reviewers; a non-escalated later run and an outside-anchor-only run enter Phase 1 for the cold lane alone." A refresh run is *by construction* non-escalated — `:682` says "the refresh rule widens without escalating" — so it lands in the second group and spawns no `review-generalist`. The picker's refresh branch says the opposite: "run Phases 1–3 over the whole change **with the tier step 8 picked**" (`:788-789`).

The consequence is not cosmetic. The rule's stated purpose at `:717-719` is that "the only way to put the file back in front of the **ledgered** reviewers is to re-read everything periodically" — and under Phase 1's routing the only reviewer who reads the whole change is the cold lane, which is unledgered and already does so on every later run. The rule would cost a run and buy nothing. **Fix:** add the widen branch to Phase 1's enumeration explicitly.

*Confidence: high. Verified by reading the routing sentence, the picker, and the Widen list.*

### 4 — The refresh branch downgrades a size-escalated run to one reviewer. `SKILL.md:695-696`, `788-795` vs `686-693`, `796`

The Widen rule says the refresh rule reviews the whole change "at whatever tier **the rules above** picked" — the rules above being the Escalate list. The picker's refresh branch instead says "with the tier **step 8** picked", computed over the whole change from base, ignoring every escalation trigger. These diverge on escalate trigger 2 (`:689-690`, moved + entered numstat over the threshold) whenever the inter-run churn exceeds the threshold but the base-to-head total does not — the ordinary "author rewrites the 140 new lines to fix six findings" case. Because the picker is first-match-wins (`:780`) and refresh sits above the escalated branch (`:796`), such a run takes the refresh branch and gets `review-generalist` plus the cold lane, while recording `escalated: true` beside `tier: light` — the exact state `:682-684` introduced the escalate/widen split to make impossible. The branch's own defence at `:790-793` addresses only the whole-change-total trigger and is silent on this one. **Fix:** take the full tier in the refresh branch when an escalate trigger also holds, or move the branch below `:796`.

*Confidence: high. Verified by reading both trigger lists and tracing the picker's order. Found independently by two reviews.*

### 5 — The moot sweep retires pre-existing mixed-anchor findings that the no-backfill rule protects. `SKILL.md:561-563` vs `633-639`

The sweep now marks `moot` "every finding that **has no outside anchor** and whose anchor files have all left the change". Read immediately after the `outside_anchors` map is defined, "has no outside anchor" means "has no entry in that map" — and `:633-639` mandates the map start empty and never be backfilled, so *every* finding raised before this ships has no entry. A legacy finding with one anchor in the change and one on an untouched caller is therefore mooted the moment the changed anchor leaves, while `:637-639` states it "keeps its stored status until one of its files enters the change, or you judge it by hand." The two rules contradict each other outright.

The diff makes the regression explicit: this change **deleted** a rule written for exactly this shape — "the answer is undefined for a file that was never there. Treat it as **not** all left, so the finding is not mooted" (`local.diff:467-470`) — and replaced it with a test that cannot see legacy findings. That produces "closes wrongly", which `:627-631` names as the worst of the four defects this redesign was meant to eliminate. **Fix:** say "no anchor path outside the changed-file list" rather than "no outside anchor", and restore the not-all-left rule for paths never in `files`.

*Confidence: high. Verified by reading both passages and recovering the deleted rule from the diff.*

### 6 — The CI-silence rule is justified by a pack opener this change deleted, and forbids the `--ci` passthrough the change adds. `SKILL.md:514-516`

The paragraph reads "its opening line tells reviewers there is no PR and forbids `gh`, so a CI report in the same pack would contradict the instruction directly above it." Both halves are now false: `:468` rewrote the opener to "this is the working tree, not a PR", and `:502-503` says in terms that nothing establishes whether a PR exists. Worse, its conclusion contradicts `:505-506` four lines above, which *requires* passing `--ci "<summary>"` results into the pack attributed. An orchestrator treating this paragraph as binding drops one of the three `/prcombo` ports the PR is built to add. **Fix:** delete the paragraph; `:500-506` already carries the sound reason.

*Confidence: high. Verified by reading all three passages — the contradiction is internal to one new hunk. Found by all three reviews.*

### 7 — `formats.md`'s default for `cold` defeats the `outside_anchors` eligibility guard. `formats.md:95-98` vs `SKILL.md:1147-1155`

The Phase 4 walk admits a finding only if it "was raised in a run whose entry **records** `cold`" — a *presence* test, used as a version marker for when the map began. `formats.md:98` then says of that field: "Absent on runs written before it existed; **read that as `false`**." An orchestrator normalising the state first resolves a value for every legacy entry, so the presence test can never fail, every pre-existing finding is admitted, and the map is populated with exactly the anchors `:633-639` refuses to reconstruct. `:1152-1155` names the resulting failure itself: `left` never reaches the map, the moot sweep cannot retire the finding, and a defect the author already removed is pinned open for the life of the branch. **Fix:** key the guard on an explicit version or key test, and say in `formats.md` that the `false` default answers the audit question only, never the gate.

*Confidence: high. Verified by reading both files. Found independently by two reviews.*

---

## Normal

### 8 — Three "fourth trigger" references point at `--full` after the list lost a bullet. `SKILL.md:774`, `786`, `791` vs `686-693`

Moving the refresh rule into its own Widen list left the Escalate list with four bullets, making the whole-change-total trigger the **third**. All three call sites describe that trigger — "the old `no earlier run's tier was full` bullet", "the fourth trigger's disable condition", "the fourth trigger needs the step-8 total to exceed `LIGHT_REVIEW_MAX_CHANGED_LINES`" — while naming bullet 4, which is `--full` and has neither a disable condition nor a threshold. A reader checking `:791`'s reasoning finds nonsense and either discards a load-bearing justification or edits the wrong rule. **Fix:** name the trigger, not its position.

*Confidence: high. Verified by counting the current list and recovering the old ordering from the diff.*

### 9 — The typecheck verdict list is neither ordered nor scope-consistent, so a stub plus a real type error has two answers. `SKILL.md:351-366`, `481-484`

Bullet 2 is scoped to a *project* ("that project is `stubbed`, whatever the exit code"); bullets 1, 3, 4 and 5 are scoped to the *run*. No aggregation rule joins them and no first-match-wins is declared, unlike the breadth picker at `:780`. A run where one project stubs and another emits real compiler errors matches both bullet 2 and bullet 5. Because the pack carries step 9's single word (`:478`), the run can report `typecheck: stubbed` for a change that does not compile, and the "put it in the pack's opening lines" rule keys on `failed`, a word never produced — reintroducing the false green this step exists to prevent. The milder form of the same defect: five clean projects and one stub reads as `stubbed`, understating what ran. **Fix:** declare the list first-match-wins with `failed` ahead of `stubbed`, and report a stub as a qualifier (`passed, with <project> stubbed`) rather than instead of the verdict.

*Confidence: high. Verified by reading the list and the CHECKS requirement.*

### 10 — The `checks` aggregation's third clause is logically identical to the wording it rejects, and its worked example is false. `SKILL.md:443-458`

The rule is "`nothing affected` if none of the three is `passed`; otherwise `passed`", defended by: it is *not* "none of the three ran a task", because under that wording a `tools/eslint-config`-only change "lints clean, compiles nothing, and records `passed`". But under the endorsed wording lint *is* `passed`, so the clause does not fire and the run records `passed` anyway. The two wordings can never differ: once the `failed` and `stubbed` clauses have been applied, each verdict is `passed` (tasks ran, exit 0) or `nothing affected` (no tasks), so "none is `passed`" and "none ran a task" are the same predicate. The example argues for neither.

Severity note: two reviews called this a merge-blocker and one did not. I side with the one. `:455-458` openly defines `passed` as "everything that ran, ran clean" and requires naming what went unchecked, so this is a false justification rather than a false green — but it is the kind that gets the clause "fixed" wrongly. **Fix:** delete the example, or gate the word on the typecheck, which is what it claims to do.

*Confidence: high. Verified by enumerating the reachable verdict tuples.*

### 11 — A vanished outside anchor is routed to be "judged from the stored blob", which no permitted command can read. `SKILL.md:608-611` vs `662-670`

Line `:611` sends a vanished anchor to the verdict pass to be judged from the stored blob. Lines `:664-667` say the opposite and give the reason: `allowed-tools` carries `git cat-file -e` for existence "and nothing that reads blob content". The front matter (`:6-17`) confirms it — no `cat-file -p`, no `git show`. The branch either dead-ends or emits a command matching no permission rule and prompts mid-run, which `:82-84` singles out as the thing that breaks every pre-approved command after it. **Fix:** make `:611` match `:662-670` — name the gone anchor, judge from `detail` and the remaining anchors.

*Confidence: high. Verified against the `allowed-tools` front matter. Found independently by two reviews.*

### 12 — The Phase 4 `outside_anchors` walk is not pruned by status, so a dead `moot` finding can trip the no-spawn gate. `SKILL.md:1134-1140` vs `558`, `647`

The walk takes "every stored finding's `anchors`" with only a path filter and the eligibility guard — no status filter. A `moot` finding's anchors have all left the change by definition, so they are hashed into the map and re-hashed on every later run. The send list at `:647` excludes `moot`, so those entries can never route anything, but the gate at `:558` reads "no outside anchor's value changed" across the whole map. Editing a file some long-retired finding once anchored on therefore spawns a reviewer pass with nothing to review, and the picker's fourth branch (`:800-808`) runs a verdict pass over an empty set while spawning the cold lane. **Fix:** exclude `moot` findings from the walk, matching the send list.

*Confidence: high. Verified by tracing the map's three consumers. Found independently by two reviews.*

### 13 — Step 9 routes on output and exit status that only step 10 tells you to capture. `SKILL.md:346-366` vs `424`

Step 9 gives both nx commands bare, then routes on `No tasks were run`, "an nx error with zero tasks executed", and "the first ~40 lines of real compiler output". The instruction "Redirect each run's output to a WORK file and read nx's own exit status" sits at `:424`, inside step 10 — after the step that depends on it, and after the pack is built. An orchestrator reading in order pipes or eyeballs the output and reads a pipeline's exit status, which is the failure mode step 10 documents. **Fix:** move that sentence to step 9, before the first command.

*Confidence: high. Verified by reading both steps.*

### 14 — The `left`-anchor justification names a case the second gate never lets reach it. `SKILL.md:647-654` vs `564-566`

`left` was added to the verdict-pass send list because "when the author reverts the changed end, that anchor leaves while the outside one hashes unchanged, and without `left` no rule would send the finding anywhere". But that state — an anchor left, no outside anchor changed, nothing moved or entered — is exactly the second gate's condition, which stops before the verdict pass. The finding is neither mooted (it has an outside anchor) nor judged, so it stays open for the life of the branch: the outcome the rule was written to prevent. `left` still does work when some *other* file moved, so the rule is not dead — its stated reason is false, which a later reader will trust. **Fix:** resolve with finding 2; the files-only-left exit must not fire while a non-`moot` finding has a `left` anchor.

*Confidence: high. Verified by tracing both gates against the send list. Found by two reviews; they disagreed on severity, and the behavioural half is covered by finding 2.*

### 15 — Phase 1 tells you to give every reviewer the scope hint, cold lane included, and only corrects it 70 lines later. `SKILL.md:877-879` vs `949-951`

"all in **one message** — the cold lane included … Each prompt carries the context pack and the scope hint" reads over every reviewer just spawned. `:949-951` then withholds the scope hint from the cold lane among five things. An orchestrator acting on the first sentence hands it over before reaching the correction. **Fix:** qualify at `:879`.

*Confidence: high. Verified by reading both passages.*

### 16 — Phase 4 and `formats.md` quote the no-reviewer gates by the abbreviation Phase 1 bans. `SKILL.md:1160`; `formats.md:116-117`

Both gloss `breadth: none` as "(nothing moved, or files only left)", dropping the `--full` and outside-anchor qualifiers. Phase 1's "Quote the gates whole or not at all" (`:907-911`) names that exact short form as the one that produced a `--full` run recorded as `breadth: none`. Phase 4 is where the value is actually written, so it is the form an orchestrator acts on — and it is the same abbreviation behind finding 2. **Fix:** requote in full, or point at the gates rather than paraphrasing.

*Confidence: high. Verified against Phase 1's ban. Found independently by two reviews.*

### 17 — `formats.md` still calls the refresh rule an escalation trigger. `formats.md:119`

"**`breadth` is what both escalation triggers read**" — but `SKILL.md:682` now insists the two be kept apart, and `SKILL.md:1162` states it neutrally as "`breadth` is what both triggers read". A reader taking `formats.md` at its word treats a refresh run as an escalation and records `escalated: true` with `tier: light`, the state the split was written to make impossible. **Fix:** drop "escalation".

*Confidence: high. Verified by cross-checking both files.*

### 18 — `escalated` is leaned on by a justification and present in the example, but no phase writes it and no table defines it. `formats.md:29`; `SKILL.md:684`

`SKILL.md:681-684` justifies the escalate/widen split by the record it avoids ("a refresh run record `escalated: true` beside `tier: light`"), and `formats.md:29` carries `"escalated": false` in the state example — but the value table omits it, no field bullet describes it, and Phase 4's record instructions never tell you to write it. As written it is a field the justification depends on that nothing produces. **Fix:** document it or drop it from the example.

*Confidence: high. Verified by grepping both files for every occurrence.*

### 19 — `review-generalist` is told it is the sole reviewer on runs where it no longer is. `review-generalist.md:14`, `22`

"In the light tier you are the only reviewer, so a premature return reads as 'no findings'" and "On a light-tier run you are the sole reviewer" were true before this change. The cold lane now runs on every later run that spawns anyone (`SKILL.md:894-898`), and the refresh branch can run the light tier over the whole change, so a light later run has the generalist, the verdict lane and the cold lane. The second instance matters more: it is the stated justification for the generalist reviewing untouched callers. **Fix:** scope both to a light *first* run.

*Confidence: high. Verified against the cold-lane spawn rule.*

### 20 — Two agent contracts assert the tree is dirty; this change adds the paragraph saying that premise is unsound. `review-tracer.md:56-57`, `review-generalist.md:54-55`

Both read "The change **is** uncommitted and exists in one place only." `SKILL.md:508-512` — a `+` hunk in this diff — states that "nothing forces the tree to be dirty" and that a run on a clean tree is a documented workflow. `review-lane.md:27-28` already says "**may be** uncommitted". The contract lines are unchanged context, but the new paragraph is what makes them wrong, and the rule they support — never touch the index — is the one rule that must not rest on a false premise. **Fix:** "may be", matching `review-lane.md`.

*Confidence: high. Verified against the new paragraph and the diff.*

### 21 — Phase 3's one mandated verification command is not in `allowed-tools`. `SKILL.md:1043-1047`, `829` vs `6-17`

Both sites direct you to settle a finding with `pnpm --filter <package> exec vitest run <file>`. The front matter carries `pnpm nx affected *` and nothing else for pnpm, so that command matches no rule and prompts — which `:72-76` and `:82-84` both single out as the thing to avoid mid-run. **Fix:** add the form to `allowed-tools`, or say the prompt is accepted here deliberately.

*Confidence: high. Verified against the front matter.*

### 22 — `docs/pre-review.md` states only one of the skill's two no-reviewer gates. `docs/pre-review.md:71-74`

The doc says a re-run "spawns nobody only when nothing at all has moved". `SKILL.md:564-566` defines a second gate — files only left, no outside anchor changed — which also spawns nobody. An author who only deletes files reads the doc as promising a review and gets none. The doc is also the only place an engineer learns when a re-run is worth paying for. **Fix:** describe both gates, and restate the `--full` claim once finding 2 is settled.

*Confidence: high. Verified against the skill. Found independently by two reviews.*

### 23 — The two flags this change adds are absent from the user-facing doc. `docs/pre-review.md` (whole file)

`SKILL.md:24-25` adds `--pr <n>` and `--ci "<summary>"`, and `:1211-1214` makes `--pr` the *only* source of the PR number, with the orchestrator told to "skip the check rather than ask". A reader of the doc never learns either flag exists, so Phase 5's rendered-body check is unreachable in practice and `--ci` is never supplied. **Fix:** document all four in Workflow.

*Confidence: high. Verified by grep. Found independently by two reviews.*

### 24 — "the same four words" is wrong for lint and for tests, and the same page says so. `SKILL.md:368`, `437-441`, `481`

Line `:368` promises lint is settled "in the same four words", then `:369-371` lists three outcomes and `:372-373` states "`stubbed` has no lint meaning … so lint never takes it". `:437-441` does the same for tests. Harmless to execute, but it is repeated three times and quoted in the PR description, so it will be copied forward. **Fix:** "the same vocabulary", noting `stubbed` is typecheck-only.

*Confidence: high. Verified by reading all three sites.*

**Also noted, lower confidence:**

- **The flag-parsing rule cites a Phase 1 ban Phase 1 does not impose.** `SKILL.md:33-35` says a bare `2615` "would reach four reviewers as a directive, which is the steering the Phase 1 rule bans", but `:889-890` says the opposite about engineer input: "The engineer's `$ARGUMENTS` hint is theirs to give and passes through unchanged." The real reason is that a bare number is useless as a hint and unrecoverable as a value. "Four reviewers" also matches no documented set (a full first run is three; a full later run is five). *Verified by reading both; medium-high.*
- **The cold lane may be handed no diff, making deletions invisible.** `SKILL.md:938-939` offers "leave the diff out and let it read the files", and `:966` prefers it. A deleted file has no content to read, so the one reviewer asked to find "the *absence* of a connection" cannot see the largest absence in the change. *Medium confidence — depends on whether the file list carries `name-status`.*
- **Phase 5's after-push check cannot observe what it exists to check.** `SKILL.md:1209-1216` reads the posted body with `gh pr view <n> --json body --jq .body` "and confirm the rendering matched", to catch GitHub autolinking `#97`. That field returns the raw stored Markdown; autolinking is render-time and leaves the body byte-identical. The command can confirm the upload, never the rendering. *Verified by reasoning about the `gh` field, not by consulting the docs — treat as UNVERIFIED against an authoritative source.*
- **`review-lane`'s contract does not enumerate the cold-read role.** `review-lane.md:3`, `7-10` name two roles under "Do exactly the deliverables in your prompt, nothing more", while `SKILL.md:942-947` explicitly relies on "its own agent contract" to carry what the cold lane needs. *Medium confidence — the lane arguably fits "a single review dimension".*

---

## PR.md conformance

`PR.md` is accurate on most of its specific claims. Three do not survive the diff:

- **"the pack minus the stored findings, and no hint that the change has been reviewed before"** — falsified by finding 1. The cold lane receives the stored findings, the run count and the reviewed-at timestamp through the intent. This is the PR's headline claim about its headline feature.
- **"Lint and the tests are settled in the same four words"** — false for both. Lint has three outcomes and `SKILL.md:372-373` says so explicitly; tests have three at `:437-441`. See finding 24.
- **"0 open (0 merge-blockers)"** in the Pre-review record — that records the state of the `/pre-review` loop, not of the change. This review finds seven merge-blockers. The summary line is about to be published as the PR description.

Verified as supported by the diff: the typecheck verdict moves to step 9 (`:346-348`); `No tasks were run` → `nothing affected`, never `passed` (`:351-352`); the pack must carry a `CHECKS` section (`:478`); `outside_anchors` is written in Phase 4 (`:1134`) and compared at the start of Phase 0b (`:598`); `--pr` and `--ci` are flags with no positional readers (`:24-25`, `:1211`); the Close reports per-reviewer cost (`:1253`); `checks nothing affected` matches what the run actually did; `files=7` matches the review set.

The three "Not in this PR" items and the four "Approaches" rejections were treated as settled and not re-litigated.

---

## Refuted

- **"The refresh branch's tier choice is safe because step 8 already forces `full` on a critical path."** True for the critical-path trigger, and it does not rescue the size trigger — which is why finding 4 stands. The narrower claim is correct and is not a defect.
- **"`files`, `files=` and `files-sha256=` are three views of one map, so a path added to `files` is erased by the next `record`."** Reported as a possible overstatement; it is true as written — `snapshot.mjs record` builds all three from `changedPathsInWorktree(base)` in one pass.
- **"The `outside_anchors` design should hash outside anchors into `files`."** `PR.md` records this as tried and replaced, with the reason; not re-raised.

---

## Verified clean

- Every in-repo fact the new text asserts checks out: `nx.json` gives `test` (not `typecheck`) `dependsOn: ["^build"]`; `babylon-proto-ts`'s `build` → `build-proto` → `git clone` with a tracked `src/generated`; the wasm fan-out behind the docs' project counts.
- The `N<id>` convention is consistent across the withholding markers, Phase 5 and `formats.md:206-211`; no `#<id>` survives.
- `checks: "not run"` is gone from both files, with a documented read rule for stored values.
- The finding-status enumeration, the five summary terms and the outcome cascade agree between `SKILL.md` and `formats.md`.
- The cold lane collides with no reviewer cap: `review-panel.md:16` bounds only the panel's own lanes, and `formats.md:87-94` deliberately excludes it from the tier test.
- No CLAUDE.md critical path, `copy.ts`, motion or test-philosophy rule is touched.

---

## Checks

`pnpm nx affected -t lint,test --files=<the 7 paths> --skip-nx-cache` → `NX No tasks were run`, exit 0. A real invocation, not a cache replay.

**Nothing was linted, compiled or tested.** No nx project claims `.claude/**` or `docs/**`, so the run is `nothing affected` — not `passed`. This is the distinction the change under review introduces, and it is the correct reading of its own rule.

Not covered by anything in this run:
- Any behavioural check of the skill. These files are executed by an agent; there is no test harness for them in this repo, and every finding above rests on reading.
- No review dimension was lost. All three reviews reported, and the third collected all four of its own subagents.

---

## Run stats

| Reviewer | Tokens | Tool calls | Duration |
| --- | --- | --- | --- |
| `/prcodereview` | 143,977 | 19 | 5m 22s |
| `/rtpr` | 173,057 | 25 | 7m 57s |
| `/prsub` | 161,537 | 18 | 8m 29s |

Subagents spawned: **3 top-level + 4 children + 0 grandchildren = 7**. `/prsub` reported 4 children, exactly its cap, none nested — no budget breach.

Total across the three top-level reviewers: **478,571 tokens**. The four children's usage was **not reported** to this session — `/prsub` did not carry per-child figures, and there is no way to tell from the notifications whether its 161,537 already nests them or excludes them. The true total is therefore 478,571 at minimum, with an unknown addition if the children's usage is additive rather than nested. No figure here is estimated.

This covers **subagents only and excludes my own usage as orchestrator**, which on this run was substantial: every one of the 24 findings was re-derived against the files before being written down.
