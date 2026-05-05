# babylon-toolkit Constitution

## Core Principles

### I. Critical Paths Require Human Review (NON-NEGOTIABLE)

The following paths handle irreversible value movement and must not be modified
by an AI assistant alone. Any change requires two reviewers, and the author
must be able to explain every changed line without an AI assistant open.

- WASM boundary value computation (`packages/babylon-tbv-rust-wasm/src/index.ts`)
- Fee calculation consistency (`packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts`,
  `services/vault/src/utils/fee/peginFee.ts`)
- Presigning payout transactions (`packages/babylon-ts-sdk/src/tbv/core/primitives/psbt/payout.ts`,
  `services/vault/src/hooks/deposit/depositFlowSteps/payoutSigning.ts`)
- Vault-secret derivation (frozen on-chain-binding API under
  `packages/babylon-ts-sdk/src/tbv/core/vault-secrets/`,
  `packages/babylon-ts-sdk/src/tbv/core/wots/blockDerivation.ts`,
  `packages/babylon-ts-sdk/src/tbv/core/managers/PeginManager.ts`)
- HTLC secret & vault activation (`services/vault/src/services/vault/vaultActivationService.ts`)
- Multi-vault split transactions (`packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts`)
- Non-standard wallet signing options (`packages/babylon-ts-sdk/src/tbv/core/utils/signing.ts`)

Every WASM output consumed by JS must be asserted against expected bounds
before use. Every signature produced with non-standard wallet options must be
validated against the expected sighash before being treated as signed.

### II. No Silent Fallbacks on Critical Paths

Throw errors instead of defaulting to values that mask bugs. Never default to
`0n`, `0`, `""`, `[]`, or `undefined` when a missing value indicates a real
problem. Fallback values are acceptable only for optional UI/display concerns,
never for financial calculations, transaction construction, or protocol
parameters. If a value is required for correctness, its absence is an error
and must surface loudly.

### III. Zero Dead Code

No unused functions, variables, imports, types, or components in source or
tests. After every edit, trace impact: anything removed must have all
references removed too (tests, imports, re-exports, mocks). No commented-out
code, no `// removed` / `// deprecated` markers as substitutes for deletion,
no re-exports or aliases for backward compatibility unless explicitly
requested.

### IV. Behavior-Driven Tests

Each test verifies one specific behavior of production code, with a name
that describes the exact behavior being tested. Never write tests for
functions that don't exist in production code. When production code changes,
update or remove corresponding tests immediately. Prefer inline setup over
deeply nested helpers; three similar test functions are better than one
parameterized abstraction. A new contributor should understand a test by
reading it top-to-bottom.

### V. Spec-Driven Development

Every feature lives under `specs/NNN-feature-name/` with `spec.md` capturing
user scenarios, acceptance scenarios, functional requirements, and success
criteria. New features begin with `/speckit-specify` before any code is
written. Plans (`plan.md`) and tasks (`tasks.md`) are derived from the spec,
never the other way around. Specs describe behavior, not implementation: no
file paths, no framework names, no code samples in `spec.md`.

## Security & Supply Chain

- Never log sensitive key material - no `console.log` of private keys, derived
  secrets, or signing data.
- Validate all data received from wallet APIs before use.
- Never trust external GraphQL/RPC responses for security decisions without
  validation.
- All new dependencies must use pinned exact versions (no `^` ranges),
  especially crypto packages. Audit new dependencies for supply chain risk
  before adding.
- Protocol parameters (`councilQuorum`, `feeRate`, etc.) come from on-chain
  contracts via ABI calls. Never hardcode them. If a parameter is not yet
  available from the contract, leave a `TODO` with context.

## Development Workflow

- Build prerequisites: Node 24 via nvm (`nvm use 24`), pnpm via Corepack.
  Rebuild `core-ui` and `ts-sdk` before vault build.
- Run `pnpm run lint` and `pnpm run test` in the affected service before
  considering work done.
- Commit messages start with `feat(packages):`.
- React Query for server state; React Context for shared client state.
  Centralize polling rather than per-row hook instantiation.
- One component per file. File name matches component name. Function
  components contain no business logic; business logic lives in hooks or
  auxiliary methods.

## Governance

This constitution supersedes ad-hoc practices. All PRs touching `Critical
Paths` (Principle I) must reference the relevant spec under `specs/` and
include the required cross-checks. Amendments require documentation in this
file plus a corresponding update to `CLAUDE.md` so the two stay in sync.
Complexity must be justified in the spec; YAGNI by default.

**Version**: 1.0.0 | **Ratified**: 2026-05-05 | **Last Amended**: 2026-05-05
