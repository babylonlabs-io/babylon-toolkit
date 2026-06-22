# CLAUDE.md — babylon-toolkit

## Project Overview

Monorepo (pnpm workspaces) for Babylon's Bitcoin vault frontend. Users lock BTC on Bitcoin, receive vaultBTC on Ethereum for DeFi collateral. The frontend manages the full depositor lifecycle: vault provider selection, deposit, presigning payout transactions, broadcasting, redemption.

### Key Packages

- `services/vault` — Main vault dApp (Next.js)
- `packages/babylon-tbv-rust-wasm` — Rust→WASM for transaction construction, fee calculation
- `packages/wallet-connector` — Multi-chain wallet abstraction (BTC + ETH)
- `packages/core-ui` — Shared UI component library
- `packages/ts-sdk` — TypeScript SDK for protocol interaction

### Build Prerequisites

- Node 24 via nvm (`nvm use 24`), pnpm via Corepack
- Must rebuild `core-ui` and `ts-sdk` before vault build (stale `dist/` is a common issue)

## Build & Test Commands

```bash
nvm use 24                            # Switch to Node 24 (required)
pnpm install                          # Install all dependencies
pnpm run build                        # Build all packages
pnpm run lint                         # Lint all packages
pnpm run test                         # Run all tests (vitest)
pnpm --filter vault run dev           # Dev server for vault service
```

Run `pnpm run lint` and `pnpm run test` in the affected service before considering work done.

---

## CRITICAL PATHS — HUMAN REVIEW REQUIRED

These paths handle irreversible value movement. An AI-generated mistake here is silent: code compiles, tests pass, wrong BTC amount ships. **Any change touching these files requires two reviewers, and the author must be able to explain every changed line without an AI assistant open.**

### 1. WASM boundary (value computation)

- File: `packages/babylon-tbv-rust-wasm/src/index.ts`
- The Rust/WASM layer computes `htlcValue = peginAmount + depositorClaimValue + minPeginFee` internally. JS receives outputs with no runtime validation.
- **Rule:** Every WASM output consumed by JS must be asserted against expected bounds before use. If a WASM-returned value feeds a signed transaction, cross-check it against an independently computed expected value.

### 2. Fee calculation consistency

- Files:
  - `packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts` — UTXO selection with iterative fee recalculation
  - `packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts` — shared fee math used by both UTXO selection and transaction funding (moved from `services/vault/src/utils/fee/peginFee.ts`)
- Both systems must agree before broadcast. A mismatch underfunds the transaction.
- **Rule:** When changing either, re-verify the other produces the same fee for a representative fixture. Cross-check assertions belong at the broadcast site, not only at the estimator.

### 3. Presigning depositor-graph transactions (Payout + NoPayout)

- Files:
  - `packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts`
  - `packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts` — orchestrator that derives `LocalChallengers`, asserts the VP-returned `challenger_presign_data` set equals `local ∪ universal`, and decides which per-challenger NoPayout PSBTs get pre-signed
  - `services/vault/src/hooks/deposit/depositFlowSteps/payoutSigning.ts`
- The depositor pre-signs payout (and per-challenger NoPayout) transactions built by the Vault Provider — values and challenger sets come from an external party with no independent verification. Asymmetric failure: undersigning leaves recovery material missing for an active challenger; oversigning hands signatures to a key the protocol doesn't recognize.
- **Rule:** Before the signature call, re-derive the expected payout amount from on-chain or WASM-computed sources and assert equality. For the challenger set, derive `LocalChallengers` from on-chain VK list (matching the Rust reference in `btc-vault crates/vault/src/tx_graph/graph.rs`) and assert the VP-returned set equals `local ∪ universal` exactly — no missing entries, no extras. Never sign a value or accept a challenger key handed to us verbatim.

### 4. Vault-secret derivation (frozen on-chain-binding API)

- Files (all marked `@stability frozen` in JSDoc):
  - `packages/babylon-ts-sdk/src/tbv/core/vault-secrets/context.ts` — `buildVaultContext`, `buildFundingOutpointsCommitment`
  - `packages/babylon-ts-sdk/src/tbv/core/vault-secrets/deriveVaultRoot.ts` — `deriveVaultRoot`, `VAULT_APP_NAME`
  - `packages/babylon-ts-sdk/src/tbv/core/vault-secrets/index.ts` — re-exports `expandAuthAnchor`, `expandHashlockSecret`, `expandWotsSeed` from the WASM package
  - `packages/babylon-tbv-rust-wasm/src/index.ts` — browser-side async wrappers for the three expanders
  - `packages/babylon-tbv-rust-wasm/src/index-node.ts` — node-side async wrappers for the three expanders
  - `packages/babylon-tbv-rust-wasm/scripts/build-wasm.js` — `BTC_VAULT_COMMIT` pin (the Rust crate at this commit is the byte-level source of truth for the HKDF `info` encoding, labels, and i2osp prefixes)
  - `packages/babylon-ts-sdk/src/tbv/core/wots/blockDerivation.ts` — `deriveWotsBlocksFromSeed`, `computeWotsBlockPublicKeysHash`
- The orchestrator that composes these primitives:
  - `packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts` — `PeginManager.preparePegin` (sizing → `deriveVaultRoot` → per-vault expand → commit pass with `htlcVout === index` invariant). The wrapper API may evolve; the underlying frozen primitives must not.
- These functions feed `wallet.deriveContextHash` and produce on-chain commitments (`depositorWotsPkHash`, HTLC hashlock, OP_RETURN auth-anchor preimage). Any byte-level change to layout, ordering, label, or HKDF info rotates the secrets and **invalidates every existing deposit** — users cannot derive matching keys, cannot activate, cannot resume.
- **Rule:** Treat as a hard fork. Changes require: (a) a coordinated revision of `derive-vault-secrets.md` / `derive-context-hash.md`, (b) updated golden-vector tests in `btc-vault` (`crates/vault/src/wasm.rs` `golden_vectors_pinned`) — the byte-level `info` encoding now lives Rust-side and that test is the source of truth, (c) a migration plan for in-flight deposits. A bump of `BTC_VAULT_COMMIT` in `build-wasm.js` that changes any expander output is equivalent to changing this list. Match the Rust `babe::wots` reference byte-for-byte. Two-vault test (overlapping inputs, distinct keys) is mandatory for any chain-logic change.

### 5. HTLC secret & vault activation

- File: `services/vault/src/services/vault/vaultActivationService.ts`
- Submits the secret that unlocks the HTLC on-chain. Wrong secret = funds permanently locked.
- **Rule:** Verify `hash(secret) === expectedHash` immediately before submission. Do not infer the secret from UI state - derive it only from the source that generated it.

### 6. Multi-vault split transactions

- File: `packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts`
- Split outputs must be sized exactly and broadcast in order. Incorrect sizing starves one vault or fails the whole deposit after commitment.
- **Rule:** Assert `sum(splitOutputs) === totalDeposit - fees` before signing. Assert broadcast ordering with explicit sequence checks, not array iteration order.

### 7. Non-standard wallet signing options

- File: `packages/babylon-ts-sdk/src/tbv/core/utils/signing.ts`
- Uses `disableTweakSigner: true` and `autoFinalized: false` for taproot script-path spends. Wallet support is inconsistent; silent failures produce invalid signatures.
- **Rule:** Validate every signature produced with these flags against the expected sighash before treating the PSBT as signed. Do not rely on the wallet returning success.

---

## ZERO DEAD CODE POLICY

1. **Never leave dead code.** No unused functions, variables, imports, types, or components — in source or tests.
2. **Never reference removed code.** If something is removed, remove ALL references: tests, imports, re-exports, mocks.
3. **After every edit**, trace the impact: "Is anything I changed or removed still referenced elsewhere?"
4. **No commented-out code.** Delete it. Git has history.
5. **No `// removed`, `// deprecated`, `// unused` comments** as substitutes for actual deletion.
6. **No re-exporting or aliasing** for backward compatibility unless explicitly requested.

---

## CODE QUALITY RULES

### No Magic Numbers

- Extract all hardcoded numbers and strings to named constants with descriptive names.
- Constants should be co-located or in a shared config — never inline.
- If a number appears in code, it must be obvious why that value was chosen.

### No Silent Fallbacks on Critical Paths

- **Throw errors** instead of defaulting to values that mask bugs.
- Never default to `0n`, `0`, `""`, `[]`, or `undefined` when a missing value indicates a real problem.
- Fallback values are acceptable only for optional UI/display concerns, never for financial calculations, transaction construction, or protocol parameters.
- If a value is required for correctness, its absence is an error — surface it loudly.

### Error Handling

- Prefer explicit error handling over catch-all fallbacks.
- Error messages must be actionable — include what failed and what the expected state was.
- Never swallow errors silently (empty `catch {}` blocks).

### Type Safety

- Use strict TypeScript. Avoid `any` — use `unknown` with type narrowing if needed.
- Prefer discriminated unions over optional fields when states are mutually exclusive.
- Null/undefined checks must be explicit, not hidden behind `??` fallbacks on critical paths.

---

## TEST PHILOSOPHY

### Tests test behavior, not implementation

- Each test verifies ONE specific behavior of production code.
- Test name describes the exact behavior being tested.
- If you can't name what production behavior a test verifies, the test shouldn't exist.

### No test bloat

- Never write tests for functions that don't exist in production code.
- When production code changes, update or remove corresponding tests immediately.
- Every assertion must verify behavior of code in `src/`.

### Simplicity over abstraction

- Prefer inline setup over deeply nested helper hierarchies.
- Three similar test functions are better than one parameterized abstraction.
- A new contributor should understand a test by reading it top-to-bottom.

### Self-contained and readable

- Each test makes its setup, action, and assertions clear in the function body.
- Use descriptive names: `it("shows expired with ack_timeout reason", ...)`
- Don't hide critical setup in shared mocks — if it matters for understanding, show it.
- Prefer explicit values over magic constants imported from elsewhere.
- Use `vi.useFakeTimers()` for time-dependent tests.

---

## ARCHITECTURE & PATTERNS

### Protocol Parameters

- Protocol parameters (councilQuorum, feeRate, etc.) come from on-chain contracts via ABI calls.
- **Never hardcode protocol parameters.** If a value comes from the contract, fetch it.
- If a parameter is not yet available from the contract, leave a `TODO` with context.

### Feature Flags

- Pattern: `NEXT_PUBLIC_FF_*`
- Defined in `services/vault/src/config/featureFlags.ts`

### Dependencies

- All new dependencies must use **pinned exact versions** (no `^` ranges), especially crypto packages.
- Audit new dependencies for supply chain risk before adding.

### State Management

- React Query for server state (RPC calls, contract reads).
- React Context for shared client state (polling results, form state).
- Avoid prop drilling — use context when 3+ levels deep.

### Performance

- Avoid per-row hook instantiation in tables/lists — centralize polling (see `PeginPollingContext`).
- Memoize derived data with `useMemo`/`useCallback` with correct dependency arrays.
- Don't create new objects/arrays in render without memoization.

### User-Facing Copy

- **All user-visible strings in the vault app live in `services/vault/src/copy.ts`.** That includes JSX text, button labels, modal headings, status/badge labels, step descriptions, toast messages, and any other text a depositor sees.
- **Never inline a new user-facing string in a component or hook.** Add it to `copy.ts` under the appropriate section (or create a new section) and import `COPY` from `@/copy`.
- When editing existing user-facing text, edit it in `copy.ts`. If you find a string still inlined in a component, migrate it to `copy.ts` as part of your change.
- **Exception:** Contract / on-chain error messages live in `services/vault/src/utils/errors/errorMessages.ts`, keyed by ABI error name. Treat that file as part of the copy surface — same review rules apply.
- Follow the style rules documented at the top of `copy.ts` (Pre-Pegin / peg-in conventions, sentence-case status labels, "has been broadcast" tense, American English, vault provider lowercase mid-sentence).
- When adding strings that interpolate values, prefer a function (`(amount: string) => \`Your ${amount}...\``) in `copy.ts` over building the string in the component.

---

## SECURITY

- **Never log sensitive key material** — no `console.log` of private keys, derived secrets, or signing data.
- **Wallet inputs**: Validate all data received from wallet APIs before use.
- **GraphQL/RPC responses**: Never trust external data for security decisions without validation.

---

## CODE STYLE

- **Format**: Follow ESLint config. Run `pnpm run lint` before every commit.
- **Imports**: Must be used — remove unused imports immediately.
- **Control flow**: Prefer early returns over nested `if`/`else`.
- **Functions**: Keep functions single-purpose. Split when doing unrelated things.
- **Naming**: Descriptive variable and function names. Avoid abbreviations unless domain-standard (tx, UTXO, PSBT).
- **Components**: One component per file. File name matches component name.
- **After changes**: Check for comments/docs that reference old behavior and update them.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

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
