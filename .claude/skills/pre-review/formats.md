# `/pre-review` formats

Reference for [SKILL.md](SKILL.md): the state file, the snapshot line and the
PR description.

## State file: `.pre-review/<key>.json`

`<key>` is the branch name with `/` replaced by `__`. The file is JSON; the
example below is valid as written.

```json
{
  "version": 2,
  "branch": "feat/x",
  "base": "<merge-base sha>",
  "intent": "<one paragraph: what the change is for, what is out of scope>",
  "files": {
    "<path>": "<blob sha>",
    "<deleted path>": "deleted"
  },
  "outside_anchors": {
    "<path a finding anchors but the change does not touch>": "<blob sha>"
  },
  "outside_anchors_since": 4,
  "runs": [
    {
      "at": "<iso8601>",
      "kind": "first",
      "tier": "light",
      "breadth": "whole change",
      "reviewed": ["<path>"],
      "cold": false,
      "input_key": "<key captured with the step-9 snapshot>",
      "checks": "nothing affected",
      "rewritten_by_checks": [],
      "reviewers": [
        {
          "name": "review-generalist",
          "completed": true,
          "tokens": 117880,
          "tool_calls": 28,
          "duration_s": 547
        }
      ],
      "uncovered": []
    }
  ],
  "findings": [
    {
      "id": 1,
      "claim": "<one line>",
      "anchors": ["<path>:<line-range>", "<other path>:<line-range>"],
      "detail": "<2-6 sentences: what, why wrong, failure, fix>",
      "severity": "merge-blocker",
      "confidence": "high",
      "verified_by": "code",
      "status": "open",
      "status_note": "<what remains, where it was fixed, or 'regressed'>",
      "decision": "fix now",
      "decision_note": "<how / the follow-up / the reason>",
      "raised_in_run": 1
    }
  ],
  "refuted": [
    {
      "claim": "<one line>",
      "evidence": "<what killed it>"
    },
    {
      "id": 5,
      "claim": "<a stored finding that new evidence disproved>",
      "evidence": "<what killed it>"
    }
  ]
}
```

The enumerated fields take these values:

| Field                    | Values                                            |
| ------------------------ | ------------------------------------------------- |
| `runs[].kind`            | `first`, `later`, `final`                         |
| `runs[].tier`            | `light`, `full`                                   |
| `runs[].breadth`         | `whole change`, `narrowed`, `none`                |
| `runs[].checks`          | `passed`, `failed`, `aborted`, `stubbed`, `nothing affected` |
| `findings[].severity`    | `merge-blocker`, `normal`                         |
| `findings[].confidence`  | `high`, `medium`, `low`                           |
| `findings[].verified_by` | `code`, `test`, `external source`, `unverified`   |
| `findings[].status`      | `open`, `partially fixed`, `fixed`, `moot`        |
| `findings[].decision`    | `fix now`, `follow-up`, `decline`, `undecided`    |

- **Ids** are plain integers that never repeat: a later run continues from the
  highest id in `findings` and `refuted` together. A regression reopens its
  old id. A stored finding moved to `refuted` keeps its `id` there, so the
  id is never given to another finding.
- **`runs[].tier`** records the reviewer set that ran. It is `full` only when
  `review-generalist`, `review-tracer` and `review-panel` all ran. Otherwise
  it is `light`. A final run uses one `review-lane`, so its tier is `light`.
- **`runs[].cold`** is `true` when the independent reviewer ran. It is
  `false` on ordinary new runs. Read an absent value as `false`. Older
  `cold: true` runs are history, not evidence of final completion.
- **`runs[].input_key`** binds review and checks to the exact inputs. Capture
  it with the step-9 snapshot, after foreground lint and typecheck but before
  reviewers and background tests. Recompute it after work ends. If it
  changes, do not claim that the result covers the new inputs.
- **`runs[].reviewers[].completed`** is `true` only after that reviewer's
  full report arrives and its child reports are resolved. A waiting
  notification or missing field does not prove completion.
- **`runs[].rewritten_by_checks`** lists files the background checks changed
  (for example `eslint --fix`); empty when none.
- **`runs[].uncovered`** lists what nothing checked, in two forms: a bare
  reviewer dimension, when a lane never reported and nobody covered it
  (Phase 2), and `typecheck-stub: <project>` from step 9, naming a project
  whose typecheck target was a stub and so compiled nothing. Prefix decides
  which: a bare string is a dimension.

  **Reading values this skill has since removed.** A stored `checks: "not
  run"` means `nothing affected`, the value that replaced it. A stored
  `uncovered` entry `typecheck-unbuilt: <project>` is neither a live prefix
  nor a dimension — read it as a note that the project's typecheck reported a
  module-not-found, and ignore it. Neither is rewritten: old run entries are
  history, and the rule to read them belongs here rather than in a migration.

  **`aborted` is not that value returning.** It means an nx invocation exited
  non-zero having executed no task — the sync abort — so nothing was checked
  and the two checks that did run cannot speak for the one that did not. The
  retired `not run` meant every typecheck target had been discounted, under a
  discount rule that no longer exists. Same shape of English, different fact.
- **`runs[].breadth`** records the review set. **`runs[].reviewed`** lists
  those paths. A `whole change` run lists every changed path. A `narrowed`
  run lists moved and entered paths. An outside-anchor-only run has
  `breadth: "narrowed"` and `reviewed: []`. A run with no reviewer has
  `breadth: "none"` and `reviewed: []`. Read Phase 0b for the skip gates.
  A final run always records `whole change` and every changed path.

  The whole-change-total trigger reads `breadth`. Final completion also
  checks `breadth`, `reviewed` and `cold`. Run count does not trigger a
  refresh. Older later runs may combine a narrowed verdict review with a
  whole-change cold review; their `reviewed` list covers only the former.
- **`version`** stays `2`. Do not backfill old runs. For old runs without
  `breadth`, the whole-change-total trigger reads `kind` and `tier`. Missing
  final fields mean a final review is still pending.
- **`anchors`** lists every file the finding depends on, refreshed to current
  line numbers on each verdict.
- **`raised_in_run`** is the 1-based index of the run that first raised the
  finding; **`verified_by`** says how Phase 3 confirmed it.
- **`files`** is always the step-9 snapshot of the latest run, never a
  re-hash taken after fixes. Paths are repo-relative.
- **`outside_anchors_since`** is the 1-based index of the first run whose state
  write found this field absent, and it is **written once and never
  recomputed**. Phase 4's walk admits a finding only when its `raised_in_run`
  is at or after this value, which is how a finding raised before the map
  existed is kept out without backfilling. Carry it forward verbatim on every
  state write: the state is rewritten whole each run, so omitting it makes the
  next run believe it is the first, moving the boundary forward and silently
  dropping every earlier finding's outside anchors.

  **It is set whether or not `outside_anchors` ends up empty**, and that is the
  whole of the rule. The map is `{}` on any run where no finding anchors a file
  outside the change, which is most runs, so tying the field to the run that
  first *populates* the map would leave it unset indefinitely and slide the
  boundary past every finding raised in between. That reading is also circular:
  whether a run populates the map depends on eligibility, which depends on this
  field. Absent on states written before the map existed; the next run to write
  one sets it.
- **`outside_anchors`** holds the finding anchors that are **not** in the
  change, hashed with `git hash-object -w` by the orchestrator in Phase 4 and
  compared at the start of Phase 0b. It is deliberately a second map: `files`,
  the snapshot line's `files=` and its `files-sha256=` are three views of the
  one map `snapshot.mjs record` builds from changed paths, so a path added to
  `files` is erased by the next `record` and a path folded into the digest
  makes the record unmatchable by the stricter CI check planned against
  `git ls-tree`. Nothing here feeds the digest, the counts or the escalation
  triggers. `PR.md` and `.pre-review/**` are never eligible. Absent on states
  written before it existed, and not backfillable — an anchor missing from
  `files` is equally an outside anchor and a file that left the change, and
  the stored state cannot tell them apart.
- **Reviewer figures** come only from completion notifications; write `null`
  when a notification did not carry one. Sum reported reviewer tokens across
  every run for the branch. Mark the sum partial if any token figure is
  missing or `null`. This is reviewer usage, not total session or model cost.

## Final completion

The state may have **`final_review`**, with `input_key`,
`outside_anchors_sha256` and a 1-based `run` index. Write it only after a
completed independent final review, once Phase 4 has written
`outside_anchors`, and copy `outside_anchors_sha256` from the helper's output
at that point. Its run
must have `kind: "final"`, the matching `input_key`, `cold: true`,
`breadth: "whole change"`, every changed path in `reviewed`, and a
`review-lane` reviewer with `completed: true`. Completed initial reviewer
coverage must precede it. That means a whole-change `first` run with every
required reviewer complete, or a later whole-change full-tier repair. Every
recorded reviewer on that run must be complete. No uncovered reviewer
dimension may remain. Later checks can repair mechanical check failures.
Legacy runs without completion fields need a full repair before final
review. Missing coverage from any later ordinary review also requires a
subsequent whole-change full repair. Neither an unchanged run nor the final
reviewer clears that missing coverage. `--final` cannot replace the initial
review tier.

`.pre-review/<key>.context.txt` holds the exact final-review context. It
contains no finding-derived text: no follow-up entries generated from
findings, no `[withheld: …]` markers and no `withheld:` header. It also
excludes the scope hint, the CI summary, previous findings, run numbers,
status, timestamps and usage figures. Write it in this layout, with LF line endings, one blank
line between sections, and every section present:

```
INTENT
<sections 1–5 of the description as settled at step 9, without finding-generated entries>

BINDING SOURCES
<path> <blob sha>

AUTHORITATIVE SOURCES
<one line per source: a path with its blob sha, or a repository with its pin; or the line "No external contract.">
```

List paths in each section in byte order. When the file exists, read it
first and rewrite it only when one of these inputs changed.

Use this command to check freshness and completion:

```
node scripts/pre-review/snapshot.mjs final --base <sha> --state-file .pre-review/<key>.json --context-file .pre-review/<key>.context.txt
```

It returns `input_key`, `outside_anchors_sha256`, `status` (`pending`,
`blocked` or `complete`) and `reasons`. The key binds the resolved base,
current branch, changed file contents and exact context bytes. Outside
finding anchors are not in the key, because Phase 4 rebuilds that map from
the run's own findings. The helper compares their current content with
`outside_anchors`, and completion also requires the current digest to equal
the one on `final_review`. Record this key
with the step-9 snapshot, before reviewers and background tests. A different
key at the end requires new work.
The latest run must match it, with checks `passed` or `nothing affected` and
no uncovered work. State snapshots must also match the current inputs.

Open or partially fixed blockers prevent completion, including deferred and
declined blockers. Unresolved normal findings marked `fix now` or `undecided`
also prevent completion. Missing runs or findings block completion. A
missing final marker means pending when the other requirements pass. A historical
cold review alone never proves completion. `--full --final` clears the final
record and forces new work. A repeated `--final` reuses a valid completed
result. Ordinary runs may report completion only when this check returns
`complete`.

## Snapshot line

One HTML comment inside the Pre-review record, on one line:

```
<!-- pre-review-snapshot v1 base=<sha> branch=<name> reviewed-at=<iso8601> tier=<light|full> files=<count> files-sha256=<hex> -->
```

`files-sha256` is the SHA-256 of a text file with one line per reviewed file:

- `<path> <blob sha>`, or `<path> deleted` for a file the change deletes;
- `<path>` repo-relative, with `/` separators;
- lines sorted by path in byte order (the C locale), each ending in a line
  feed, with no other content.

`node scripts/pre-review/snapshot.mjs record <base>` builds it from the
working tree; never compute the digest another way. The `pre-review-check`
CI job reads this line with the same script and requires `branch=` to be the
PR's head branch. It does not compare the digest with the code yet: the
digest is kept so a later, stricter check can find the commit holding the
reviewed content.

## PR description: `.pre-review/<key>.md`, copied to `PR.md`

When the file does not exist yet, write:

1. **First line**: a one-line conventional commit message (`feat(vault): …`).
   commitlint requires a scope.
2. **What**: what the change does, in plain words, and what is in the diff.
3. **Why**: the problem or need.
4. **Approaches**: the options considered and why this one won. Rejected
   approaches stop reviewers, human and AI, from re-proposing them.
5. **Not in this PR**: deliberate omissions. Every finding whose **decision**
   is `follow-up` and whose **status** is neither `fixed` nor `moot` is listed
   here as `- <follow-up> (pre-review N<id>)`, regenerated every run, so one
   that is later fixed drops out. Keyed on the decision rather than the
   outcome so a deferred merge-blocker stays listed — its outcome is
   `open — merge-blocker` — and guarded on the status so a fixed follow-up
   does not keep advertising itself as a deliberate omission.

   **Never write a finding id as `#<id>`,** here or anywhere else in the
   description. This file becomes the PR body, where GitHub turns `#97` into
   a link to issue or PR 97 — a real, unrelated one, in every description the
   loop produces. Use `N<id>` in prose and a bare number in the record
   table's `N` column. `#` stays for genuine issue and PR references, which
   is what a reader of a PR body will take it to mean.
6. **Pre-review**: the collapsed record, regenerated every run:

   ```
   <details>
   <summary>Pre-review: 12 findings · 7 fixed · 1 moot · 2 follow-up · 1 declined · 1 open (0 merge-blockers) · 0 undecided · checks nothing affected · final pending</summary>

   <!-- pre-review-snapshot v1 base=… branch=… reviewed-at=… tier=… files=… files-sha256=… -->

   | N | Finding | Severity | Outcome |
   |---|---|---|---|
   | 3 | <one-line claim> | merge-blocker | fixed |
   | 7 | <one-line claim> | normal | follow-up: <what> |
   | 9 | <one-line claim> | normal | declined: <reason> |
   | 12 | <one-line claim> | normal | open |

   </details>
   ```

Each finding's outcome is the first row that applies:

| Outcome                  | When                                            |
| ------------------------ | ----------------------------------------------- |
| `fixed`                  | status `fixed`                                  |
| `moot`                   | status `moot`                                   |
| **open — merge-blocker** | severity `merge-blocker`, not yet fixed         |
| `follow-up: …`           | decision `follow-up`                            |
| `declined: …`            | decision `decline`                              |
| `open`                   | anything else: fix-now not yet fixed, undecided |

Severity outranks the decision deliberately. A deferred or declined
merge-blocker still renders as `open — merge-blocker`, with the decision and
its reason appended (`open — merge-blocker (deferred: …)`), and still counts
in the summary's merge-blocker total. A PR that ships with a known blocker
says so on its own description; it is not reported as resolved because
someone chose to defer it.

The summary must match the state exactly. Its `final` status is the current
result from `snapshot.mjs final`: `pending`, `blocked` or `complete`. Do not
infer completion from a clean findings list or an old final record.

Findings are counted in five terms -
`fixed`, `moot`, `follow-up`, `declined`, `open` — which partition the
findings and sum to the total. `open — merge-blocker` is a sixth *row* of the
cascade above but not a sixth term: it counts under `open`. `(N
merge-blockers)` and `N undecided` are sub-counts of `open` too, not extra
terms, so none of the three is part of that sum. A merge-blocker that is not
fixed counts under `open` and inside the parenthetical, **whatever its
decision** — a deferred or declined one is not also counted under `follow-up`
or `declined`, or the same blocker is reported twice under two different
stories. Its decision shows in its own row, not in the header.

The description follows these rules:

- Absolute links for issues and PRs
  (`https://github.com/babylonlabs-io/babylon-toolkit/issues/123`).
- No hard-wrapping: one line per paragraph or bullet.
- No personal names or handles.
- Claim only what the change shows.
- No tool-attribution line or `Co-Authored-By` trailer, even when a default
  instruction asks for one.
