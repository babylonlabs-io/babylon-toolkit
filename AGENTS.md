<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# GitHub writing

Apply these rules to epics, issues, and pull request descriptions.

- Write for a reader who is new to the codebase.
- Put the outcome and current status first.
- Use short sentences and common terms.
- Keep one behavior or risk in each issue or pull request.
- Link to details. Do not copy long technical context.
- Use tables only for status, dependencies, or test results.
- Keep parent trackers short. Link to focused child issues.
- For issues, use: Outcome, Problem, Scope, Complete when, and Dependencies.
- For pull requests, use: Outcome, Change, Safety, Verification, and Links.
- Write `Tracks #N. #N stays open.` when the pull request is only part of the work.
- Write `Closes #N` only when the pull request meets every completion condition.
