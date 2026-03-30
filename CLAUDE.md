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

---

## SECURITY

- **Never log sensitive key material** — no `console.log` of private keys, mnemonics, or signing data.
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
