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
      "tier": "full",
      "breadth": "whole change",
      "reviewed": ["<path>"],
      "cold": false,
      "checks": "nothing affected",
      "rewritten_by_checks": [],
      "reviewers": [
        {
          "name": "review-tracer",
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
    }
  ]
}
```

The enumerated fields take these values:

| Field                    | Values                                            |
| ------------------------ | ------------------------------------------------- |
| `runs[].kind`            | `first`, `later`                                  |
| `runs[].tier`            | `light`, `full`                                   |
| `runs[].breadth`         | `whole change`, `narrowed`, `none`                |
| `runs[].checks`          | `passed`, `failed`, `aborted`, `stubbed`, `nothing affected` |
| `findings[].severity`    | `merge-blocker`, `normal`                         |
| `findings[].confidence`  | `high`, `medium`, `low`                           |
| `findings[].verified_by` | `code`, `test`, `external source`, `unverified`   |
| `findings[].status`      | `open`, `partially fixed`, `fixed`, `moot`        |
| `findings[].decision`    | `fix now`, `follow-up`, `decline`, `undecided`    |

- **Ids** are plain integers that never repeat: a later run continues from the
  highest id. A regression reopens its old id.
- **`runs[].tier`** is the reviewer set that actually ran: `full` only when
  `review-generalist`, `review-tracer` and `review-panel` all ran, otherwise
  `light` (anything less: one reviewer, or the verdict lane with or without
  the cold lane). The cold lane does not count toward the tier. It is spawned
  as a `review-lane`, so it can never be one of the three the `full` test
  names; counting it could only blur `light`, turning "the verdict lane alone"
  and "the verdict lane plus a cold lane" into the same recorded value when
  they are different reviews. `cold` records it instead.
- **`runs[].cold`** is `true` when the cold lane ran, `false` otherwise. Like
  `reviewed` it feeds no trigger; it is the audit trail answering "did an
  unledgered reviewer see this run", which is otherwise unanswerable from the
  record. Absent on runs written before it existed; read that as `false`.
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
- **`runs[].breadth`** is the review set the reviewers actually received, and
  **`runs[].reviewed`** lists those paths. A `whole change` run records the
  whole changed-file list; a `narrowed` run records only the moved and entered
  files, and also an outside-anchor-only run, which carries `reviewed: []`
  with `cold: true`; `none` is a run that spawned no reviewers at all and
  carries `reviewed: []`. For when that is, read Phase 0b's two gates in
  full — every qualifier of each — rather than a short form of them.

  **`breadth` is what both triggers read** — the whole-change-total trigger
  in the Escalate list and the refresh rule in the Widen list, which
  `SKILL.md` deliberately keeps apart, so do not call either an escalation;
  `reviewed` feeds neither. A `none` run is skipped by the refresh rule rather than counted,
  so `WHOLE_CHANGE_REFRESH_RUNS` decision-only runs cannot force a
  whole-change pass on their own, and skipped runs do not fill the window —
  a state made entirely of them never reaches the rule's floor and never
  fires. A run with no `breadth` at all is skipped the same way, whatever it
  reviewed.

  `reviewed` is the audit trail: what the **non-cold** reviewers were handed,
  an upper bound on what any of *them* opened, so a whole-change run lists
  every file even if a reviewer read a third of them. It is not an upper bound
  on the run: the cold lane is handed the whole change whatever the breadth,
  and `cold: true` is what says so. Read the two fields together, or a
  narrowed run reads as though nobody opened a file the cold lane went through
  end to end. It is what makes a `breadth` claim checkable after the fact
  rather than self-asserted, and what to read when a defect survived several
  runs and the question is who was given the file.

- **`version`** is `2` from the run that introduced `breadth`/`reviewed`. A
  stored run without `breadth` did not record what it reviewed, so the refresh
  rule skips it exactly like a `none` run, and the whole-change-total trigger
  reads its `kind` and `tier` rather than assuming either. Do not rewrite old
  entries
  to backfill it: the information is not recoverable, and guessing it either
  forces an expensive whole-change run on every in-flight branch or silently
  disables the rule.
- **`anchors`** lists every file the finding depends on, refreshed to current
  line numbers on each verdict.
- **`raised_in_run`** is the 1-based index of the run that first raised the
  finding; **`verified_by`** says how Phase 3 confirmed it.
- **`files`** is always the step-9 snapshot of the latest run, never a
  re-hash taken after fixes. Paths are repo-relative.
- **`outside_anchors_since`** is the 1-based index of the run that first wrote
  `outside_anchors`, and it is **written once and never recomputed**. Phase 4's
  walk admits a finding only when its `raised_in_run` is at or after this
  value, which is how a finding raised before the map existed is kept out
  without backfilling. Carry it forward verbatim on every state write: the
  state is rewritten whole each run, so omitting it makes the next run believe
  it is the first, moving the boundary forward and silently dropping every
  earlier finding's outside anchors. Absent on states written before the map
  existed; on those, the first run that populates the map sets it.
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
  when a notification did not carry one.

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
   <summary>Pre-review: 12 findings · 7 fixed · 1 moot · 2 follow-up · 1 declined · 1 open (0 merge-blockers) · 0 undecided · checks nothing affected</summary>

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

The summary must match the state exactly. It is counted in five terms —
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
