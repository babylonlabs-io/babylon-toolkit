# `/pre-review` formats

Reference for [SKILL.md](SKILL.md): the state file, the snapshot line and the
PR description.

## State file: `.pre-review/<key>.json`

`<key>` is the branch name with `/` replaced by `__`. The file is JSON; the
example below is valid as written.

```json
{
  "version": 1,
  "branch": "feat/x",
  "base": "<merge-base sha>",
  "intent": "<one paragraph: what the change is for, what is out of scope>",
  "files": {
    "<path>": "<blob sha>",
    "<deleted path>": "deleted"
  },
  "runs": [
    {
      "at": "<iso8601>",
      "kind": "first",
      "tier": "full",
      "escalated": false,
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
| `runs[].checks`          | `passed`, `failed`, `nothing affected`, `not run` |
| `findings[].severity`    | `merge-blocker`, `normal`                         |
| `findings[].confidence`  | `high`, `medium`, `low`                           |
| `findings[].verified_by` | `code`, `test`, `external source`, `unverified`   |
| `findings[].status`      | `open`, `partially fixed`, `fixed`, `moot`        |
| `findings[].decision`    | `fix now`, `follow-up`, `decline`, `undecided`    |

- **Ids** are plain integers that never repeat: a later run continues from the
  highest id. A regression reopens its old id.
- **`runs[].tier`** is the reviewer set that actually ran: `full` only when
  `review-generalist`, `review-tracer` and `review-panel` all ran, otherwise
  `light` (one reviewer, or the verdict lane alone).
- **`runs[].rewritten_by_checks`** lists files the background checks changed
  (for example `eslint --fix`); empty when none.
- **`anchors`** lists every file the finding depends on, refreshed to current
  line numbers on each verdict.
- **`raised_in_run`** is the 1-based index of the run that first raised the
  finding; **`verified_by`** says how Phase 3 confirmed it.
- **`files`** is always the step-9 snapshot of the latest run, never a
  re-hash taken after fixes. Paths are repo-relative.
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

Write that file to WORK with the Write tool and run `shasum -a 256 <file>`
on it. A CI check rebuilds the same text from the PR itself: the paths from
`git diff --name-only --no-renames <base>...<PR head>`, and for each path
`git rev-parse <PR head>:<path>`, or `deleted` when the path does not exist
at the head. Equal digests mean the PR changes the same files, with the same
content, as the review saw.

## PR description: `.pre-review/<key>.md`, copied to `PR.md`

When the file does not exist yet, write:

1. **First line**: a one-line conventional commit message (`feat(vault): …`).
   commitlint requires a scope.
2. **What**: what the change does, in plain words, and what is in the diff.
3. **Why**: the problem or need.
4. **Approaches**: the options considered and why this one won. Rejected
   approaches stop reviewers, human and AI, from re-proposing them.
5. **Not in this PR**: deliberate omissions. Every finding whose outcome is
   `follow-up: …` is listed here as `- <follow-up> (pre-review #<id>)`,
   regenerated every run, so one that is later fixed drops out.
6. **Pre-review**: the collapsed record, regenerated every run:

   ```
   <details>
   <summary>Pre-review: 12 findings · 7 fixed · 1 moot · 2 follow-up · 1 declined · 1 open (0 merge-blockers) · 0 undecided · lint/test nothing affected</summary>

   <!-- pre-review-snapshot v1 base=… branch=… reviewed-at=… tier=… files=… files-sha256=… -->

   | # | Finding | Severity | Outcome |
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
| `follow-up: …`           | decision `follow-up`                            |
| `declined: …`            | decision `decline`                              |
| **open — merge-blocker** | severity `merge-blocker`                        |
| `open`                   | anything else: fix-now not yet fixed, undecided |

The summary counts every outcome, plus how many open findings are undecided,
and must match the state exactly.

The description follows these rules:

- Absolute links for issues and PRs
  (`https://github.com/babylonlabs-io/babylon-toolkit/issues/123`).
- No hard-wrapping: one line per paragraph or bullet.
- No personal names or handles.
- Claim only what the change shows.
- No tool-attribution line or `Co-Authored-By` trailer, even when a default
  instruction asks for one.
