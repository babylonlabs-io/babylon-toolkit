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

## Cursor Cloud specific instructions

Dependency install/refresh (`pnpm install`) runs automatically via the environment update script. The notes below cover only non-obvious, durable gotchas for running/testing in this repo. Standard commands live in `DEVELOPMENT.md`, root `README.md`, and `services/vault/README.md`.

### Node version (important gotcha)

This repo requires Node **24.2.0** (`.nvmrc`, `engines: >=24 <25`). The VM's default `node` on `PATH` is a `/exec-daemon/node` shim at **v22**, which takes precedence over nvm. `~/.bashrc` has been configured to prepend the nvm Node 24 bin, so newly started interactive/login shells use Node 24 automatically. If a shell (or a non-interactive command runner) still reports v22, force it with:

```bash
export PATH="$HOME/.nvm/versions/node/v24.2.0/bin:$PATH"
```

`pnpm` (10.19.0) is provided via Corepack.

### Running the vault app (primary product)

- `services/vault` is a Vite/React SPA (port **5173**). It is the main product; `services/simple-staking` is a separate, optional product. The `packages/*` are libraries the services consume — Nx builds them first (`build.dependsOn: ["^build"]`), so run `pnpm run build` (or `nx build @services/vault`) before serving if `dist/` is stale.
- The default `pnpm --filter @services/vault dev` first runs `scripts/sync-env.mjs`, which uses the `gh` CLI to pull network config from the **private** `babylonlabs-io/tbv-networks` repo. Without access it only warns (non-blocking) and does **not** create `.env`, so the app boots without required config.
- Prefer `pnpm --filter @services/vault dev:testnet` for a no-secrets run: it loads the committed public testnet config `services/vault/.env.dev-testnet` (Sepolia + signet) and needs no `gh` auth. This is the reliable way to run the app in the cloud VM.
- Expected behavior with no wallet connected (and/or when external testnet indexer/RPC endpoints are unreachable due to egress limits): the dashboard shows a "Something went wrong" / Retry card, but the shell, routing, and the "Connect" wallet flow render and work. A full deposit/borrow flow needs real BTC+ETH wallet extensions and testnet funds, which aren't available headless.

### WASM

`packages/babylon-tbv-rust-wasm` ships prebuilt artifacts in `dist/generated/`, so normal install/build/dev needs **no Rust toolchain**. Only regenerating bindings (`pnpm --filter @babylonlabs-io/babylon-tbv-rust-wasm build-wasm`) needs Rust + SSH access to a private repo — do not run it for env setup (see that package's `README.md`).
