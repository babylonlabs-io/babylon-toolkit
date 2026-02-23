---
name: review-pr
description: Comprehensive PR review against team standards. Spins up multiple agents to review code design, structure, and quality.
disable-model-invocation: true
argument-hint: [pr-number-or-url]
---

Spin up multiple agents in parallel to carefully review PR $ARGUMENTS. Each agent should focus on a different aspect of the review.

First, fetch the PR diff and details:

!`gh pr diff $0`
!`gh pr view $0`

## Review Criteria

Agents should cover the following areas. Provide specific file references with line numbers and suggest concrete improvements.

### 1. Magic Numbers & Constants
- Flag any hardcoded numbers or strings without explanation
- Suggest extracting to named constants, enums, or configuration
- Check for suspicious values (timeouts, limits, indices, hex values)

### 2. File Structure & Organization
- Are new/modified files in the right location following project conventions?
- Are files getting too large (>500 lines source, >1000 lines tests) and should be split?
- Is related functionality co-located?
- Are index files and exports properly maintained?

### 3. Method Placement & Cohesion
- Are methods in the right file/module?
- Flag methods with too many responsibilities (SRP violation)
- Identify duplicate or near-duplicate logic across files
- Check if utility functions belong in a shared module instead

### 4. Extraction Opportunities
- Common patterns that should become reusable functions
- Large methods (>50 lines) or components that should be broken down
- Repeated logic that could be abstracted
- Configuration that should be externalized

### 5. Code Quality
- Type safety and null/undefined handling
- Error handling completeness (missing catch, unhandled edge cases)
- Naming clarity (variables, functions, files)
- No over-engineering or unnecessary abstractions
- No dead code or unused imports introduced

### 6. Architecture & Patterns
- Adherence to existing project patterns and conventions
- Unnecessary complexity or premature optimization
- Performance concerns (unnecessary re-renders, expensive operations in hot paths)
- Security concerns (injection, XSS, secrets exposure)
- Proper separation of concerns

### 7. Testing
- Are critical paths covered by tests?
- Are edge cases and error conditions tested?
- Are test descriptions clear and accurate?
- Any flaky test patterns (timing, ordering dependencies)?
