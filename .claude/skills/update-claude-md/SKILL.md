---
name: update-claude-md
description: Diff recent changes against CLAUDE.md and propose targeted edits. Use after merging a material feature, a refactor that renames or moves files, or a change that invalidates existing rules. Accepts a PR number, a commit range, or defaults to the current branch vs main.
disable-model-invocation: true
argument-hint: "[pr-number | commit-range | empty for current branch vs main]"
---

Read `CLAUDE.md` and compare it against recent changes specified by $ARGUMENTS. Propose a minimal set of edits that keep CLAUDE.md accurate. Do not edit speculatively - only change what the diff demonstrably invalidates or newly requires.

## Gather context

If `$ARGUMENTS` looks like a PR number or URL:
!`gh pr diff $0`
!`gh pr view $0 --json title,body,files`

If `$ARGUMENTS` looks like a commit range (`abc..def`):
!`git diff $0 -- . ':(exclude)pnpm-lock.yaml' ':(exclude)*.lock'`
!`git log --oneline $0`

Otherwise (default - current branch vs main):
!`git diff origin/main...HEAD -- . ':(exclude)pnpm-lock.yaml' ':(exclude)*.lock'`
!`git log --oneline origin/main..HEAD`

Then read the current CLAUDE.md:
@CLAUDE.md

## What to look for

Walk through CLAUDE.md section by section. For each section, ask whether the diff contains evidence that the section is **wrong**, **incomplete**, or **stale**. Flag every category below that applies.

### 1. Broken file paths (highest priority)
- Every file path mentioned in CLAUDE.md must still exist.
- If a file in the `CRITICAL PATHS` section has been renamed, moved, or deleted, that is a **must-fix** - a stale critical-path reference is the most dangerous kind of drift.
- Run `test -f <path>` (via bash) for each path in the Critical Paths section. Report any that fail.

### 2. New critical-path-worthy files
A file likely belongs in the `CRITICAL PATHS` section if it:
- Constructs, signs, or broadcasts a Bitcoin transaction
- Computes or consumes a fee used in a signed transaction
- Derives keys, secrets, or signatures
- Crosses the WASM/Rust boundary for value-bearing computations
- Submits on-chain state that is irreversible (activation, claim, payout)

If the diff adds such a file without adding it to the section, propose the addition - including the specific **Rule:** line it needs.

### 3. Invalidated rules
- A rule that the diff's code contradicts (e.g. a new silent fallback on a critical path, a hardcoded protocol parameter).
- This is usually a signal the diff itself needs fixing, not CLAUDE.md - flag it as a review finding rather than a CLAUDE.md edit.

### 4. New conventions the team has adopted
- A new state-management pattern, testing approach, or architectural convention the diff establishes or relies on.
- Only propose adding it to CLAUDE.md if the same pattern appears in 3+ places across the codebase (not just the diff). One-off patterns don't belong in global rules.

### 5. Dead or obsolete rules
- A rule that references removed concepts, deprecated packages, or patterns the codebase no longer uses.
- Verify by grepping the codebase before proposing removal.

### 6. Package / tool changes
- `Key Packages` list: does the diff add, remove, or materially change any package's role?
- `Build & Test Commands`: do any commands still work?

## Output format

Produce a single proposal with this structure. Do not edit CLAUDE.md directly - present the proposal for human review first.

```
## Proposed CLAUDE.md updates

### Must-fix (stale paths / invalidated references)
<bullet list - each with file:line in current CLAUDE.md and the replacement>

### Recommended additions
<new rules or paths to add - each with the diff evidence that justifies it>

### Recommended removals
<rules to delete - each with grep evidence that the referenced concept is gone>

### Review findings (not CLAUDE.md edits)
<rules the diff itself violates - forward to the PR author>
```

If there is nothing to change, say so in one line - do not invent edits.

## Apply

After the human confirms the proposal, apply the edits with `Edit` calls scoped to the exact lines in the proposal. Do not rewrite unrelated sections.
