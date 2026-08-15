# Security Model — `babylon-toolkit`

`babylon-toolkit` is Babylon's frontend monorepo. It ships two browser dApps —
[`services/vault`](services/vault) (the BTC Vault depositor lifecycle) and
[`services/simple-staking`](services/simple-staking) (the BTC staking reference dApp) — and five
packages published to npm under `@babylonlabs-io/*` (`ts-sdk`, `babylon-tbv-rust-wasm`, `core-ui`,
`wallet-connector`, `babylon-proto-ts`).

There is no server here. No database, no session store, no privileged API key that moves value. It
is tempting to conclude that the security surface is therefore small. It is the opposite: **this
repository is the software that decides what bytes a user's own wallet signs.** It sizes Bitcoin
transactions, derives the secrets that are the only material capable of recovering a deposit,
pre-signs payout transactions built by a third party, and reveals an HTLC preimage on Ethereum. Every
one of those actions is irreversible, is attributed to the user, and has no server-side undo, no
admin key, and no reversal path.

Primary objective: **every value the user signs or commits on-chain is independently re-derived or
asserted against a trusted source — never accepted verbatim from an external party, and never
inferred from UI or browser state.**

This document describes the security model of this repository: threat model, trust boundaries,
critical invariants, and what must be preserved when making changes. It is split into five domains:

1. **Transaction construction and signing** (WASM value boundary, fee model, presigning, wallet flags)
2. **Vault secrets, activation, and recovery material** (frozen derivation API, HTLC secret, artifacts)
3. **External data trust** (vault provider, indexer, RPC, sidecar/utils APIs, screening)
4. **Browser runtime and delivery** (CSP, SRI, local storage, telemetry, static hosting)
5. **Supply chain and CI** (published packages, WASM pin, install policy, workflows)

## Reporting a vulnerability

**This repository is public. Do not open a GitHub issue, pull request, or discussion for a security
vulnerability.**

Report privately through either channel:

- Email `security@babylonlabs.io`
- [GitHub Private Vulnerability Reporting](https://github.com/babylonlabs-io/babylon-toolkit/security/advisories/new)

The organisation-wide policy in
[`babylonlabs-io/babylon`](https://github.com/babylonlabs-io/babylon/blob/main/SECURITY.md) governs
disclosure timelines and researcher conduct — including the requirement not to test against
Babylon's public mainnet, testnet, or frontends. Read it before testing.

Include: the commit hash, affected package/service and code pointers, a minimal proof of concept or
precise reproduction steps, expected versus actual behaviour, and a proposed severity using the
rubric below.

## Scope and non-goals

- This document covers the code in this repository. The **vault smart contracts**, the
  **BaBe / vaultd protocol**, and the **vault provider daemon** are out of scope; see
  `babylonlabs-io/vault-contracts` and `babylonlabs-io/btc-vault`.
- The transaction, vault-secret, external-data, and browser controls below primarily describe
  `services/vault` and its supporting SDK packages. `services/simple-staking` shares the repository's
  supply-chain controls but has its own signing flows and currently has no CSP meta tag; that missing
  browser control is a known gap, not an implied inheritance from the vault app.
- The backend services this frontend talks to each carry their own `SECURITY.md`:
  [`babylon-vault-indexer`](https://github.com/babylonlabs-io/babylon-vault-indexer),
  [`babylon-sidecar-api`](https://github.com/babylonlabs-io/babylon-sidecar-api),
  [`utils-api`](https://github.com/babylonlabs-io/utils-api),
  [`babylon-btc-monitor`](https://github.com/babylonlabs-io/babylon-btc-monitor). Read those for the
  server side of any boundary described here.
- **Nothing in this repository is an enforcement boundary.** The vault app is a static bundle running
  in a user-controlled browser. Every check it performs — address screening, geofencing, amount caps,
  kill-switch flags — is advisory, defeated by anyone willing to edit their own JavaScript. Controls
  that must actually hold belong in the contracts or in a server the user does not control. This
  document describes what these checks protect users _from mistakes and from a hostile
  counterparty_, not what they protect the protocol from.
- The repository **terminates no TLS and serves no HTTP**. Builds are static artifacts uploaded to
  S3 and served through a CDN. Response headers (HSTS, CSP-as-header, `X-Frame-Options` on the real
  origin), TLS policy, and edge rate limiting are **deployment responsibilities** — see _Delivery and
  response headers_.
- The user's **wallet, browser, extension set, and OS are trusted and unverified**. A malicious
  extension injected into the app's origin, or a wallet that silently signs something other than what
  it was handed, defeats every control described here. The mitigations below reduce what a _remote_
  attacker or a _hostile counterparty_ can do; they do not survive local compromise.
- There is **no authentication of users**. There are no accounts and no server-side sessions. The
  only bearer credential in the app is the vault-provider CWT, which the user's own Bitcoin key
  mints, scoped to one peg-in.

## At a glance (for reviewers)

- **Roles:** the dApp is a transaction _constructor_ and _signing orchestrator_. It reads from
  Ethereum, Bitcoin, an indexer, and a vault provider; it writes only through the user's wallet.
- **Security boundaries to preserve:**
  - Assertion of every WASM-returned value before it reaches a signed transaction
    (`packages/babylon-tbv-rust-wasm/src/value-guards.ts`, `.../src/index.ts`)
  - Agreement between the SDK fee model and the dApp estimate
    (`packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts`,
    `.../utils/utxo/selectUtxos.ts`, `services/vault/src/hooks/deposit/useEstimatedBtcFee.ts`)
  - Local construction of every PSBT the depositor signs, from on-chain-sourced connector data
    (`packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts`)
  - The frozen vault-secret derivation API and the `VAULT_WASM_COMMIT` pin
    (`packages/babylon-ts-sdk/src/tbv/core/vault-secrets/`,
    `packages/babylon-tbv-rust-wasm/scripts/build-wasm.js`)
  - Pinning the VP's server identity to the on-chain `VaultProvider.btcPubKey`
    (`packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts`)
  - Strict shape validation of everything read back from `localStorage`
    (`services/vault/src/storage/peginStorage.ts`)
  - Telemetry scrubbing, and the deliberate absence of Sentry tracing and session replay
    (`services/vault/src/utils/telemetry.ts`, `services/vault/sentry.client.config.ts`)
  - The CSP `<meta>` tag as the single source of truth, and the SRI build gate
    (`services/vault/index.html`, `services/vault/src/build/sriPlugin.ts`)
  - Install policy: frozen lockfile, store integrity verification, `minimumReleaseAge`, and the
    `onlyBuiltDependencies` allowlist (`.npmrc`, `pnpm-workspace.yaml`)
- **High-risk areas (extra review):** the eight critical-path groups enumerated in
  [CLAUDE.md → CRITICAL PATHS](CLAUDE.md#critical-paths--human-review-required) and mirrored in
  [`.github/CODEOWNERS`](.github/CODEOWNERS), plus:
  - `packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/` — the whole untrusted-counterparty
    surface, including `auth/` and `validators.ts`
  - `services/vault/src/services/artifacts/artifactDownloadService.ts` — ~1 GB partially-validated
    recovery payload
  - `services/vault/src/config/env.ts` — every deployment parameter, and the fallback path
  - `services/vault/index.html` — the CSP
  - `services/vault/vite.config.ts`, `services/vault/src/build/sriPlugin.ts` — build integrity
  - `.github/workflows/`, `.npmrc` — supply chain

## Assets and data classification

The frontend stores no server-side secrets. Its confidentiality assets are the user's own key
material and the derived secrets that key material produces; its integrity assets are every value
that reaches a signature.

### Confidential (MUST NOT be logged, telemetered, or persisted outside their intended store)

- **Vault-secret material** — the vault root, WOTS seed and terminals, HTLC preimages, and the
  auth-anchor preimage. These are derived in-browser from a wallet-produced context hash. Anyone
  holding them for a vault can impersonate the depositor's recovery position. They are enumerated by
  exact field name in the `SENSITIVE_FIELD_NAMES` denylist in
  `services/vault/src/utils/telemetry.ts`; that list is the redaction contract, not a convenience.
- **Vault-provider bearer tokens** (CWTs minted by `auth_createDepositorToken`). Scoped to one
  peg-in, short-lived, held in memory only. They must not reach `localStorage`, a URL, or telemetry.
- **BaBe Decryptor claimer artifacts** — the payload that lets a depositor claim independently of the
  VP. Downloaded to the user's disk; never transmitted anywhere by this app.
- **CI credentials** — `SENTRY_AUTH_TOKEN`, the AWS OIDC role assumed by
  `.github/workflows/service-release-vault.yml`, and the npm publish identity used by
  `package-release.yml`. Compromise of the AWS role means arbitrary JavaScript served to every vault
  user; compromise of the npm identity means arbitrary code in every downstream consumer.
- **`E2E_WALLET_MNEMONIC` / `E2E_WALLET_PASSWORD`** (`services/vault/e2e/real/secrets.ts`). Real
  signet/Sepolia funds. Sourced from the environment or a gitignored `.env.local`; must never be
  committed, printed, or added to a CI log.

### Sensitive (user-identifying; minimise, redact before emitting)

- **Bitcoin and Ethereum addresses, public keys, amounts, UTXO sets, and raw transaction hex.** None
  of these is secret — they are public chain data — but their _association with one browser session_
  is a wallet fingerprint. `scrubString` and `redactData` in `services/vault/src/utils/telemetry.ts`
  strip them from Sentry events and breadcrumbs by regex and by field name.

### Not confidential, but integrity-critical

- **Every value that enters a signature or an on-chain commitment**: HTLC output values, peg-in
  amounts, fee totals, payout amounts, the challenger set, `depositorWotsPkHash`, and the OP*RETURN
  auth-anchor preimage. Their correctness \_is* the security property.
- **The built bundle on S3 and its SRI hashes.** Whoever can write to the bucket decides what code
  runs in every user's browser with their wallet connected.

## Threat model (assumed adversaries)

- **A. Malicious or compromised vault provider.** Builds the transaction graph the depositor
  pre-signs, returns the challenger set, and issues bearer tokens. This is the strongest
  _protocol-level_ position against a depositor: it supplies the values and the metadata that shape
  what gets signed. Goal: obtain a signature over a spend the depositor did not intend, or withhold
  material the depositor needs to recover.
- **B. Malicious or compromised indexer / GraphQL endpoint.** Defines what the UI believes about
  every vault's status. Cannot forge a signature, but can induce a user to take an irreversible
  action (activate, broadcast, withdraw, repay) against a false picture of the world — which is
  exactly the failure the indexer's own `SECURITY.md` names as its primary risk.
- **C. Malicious or degraded RPC / mempool / sidecar / utils-api.** Defines "what Ethereum said",
  "what Bitcoin said", fee rates, provider logos, and the sanctions verdict. A wrong fee rate
  underfunds a transaction; a wrong contract read redirects the app to the wrong contract set.
- **D. Attacker in the page's origin.** A malicious or compromised browser extension, a successful
  XSS, or an attacker who can modify the delivered bundle (S3/CDN write, or a build-pipeline
  compromise). Owns the app outright: can rewrite what the wallet is asked to sign. This is the
  highest-impact adversary in this repository and the reason CSP, SRI, and supply-chain policy are
  load-bearing rather than hygiene.
- **E. Malicious or non-conforming wallet.** May sign something other than what it was handed, may
  ignore `useTweakedSigner: false` / `autoFinalized: false`, or may return success for a signature
  that is invalid. Wallet support for the non-standard taproot script-path flags is genuinely
  inconsistent — this is an observed condition, not a hypothetical.
- **F. Supply chain attacker.** A malicious npm release inside the dependency tree, a compromised
  GitHub Action, or a hostile revision of the external `vault-wasm` repository that
  `build-wasm.js` clones at build time.
- **G. Operator misconfiguration.** A wrong or missing `NEXT_PUBLIC_*` value at build time. Because
  every deployment parameter — contract addresses, RPC URL, chain id, screening endpoint — is a
  build-time environment variable baked into a static bundle, a config mistake ships as a release.
  Historically the most likely failure mode for a frontend.

The user is not an adversary in this model. The user is where every impact lands.

## 1) Transaction construction and signing

This is the domain where a bug destroys value directly. The governing rules live in
[CLAUDE.md → CRITICAL PATHS](CLAUDE.md#critical-paths--human-review-required); this section states
_why_ they exist. Both documents must be updated together.

### The WASM value boundary

`packages/babylon-tbv-rust-wasm/src/index.ts` is the JS surface over a Rust/WASM module that computes
`htlcValue = peginAmount + depositorClaimValue + p2aAnchorValue + minPeginFee` internally. JavaScript
receives numbers with no inherent validation: `wasm-bindgen` will happily hand back `0n`, and a
`0n` HTLC value silently produces a transaction that funds nothing.

The mitigation is `assertWasmBigint` / `assertPositiveBigintArray`
(`packages/babylon-tbv-rust-wasm/src/value-guards.ts`), applied to every value crossing the boundary
before it is used. Reviewer rule, restated from CLAUDE.md:

> **Every WASM output consumed by JS must be asserted against expected bounds before use.** If a
> WASM-returned value feeds a signed transaction, cross-check it against an independently computed
> expected value.

Adding a new WASM getter without a guard is the easiest way to introduce a silent-wrong-value bug in
this repository. The guard is not defence in depth here — it is the only check.

### Fee model consistency

Two independent implementations must agree before broadcast:

- `packages/babylon-ts-sdk/src/tbv/core/utils/fee/peginFeeMath.ts` — the shared Pre-PegIn vsize/fee
  model
- `packages/babylon-ts-sdk/src/tbv/core/utils/utxo/selectUtxos.ts` — UTXO selection with iterative
  fee recalculation
- `services/vault/src/hooks/deposit/useEstimatedBtcFee.ts` — the dApp-side estimate, which delegates
  to the SDK model

A mismatch underfunds the transaction. The cross-check assertion belongs **at the broadcast site**,
not only at the estimator — an estimator that agrees with itself proves nothing.

The real SDK model and dApp estimator are covered by
[`.github/CODEOWNERS`](.github/CODEOWNERS) and
[`.github/workflows/critical-path-check.yml`](.github/workflows/critical-path-check.yml). The
critical-path inventory is hand-maintained in five places: this file, CLAUDE.md, CODEOWNERS,
`critical-path-check.yml`, and `claude-md-drift.yml`. Update all five together when a path moves or
is added. The scheduled drift workflow checks that listed paths exist and reports missing entries to
a tracker issue, but it does not block a pull request.

### Presigning the depositor graph

`packages/babylon-ts-sdk/src/tbv/core/services/deposit/signDepositorGraph.ts` orchestrates the
depositor's signature over the Payout transaction and one NoPayout transaction per challenger. The
transaction hexes come from the vault provider — adversary **A**.

The core design decision is that **PSBTs are built locally, never accepted from the VP**. Every field
that enters the Taproot sighash — `witnessUtxo`, `tapLeafScript`, `controlBlock`, `tapInternalKey` —
is constructed from on-chain connector parameters. A VP that could supply that metadata could make a
depositor's signature valid for a different spend while the displayed transaction looked correct.

Two further invariants, both asymmetric in their failure mode:

- **Payout value.** Re-derive the expected payout from on-chain or WASM-computed sources and assert
  equality before signing. Never sign a value handed to us.
- **Challenger set.** `deriveLocalChallengers` computes `LocalChallengers` from the on-chain VK list,
  matching the Rust reference in `btc-vault crates/vault/src/tx_graph/graph.rs`. The VP-returned
  `challenger_presign_data` set must equal `local ∪ universal` **exactly**. Undersigning leaves
  recovery material missing for an active challenger; oversigning hands a signature to a key the
  protocol does not recognise. Neither direction is safe to round off.

Signatures produced are verified against the expected sighash
(`primitives/psbt/verifyScriptPathSchnorrSignature.ts`) rather than trusted because the wallet
returned success.

### The Ledger vault signer package

`packages/babylon-ledger-vault-signer/src/` is the host-side client for the Ledger vault app: APDU
framing, the intent-ceremony TLV encoder the depositor physically approves, the device envelope
gate, and (from #2219) the SIGN_PSBT merkleized-PSBT client. A wrong encoding here puts wrong terms
in front of a hardware signer with a trusted screen — the user approves what we built, so building
it wrong defeats the device. Encodings cite firmware/reference-client sources and carry
golden-vector tests; payload bytes are never logged. The golden vectors are generated from
Ledger's pinned reference client over pinned firmware fixtures — review of vector changes is
by whole-tree re-derivation and byte-identity (see the vendor README), and the generators in
`packages/babylon-ledger-vault-signer/scripts/` are treated as critical source.

### Non-standard wallet signing flags

`packages/babylon-ts-sdk/src/tbv/core/utils/signing.ts` sets `useTweakedSigner: false` and
`autoFinalized: false` for taproot script-path spends. Wallet support is inconsistent and failures
are silent — a wallet that ignores the flags returns a signature that is well-formed and invalid.

**Every signature produced with these flags must be validated against the expected sighash before
the PSBT is treated as signed.** A wallet's success return is not evidence.

### Multi-vault splits and broadcast ordering

`packages/babylon-ts-sdk/src/tbv/integrations/aave/utils/vaultSplit.ts` sizes split outputs and
requires ordered broadcast. Assert `sum(splitOutputs) === totalDeposit - fees` before signing, and
assert broadcast ordering with explicit sequence checks — not by relying on array iteration order,
which a future refactor can reorder without any test noticing.

## 2) Vault secrets, activation, and recovery material

### The frozen derivation API

The functions listed under
[CLAUDE.md → CRITICAL PATHS §4](CLAUDE.md#critical-paths--human-review-required) are marked
`@stability frozen`. They feed `wallet.deriveContextHash` and produce on-chain commitments:
`depositorWotsPkHash`, the HTLC hashlock, and the OP_RETURN auth-anchor preimage.

**Any byte-level change to layout, ordering, label, or HKDF `info` rotates the secrets and
invalidates every existing deposit.** Users cannot derive matching keys, cannot activate, and cannot
resume. This is not a compatibility inconvenience — it is permanent loss of access for in-flight
deposits.

Treat any such change as a hard fork requiring: a coordinated revision of `derive-vault-secrets.md` /
`derive-context-hash.md`; updated golden vectors in `btc-vault` (`golden_vectors_pinned`), in
vault-wasm (`lib.rs`), and in `vault-secrets/__tests__/expand.test.ts`; and a migration plan for
in-flight deposits.

### The `VAULT_WASM_COMMIT` pin

`packages/babylon-tbv-rust-wasm/scripts/build-wasm.js` pins `VAULT_WASM_COMMIT` and clones the
external vault-wasm facade repository **at build time**. That commit — and the `btc-vault` revisions
it bundles — is the byte-level source of truth for the HKDF `info` encoding, labels, and i2osp
prefixes.

Two consequences, both easy to underrate:

- **A bump of this constant is equivalent to editing the frozen API.** If it changes any expander's
  output, it rotates every user's secrets. Re-run the JS golden-vector gate on every bump, without
  exception.
- **It is a build-time network dependency on another repository.** The build fetches and executes
  code from a remote git revision. The pin is what makes that safe; a floating branch or a
  force-pushed tag would not be. See _Supply chain_.

### HTLC secret and activation

`services/vault/src/services/vault/vaultActivationService.ts` submits the preimage that unlocks the
HTLC on-chain. A wrong secret locks funds permanently.

When a hashlock is supplied, the SDK re-checks `sha256(secret) === hashlock` immediately before
assembling calldata — the last defence before the secret enters `simulateContract`. The vault app
always supplies the required hashlock; SDK consumers must do the same to receive this pre-check.
Preserve that placement: a check performed earlier in the flow proves nothing about the value that
actually ships. **Derive the secret only from the source that generated it; never infer it from UI or
storage state.**

### Claimer artifacts — recovery material with partial validation

`services/vault/src/services/artifacts/artifactDownloadService.ts` fetches the BaBe Decryptor
artifacts a depositor needs to claim their vault independently of the VP. Two properties matter:

- The payload is roughly **1 GB**, so it is streamed and retained as a `Blob`. Full schema validation
  is deliberately deferred until the backend supports streaming delivery. Today only small responses
  (expected JSON-RPC error envelopes, under 4 KiB) are parsed and validated; large responses are
  checked **structurally, from the first 64 KiB of the JSON-RPC envelope prefix only**.
- **This is a known gap.** A malicious VP can return a well-formed envelope wrapping a useless or
  corrupted artifact body, and the app will accept it, mark the artifacts downloaded
  (`services/vault/src/utils/artifactDownloadStorage.ts`), and stop warning the user. The user
  discovers the problem only when they need to claim. Closing this requires end-to-end validation of
  the artifact body — treat it as a fund-recovery item, not a robustness improvement.

`hasArtifactsDownloaded` is a `localStorage` flag whose failure mode is deliberately safe: on quota
error or private browsing, the write silently fails and the gate keeps warning. Preserve that
direction. Never invert it into "assume downloaded on write failure".

### `localStorage` is an untrusted boundary that holds unrecoverable state

`services/vault/src/storage/peginStorage.ts` holds the funded Pre-PegIn transaction hex, selected
UTXOs, the derived vault id, and the build-time parameter versions — everything needed to resume or
broadcast a deposit. It is simultaneously:

- **The only copy** of some of that state. Clearing site data mid-flow can strand a deposit.
- **Attacker-writable** under adversary **D**, and user-editable via devtools by anyone.

`hasValidSecurityFields` therefore strict-checks every field used in a security-relevant path —
`id` and `peginTxHash` as `bytes32` hex, `status` against a closed enum, UTXO `txid` as 64-hex,
`vout` as a non-negative integer, `value` as a positive safe integer, `scriptPubKey` as even-length
raw hex, and `unsignedTxHex` as either the empty cross-device marker or non-empty hex. The comment on
that function names the concrete DoS it prevents: a non-string `id` would throw inside
`normalizeTransactionId`, land in the outer catch, and wipe the entire storage key — one tampered
entry destroying every pending deposit record.

Broadcastable statuses additionally require all four `build*Version` fields, which are asserted
against on-chain vault registration before any resume broadcast. Entries missing them are filtered
out of `getPendingPegins` rather than broadcast on stale parameters.

Invariant: **no value read from `localStorage` may reach PSBT construction, vault matching, or ID
normalisation without passing the validator.** Adding a field that drives a transaction and skipping
the validator reopens this hole.

## 3) External data trust

### Vault provider — the hostile-counterparty boundary

All VP traffic goes through the vault-provider proxy (`NEXT_PUBLIC_TBV_VP_PROXY_URL`,
`services/vault/src/utils/rpc/vpProxy.ts`), addressed per-VP as `${VP_PROXY_URL}/rpc/${vpAddress}`.
The proxy is what dereferences provider-supplied URLs and enforces SSRF policy — the frontend never
fetches a provider-supplied URL directly, and must not start.

**Server identity is pinned to the chain.**
`packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/serverIdentity.ts` verifies a
BIP-322 signature by the VP's persistent key over
`(SERVER_IDENTITY_DOMAIN, ephemeral_pubkey, expires_at)`, and pins `server_pubkey` against the
on-chain `VaultProvider.btcPubKey` read from the registry contract. A mismatch rejects the token.
This is what makes the proxy a transport rather than a trusted party: a compromised proxy cannot
mint an identity it does not hold the key for.

Related bounds worth preserving:

- `DEFAULT_MAX_PROOF_LIFETIME_SECS` (2h) caps how long a leaked VP ephemeral key stays usable. The
  bearer token's own TTL is a different trust boundary and does not bound this.
- `MAX_EXPIRES_AT_SECS` guards against a bogus far-future `expires_at` locking the token cache on a
  bad token forever. It is defined in
  `packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/auth/tokenProvider.ts`.
- `AUTH_GATED_METHODS` and `GRPC_AUTH_GATED_METHODS` (`auth/gatedMethods.ts`) are marked
  `@stability frozen` and must stay in sync with the VP server. The two sets differ by CWT subject;
  conflating them yields a token the server's interceptor rejects.

**Every VP response is validated at runtime.**
`packages/babylon-ts-sdk/src/tbv/core/clients/vault-provider/validators.ts` checks the
security-relevant fields — status enums, txids, pubkey lengths and hex shape — because the generic
JSON-RPC client casts responses without inspection. `VpResponseValidationError` deliberately splits
a safe user-facing `.message` from a technical `.detail` for logs; keep that separation, and keep
`VP_ERROR_PREVIEW_MAX_LEN` bounded so a hostile VP cannot flood logs through an error path.

`JsonRpcClient` caps typed responses at 2 MiB by default and retries only read methods. **Write
methods are not retried by default** — preserve that; a retried write is a duplicate submission.
`callRaw` is intentionally uncapped for the artifact stream and is the one path where the size bound
does not apply.

### Indexer (GraphQL)

`services/vault/src/clients/graphql/client.ts` reads vault state from
`NEXT_PUBLIC_TBV_GRAPHQL_ENDPOINT` with a 30s timeout. The endpoint is unauthenticated and the data
is public; the risk is **integrity**, per adversary **B**.

The app's defence is not to trust the indexer for anything irreversible: statuses drive UI and
polling, but the values that enter a signature come from chain reads or local derivation. Reviewer
rule: **if a new code path lets an indexer-sourced value reach a transaction, a signature, or an
amount displayed as authoritative for an irreversible action, that is a design change, not a
refactor.** `services/vault/src/context/deposit/` already encodes this distinction — see
`terminalMilestones.ts`, which explicitly refuses to classify a vault from a `localStorage`-only
status and requires an indexer-sourced one, and `computeDepositPollingResult.ts`, which keeps
network-derived state independent of local storage so every tab converges.

### Ethereum RPC and the registry trust root

`services/vault/src/clients/eth-contract/client.ts` builds a single viem `PublicClient` over
`NEXT_PUBLIC_ETH_RPC_URL` with Multicall3 batching and `retryCount: 1` (viem's default of 3
amplifies 429s; React Query is the outer retry layer).

The RPC is a **trusted dependency with unverified output** — the app performs no header or proof
validation. More importantly: `NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY` is the address from which the
rest of the contract set is discovered. **A wrong registry address redirects the app to an
attacker's contracts wholesale.** Treat that build-time variable with the care of a key
configuration, not a URL.

### Environment configuration — the fail-fast path and its fallback

`services/vault/src/config/env.ts` validates every `NEXT_PUBLIC_*` input at module load: required
addresses must be valid, non-zero EVM addresses; required URLs must parse and use `http:`/`https:`;
`ETH_CHAINID` must be exactly `1` or `11155111`; `BTC_NETWORK` must be `mainnet` or `signet`. Errors
accumulate into `envInitError`, which `GeoFencingProvider` turns into a **blocking** error modal
before the app is usable.

The subtlety worth understanding: on validation failure the runtime is **still initialised**, with a
known-invalid signet/Sepolia fallback (`https://invalid.local`). This is deliberate — modules later
in the import graph read config at evaluation time and an uninitialised runtime would crash before
the blocking modal could render. It is only safe as long as the blocking modal genuinely blocks.
**Any change that lets the app render an actionable surface while `envInitError` is set converts a
loud misconfiguration into a silent one operating on fallback network parameters.**

Note the interaction with CSP: `ALLOWED_URL_SCHEMES` accepts `http:`, but the CSP `connect-src`
permits only `self`, `https:`, `wss:`, and `localhost`. A plaintext non-localhost endpoint therefore
passes env validation and is then blocked at runtime by the browser. That is a safe outcome, but it
fails as a CSP violation rather than as a config error — do not rely on env validation alone to keep
production endpoints on TLS.

### Address screening — advisory, and silently optional

`services/vault/src/clients/address-screening/verifyAddress.ts` calls `utils-api`'s screening
endpoint and allows only `low` / `medium` risk. `AddressScreeningProvider` **hard-blocks on network
error** and deliberately does not cache that outcome, so a retry can succeed. That direction is
correct and matches the caller contract stated in `utils-api`'s own `SECURITY.md`.

Two properties that must be stated plainly rather than assumed:

- **It is fail-open when unconfigured.** `UTILS_API_URL` is parsed by `parseOptionalUrl`, which
  returns `undefined` for an absent _or malformed_ value after logging a warning; `verifyAddress`
  then returns `true` — allow — for every address. A typo in `NEXT_PUBLIC_TBV_UTILS_API` ships a
  build with screening entirely disabled and no user-visible signal. This is the frontend's
  equivalent of `utils-api`'s stub-screener risk, and it deserves the same treatment: a deployment
  gate, or a startup assertion that refuses to run unscreened in a production environment.
- **It is not an enforcement boundary.** The verdict is cached in `localStorage`
  (`addressScreeningStorage.ts`, 24h TTL, network-scoped key) and both the cache and the code are
  fully under the user's control. Client-side screening keeps honest users from tripping a
  compliance control; it stops nobody who wants past it. The same applies to geofencing
  (`GeoFencingProvider`) and to the `NEXT_PUBLIC_FF_*` kill-switches in `config/featureFlags.ts`:
  useful incident levers, not access control. Anything that must actually hold belongs on-chain.

### Provider metadata and other attacker-controlled strings

Provider names, logo URLs, and similar metadata originate from an on-chain registry any registered
provider can write, and reach the UI via the indexer and the sidecar. **Treat them as
attacker-controlled input.**

Today the app is safe here for a structural reason worth preserving explicitly: **no HTML-injection
sink — `dangerouslySetInnerHTML`, an `innerHTML` write, `eval`, or `new Function` — exists in
`services/vault/src` or in any package's source** (the only `innerHTML` references in the tree are
read-only assertions inside tests), so React's default escaping handles every rendered string. That
property is one convenience PR away from being lost. Introducing any HTML sink for provider-sourced content is a
security change requiring explicit argument, not a rendering detail.

External links use `target="_blank"`; keep `rel="noopener"` on all of them.

## 4) Browser runtime and delivery

### Content Security Policy

The vault app's CSP lives **solely** in the `<meta http-equiv="Content-Security-Policy">` tag in
`services/vault/index.html`. `services/vault/vite.config.ts` documents why it is not also a
dev-server header: delivering it as a header would additionally govern the inline React Fast Refresh
preamble that `@vitejs/plugin-react` injects above the meta tag, which carries no nonce and would
white-screen `pnpm dev`. One source of truth, and it is the one that ships to the CDN.

`services/simple-staking/index.html` has no CSP meta tag. Unless its deployment adds an equivalent
response header, that dApp does not inherit the vault app's script or connection restrictions. Treat
this as a known gap when reviewing simple-staking browser changes.

Current policy:

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
connect-src 'self' https: wss: http://localhost:* ws://localhost:*;
img-src 'self' data: https: blob:;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' data: https://fonts.gstatic.com https://fonts.reown.com;
object-src 'none'; base-uri 'self'; form-action 'self';
worker-src 'self' blob:;
frame-src 'self' https://verify.walletconnect.com https://verify.walletconnect.org https://secure.walletconnect.org;
```

Reviewer notes:

- **`script-src` is the strong directive and must stay that way.** No `'unsafe-inline'`, no
  `'unsafe-eval'`; `'wasm-unsafe-eval'` is the narrow grant the Rust/WASM module requires. Adding
  either unsafe keyword to `script-src` would neuter the single most valuable control against
  adversary **D** and is a blocking review item.
- **`connect-src https: wss:` is the weakest directive** and is effectively "any TLS host". It is
  wide because the app talks to a per-environment set of RPC, indexer, sidecar, VP-proxy, mempool,
  and WalletConnect relay hosts that varies by deployment. It means CSP provides **no meaningful
  exfiltration control**: injected script can reach any HTTPS host. Narrowing this to an explicit
  per-environment allowlist is the highest-value CSP hardening available here, and it is the
  precondition for treating CSP as a containment boundary rather than a script-injection control.
- The `http://localhost:*` and `ws://localhost:*` carve-outs are **load-bearing for development**,
  not leftovers: `ws://localhost` is the Vite HMR socket (a page's `'self'` does not reliably match
  the `ws:` scheme) and `http://localhost:<port>` covers the Playwright mock servers in
  `playwright.config.ts`. Removing them breaks HMR and the e2e suite with silent CSP blocks rather
  than build errors. They are also a live relaxation in production builds — a reason to prefer an
  environment-specific CSP over one shared string.
- `style-src 'unsafe-inline'` is required by the current styling approach. It is a real weakness
  (CSS-based exfiltration, UI redress) but a much smaller one than a script grant.

### Subresource Integrity

`services/vault/src/build/sriPlugin.ts` adds `integrity` + `crossorigin` to every local script and
module-preload in the built `index.html`, and **throws at build time** if any local JS script is left
unprotected. Two details that are correct and non-obvious:

- Hashes are computed from the bytes Vite actually writes to disk, in `closeBundle`, not from the
  in-memory `chunk.code` during `generateBundle`. The entry chunk's sibling-import references are
  rewritten after `generateBundle`, so a hash taken there is stale and the browser rejects the entry
  script — a blank app with no error the build would catch.
- The unprotected-script check is a **build gate**, not a warning. Preserve it; a warning here would
  be ignored exactly once.

SRI protects against a modified asset served from the CDN. It does **not** protect `index.html`
itself — nothing does, on a static host. Whoever can write `index.html` in the bucket controls the
CSP, the SRI hashes, and the script list. This is why the S3/OIDC write path in
`.github/workflows/service-release-vault.yml` is treated as key material.

The workflow emits per-file and global `sha256sum` manifests alongside every upload. Those are the
artifact that makes "is what is being served what we built?" answerable — use them.

### Delivery and response headers

`SECURITY_HEADERS` in `vite.config.ts` (`X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Permissions-Policy`) applies to the **dev and preview servers only**. Production
is a static S3 origin behind a CDN.

**Known gap:** whether those headers — and HSTS, which is not set anywhere in this repository — reach
production users depends entirely on CDN configuration that lives outside this repo. The `<meta>`
CSP does ship, but `X-Frame-Options` and HSTS **cannot** be delivered via `<meta>`. Verify the edge
configuration sets them; do not infer their presence from this file. A dApp that can be framed is a
clickjacking target with a wallet attached.

### Telemetry and PII

`services/vault/sentry.client.config.ts` is unusually explicit about what it does _not_ enable, and
those absences are the control:

- **Performance tracing is off.** `beforeSend` (and therefore `scrubSentryEvent`) runs only on error
  and message events — never on transaction envelopes, which need a separate hook. With
  `browserTracingIntegration`, auto-instrumented fetch spans carry full request URLs, and this app
  fetches `${UTILS_API_URL}/address/screening?address=<btc-addr>`. Enabling tracing without a
  transaction-side URL scrubber transmits depositor addresses unredacted.
- **Session Replay is off**, for the same structural reason: replay envelopes bypass `beforeSend`,
  and `maskAllText` / `maskAllInputs` do not mask request URLs or `href` attributes — both of which
  carry the depositor's BTC address in this app.

**Re-enabling either is a privacy change, not a configuration tweak.** Each requires its own
redaction hook first.

`services/vault/src/utils/telemetry.ts` handles the rest: regex scrubbing of BTC/ETH/BBN addresses
and long hex, a field-name denylist for values the regexes cannot see (amounts are numbers; secrets
travel under known keys), and — importantly — binary handling. `isBinary` and `isByteArray` exist
because `Object.entries` on a `Uint8Array` spreads it into `{0: 222, 1: 173, …}`, leaking every byte
as a plain number, and because `Array.from(uint8Array)` (how the WOTS terminals are already stored)
defeats `ArrayBuffer.isView` entirely.

The denylist is keyed on **exact field names** deliberately, so redaction never depends on a value
happening to be 64+ hex. **A rename, truncation, or re-encoding in a future refactor must be
accompanied by a denylist update** — that is the failure mode this design is guarding against, and
it is silent.

The Sentry user id is a random UUID in `localStorage`, not a wallet address. Keep it that way.

### Wallet integration

`packages/babylon-wallet-connector` abstracts injected BTC and ETH wallets plus WalletConnect/Reown
(`NEXT_PUBLIC_REOWN_PROJECT_ID`, absence of which throws rather than degrading). Injected wallet
objects are attacker-adjacent by nature — any extension can inject one. Validate everything received
from a wallet API before use: addresses, public keys (`validateWalletPubkey`), and signatures. Never
treat a wallet's success return as proof of a correct signature; see _Non-standard wallet signing
flags_.

## 5) Supply chain and CI

For a frontend, the supply chain **is** the attack surface: a malicious transitive dependency
executes in the same origin as the signing flow, with the user's wallet connected.

### Install policy

`.npmrc` and `pnpm-workspace.yaml` encode the current posture:

- `prefer-frozen-lockfile` locally, `--frozen-lockfile` in every workflow
- `verify-store-integrity = true`
- `minimumReleaseAge = 1440` — no package younger than one day is installed. This is the single most
  effective control against the common "compromised maintainer publishes, gets yanked within hours"
  pattern. **Do not lower it.**
- `onlyBuiltDependencies` — an explicit allowlist of packages permitted to run install scripts.
  Everything else installs without executing arbitrary code. Adding an entry here grants arbitrary
  code execution on every developer machine and CI runner; it is a security review, not a build fix.
- `engine-strict`, plus root `pnpm.overrides` pinning `@walletconnect/logger` and
  `@sats-connect/core>axios` to exact versions and enforcing a `js-yaml >=4.1.1` minimum-version
  floor.

CLAUDE.md additionally requires **pinned exact versions** (no `^`) for new dependencies, especially
crypto packages, and an explicit supply-chain audit before adding one. `syncpack` enforces a single
version policy across the workspace in CI.

**Known gap: there is no `pnpm audit` (or equivalent SCA) gate in
[`.github/workflows/verify.yml`](.github/workflows/verify.yml).** Nothing in CI fails on a known
vulnerable transitive dependency. Adding one — even advisory-only at first — is the cheapest
available improvement in this section.

### Published packages

Five packages ship to npm from `package-release.yml`, which runs with `id-token: write` for
provenance. Downstream consumers of `@babylonlabs-io/ts-sdk` and
`@babylonlabs-io/babylon-tbv-rust-wasm` inherit this repository's transaction-construction and
secret-derivation logic wholesale.

Consequences: a bug in the SDK is not confined to Babylon's own dApp, and a compromise of the npm
publish identity is a supply-chain event for every integrator. Release-affecting changes to
`package-release.yml`, `release.config.js`, or `tools/` warrant the same scrutiny as a change to a
critical path.

### The WASM build dependency

`packages/babylon-tbv-rust-wasm/scripts/build-wasm.js` clones an external repository at a pinned
commit and compiles it during the build. The pin is the entire control: it is what turns
"execute code from a remote repo" into "execute this exact reviewed revision". A branch reference,
a mutable tag, or a skipped verification would remove it. See also _The `VAULT_WASM_COMMIT` pin_ —
the same constant is simultaneously a supply-chain pin and a protocol-compatibility pin, and the two
roles have different review requirements. Satisfy both.

### Workflows

- All third-party actions are **pinned to full commit SHAs** with a version comment. Preserve this;
  a tag reference is mutable.
- `verify.yml` runs syncpack, a full build, lint, and `nx affected --target=test`. Note that tests
  are **affected-scoped** while build and lint are not — a change that alters behaviour without
  touching a project Nx considers affected runs fewer tests than a full sweep.
- `critical-path-check.yml` comments and labels PRs touching critical paths but **does not block**.
  Enforcement of the two-approval rule requires a GitHub ruleset scoped to those path globs with
  `required_approving_review_count: 2` — CODEOWNERS alone cannot express it, as the comment in
  `.github/CODEOWNERS` notes. Verify that ruleset exists; the file cannot.
- `service-release-vault.yml` assumes an AWS role via OIDC per environment and writes the built
  bundle to S3. Note `continue-on-error` is set for the production environment in multi-env runs so
  a prod OIDC failure cannot block devnet — deliberate, and worth knowing when reading a green run.
- `claude-md-drift.yml` checks the hand-maintained critical-path inventory weekly, records paths that
  no longer exist, and reports them to a tracker issue. It detects drift but does not gate merges;
  acting on the tracker or moving the existence check into `verify.yml` is still a human process.

### E2E secrets

`services/vault/e2e/real/` drives a real wallet against signet and Sepolia using
`E2E_WALLET_MNEMONIC` / `E2E_WALLET_PASSWORD`, loaded from the environment or a gitignored
`.env.local` in the wallet-connector package. Keep the mnemonic funded only with disposable testnet
value, never reuse it for anything else, and never let it reach a CI log or an artifact. The
gitignored local file prevents accidental inclusion by ordinary Git commands; no
repository-configured secret-scanning control is present, so review and credential hygiene remain the
only repository-local safeguards.

## Critical invariants (must not regress)

1. **Every WASM-returned value is asserted before use**, and any value feeding a signed transaction
   is cross-checked against an independently computed expectation.
2. **The SDK fee model and the dApp estimate agree**, verified at the broadcast site, not only at
   the estimator.
3. **Every PSBT the depositor signs is constructed locally** from on-chain-sourced connector data.
   No PSBT, sighash input, or payout value is accepted from the vault provider verbatim.
4. **The VP-returned challenger set equals `local ∪ universal` exactly** — no missing entries, no
   extras — with `LocalChallengers` derived from the on-chain VK list.
5. **Signatures produced with `useTweakedSigner: false` / `autoFinalized: false` are verified against
   the expected sighash** before the PSBT is treated as signed.
6. **The vault-secret derivation primitives are byte-frozen.** Any change to layout, ordering, label,
   HKDF `info`, or `VAULT_WASM_COMMIT` output is a hard fork requiring golden-vector updates on both
   the Rust and JS sides and a migration plan.
7. **When a hashlock is supplied, `sha256(secret) === hashlock` is checked immediately before
   activation calldata is assembled.** The vault app always supplies it; SDK consumers must do the
   same. The secret is sourced from its generator, never from UI or storage state.
8. **Split outputs sum exactly to `totalDeposit - fees`** and broadcast order is asserted explicitly.
9. **The VP's `server_pubkey` is pinned to the on-chain `VaultProvider.btcPubKey`**, and every VP RPC
   response passes runtime validation before any security-relevant field is used.
10. **No value read from `localStorage` reaches PSBT construction, vault matching, or ID
    normalisation without passing `hasValidSecurityFields`.**
11. **`script-src` carries no `'unsafe-inline'` and no `'unsafe-eval'`**, and the SRI build gate
    fails the build on any unprotected local script.
12. **No HTML sink** (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`) exists in
    application or package source.
13. **Sentry tracing and session replay stay disabled** until a transaction-side and replay-side URL
    redaction hook exists; the telemetry field denylist stays in sync with the field names secrets
    actually travel on.
14. **`minimumReleaseAge`, `verify-store-integrity`, frozen lockfiles, the `onlyBuiltDependencies`
    allowlist, and SHA-pinned actions** remain in force.
15. **A blocking `envInitError` blocks.** No actionable surface renders while the app is running on
    fallback network parameters.

## Attack scenarios matrix

| Area                | Adversary | Scenario                                                                          | Impact                                                                  | Mitigation                                                                                                      | Test / evidence                                                   |
| ------------------- | --------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| WASM boundary       | F/—       | A WASM getter returns `0n` or a wrong value and reaches a signed tx               | **User fund loss**                                                      | `assertWasmBigint` / `assertPositiveBigintArray` on every crossing; independent cross-check                     | `babylon-tbv-rust-wasm` value-guard tests                         |
| Fee model           | —         | SDK and dApp fee models diverge; the tx is underfunded                            | User fund loss (stuck / failed deposit)                                 | Shared `peginFeeMath`; cross-check at broadcast                                                                 | SDK fee + `selectUtxos` tests                                     |
| Critical-path guard | G         | A critical path moves but one hand-maintained inventory keeps the stale path      | Integrity (process)                                                     | All current paths are aligned; the scheduled existence check reports missing paths but does not gate merges     | CLAUDE.md, CODEOWNERS, both critical-path workflows               |
| Presigning          | A         | VP supplies PSBT metadata making a signature valid for a different spend          | **User fund loss**                                                      | PSBTs built locally from on-chain connector data only                                                           | `signDepositorGraph` tests                                        |
| Presigning          | A         | VP returns a challenger set with an extra or missing key                          | Recovery material missing / signature to an unrecognised key            | `deriveLocalChallengers` + exact `local ∪ universal` equality assert                                            | `signDepositorGraph` tests                                        |
| Wallet signing      | E         | Wallet ignores `useTweakedSigner: false`, returns an invalid signature as success | User fund loss (silent)                                                 | Sighash verification of every produced signature                                                                | `verifyScriptPathSchnorrSignature` tests                          |
| Vault secrets       | F/G       | `VAULT_WASM_COMMIT` bump rotates expander output                                  | **Permanent loss of access for every in-flight deposit**                | Frozen API; JS + Rust golden-vector gates on every bump                                                         | `vault-secrets/__tests__/expand.test.ts`, `golden_vectors_pinned` |
| Activation          | —         | Wrong preimage submitted to `activateVaultWithSecret`                             | Funds permanently locked                                                | SDK pre-check when `hashlock` is supplied; the vault app always supplies it                                     | SDK `activateVault` tests                                         |
| Artifacts           | A         | VP returns a valid JSON-RPC envelope wrapping a corrupt ~1 GB artifact body       | **Loss of independent claim capability**, discovered only at claim time | **Known gap** — only the envelope prefix is validated for large payloads                                        | close with end-to-end body validation                             |
| VP auth             | A/D       | Compromised proxy impersonates a vault provider                                   | Integrity of the whole deposit flow                                     | BIP-322 server identity pinned to on-chain `btcPubKey`; 2h ephemeral-key lifetime cap                           | `serverIdentity.test.ts`                                          |
| VP responses        | A         | Malformed or hostile VP response is cast without inspection                       | User fund loss / wedged flow                                            | `validators.ts` runtime checks; 2 MiB typed-response cap; no retry on writes                                    | `validators.test.ts`, `json-rpc-client.test.ts`                   |
| Indexer             | B         | Wrong vault status induces an irreversible user action                            | User fund loss (indirect)                                               | Signature-bound values never sourced from the indexer; `terminalMilestones` refuses storage-only classification | deposit-context tests                                             |
| Config              | G         | Wrong `NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY` points the app at attacker contracts   | **User fund loss**                                                      | Strict env validation; blocking modal on failure — but a _valid wrong address_ passes                           | deployment review                                                 |
| Screening           | G         | Typo'd or unset `NEXT_PUBLIC_TBV_UTILS_API` disables screening silently           | Compliance bypass                                                       | **Known gap** — `parseOptionalUrl` warns and returns `undefined`; `verifyAddress` then allows all               | add a production startup gate                                     |
| Screening           | —         | User edits the `localStorage` verdict or the bundle                               | Compliance bypass                                                       | None possible client-side — documented as advisory, enforcement belongs server/contract-side                    | —                                                                 |
| Local storage       | D         | Tampered entry throws in `normalizeTransactionId` and wipes all pending deposits  | Availability, loss of resume state                                      | `hasValidSecurityFields` strict shape validation                                                                | `peginStorage.test.ts`                                            |
| Delivery            | D         | Attacker with S3/CDN write serves modified `index.html`                           | **Total compromise — arbitrary code with the user's wallet connected**  | OIDC-scoped role; SHA manifests per release; SRI protects assets but not `index.html`                           | deployment review                                                 |
| CSP                 | D         | Injected script exfiltrates derived secrets to an arbitrary HTTPS host            | Confidentiality of vault secrets                                        | `script-src` blocks injection; **`connect-src https:` provides no exfiltration control**                        | narrow `connect-src` per environment                              |
| CSP                 | D         | Script injection in simple-staking runs without an application-defined CSP        | Wallet action manipulation / data exposure                              | **Known gap** — no CSP meta tag; verify whether deployment supplies an equivalent response header               | `services/simple-staking/index.html`, deployment review           |
| Headers             | D         | App is framed for clickjacking; no HSTS on the prod origin                        | Integrity                                                               | **Known gap** — `X-Frame-Options`/HSTS are dev-server-only and cannot ship via `<meta>`                         | verify CDN configuration                                          |
| Telemetry           | —         | Re-enabling tracing or replay transmits depositor addresses                       | Confidentiality (PII)                                                   | Both deliberately disabled with documented reasons                                                              | `telemetry.test.ts`                                               |
| Telemetry           | —         | Refactor renames a secret-bearing field out of the denylist                       | Confidentiality of vault secrets (silent)                               | Exact-field-name denylist; binary and byte-array handling                                                       | `telemetry.test.ts`                                               |
| Supply chain        | F         | Malicious npm release lands in the tree                                           | **Total compromise**                                                    | `minimumReleaseAge=1440`, frozen lockfile, store integrity, `onlyBuiltDependencies`, pinned versions            | `.npmrc`, syncpack in CI                                          |
| Supply chain        | F         | Known-vulnerable transitive dependency ships                                      | Varies                                                                  | **Known gap** — no `pnpm audit`/SCA gate in `verify.yml`                                                        | add advisory gate                                                 |
| Supply chain        | F         | Published SDK carries a transaction-construction bug to integrators               | User fund loss, off-repo                                                | Provenance on publish; critical-path review                                                                     | `package-release.yml`                                             |
| E2E                 | F         | `E2E_WALLET_MNEMONIC` leaks into a log or the repo                                | Loss of testnet funds; credential hygiene signal                        | Gitignored `.env.local`; no repository-configured secret-scanning control                                       | review                                                            |

## Bug severity classification (org standard v1.0)

> **This section is a shared, versioned artifact.** It is intended to be byte-identical in every
> Babylon repository that carries a `SECURITY.md`, so that we and external auditors classify
> findings the same way everywhere. Change it in one place and propagate to all repositories in the
> same PR series — do not fork the wording per repo. Repository-specific content belongs in the
> _Severity anchors_ table below, not in the rubric.
>
> **Version:** 1.0 — 2026-07-27

Severity is **Impact × Likelihood**. Rate impact assuming the bug is exploited successfully; rate
likelihood on the preconditions an attacker actually needs.

### Impact

| Level                  | Definition                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I4 — Catastrophic**  | Direct loss, theft, or permanent freezing of user or protocol funds. Also: causing an irreversible on-chain action to be taken on false information (a user or automated system acts on service output and cannot undo it).                                                    |
| **I3 — Severe**        | Compromise of a service or its credentials; bypass of an authentication, authorisation, or compliance gate; forged or corrupted state that is authoritative for a fund-safety decision but not yet acted on; disclosure of secret material (keys, tokens, DSNs, PII at scale). |
| **I2 — Moderate**      | Corruption or loss of non-authoritative state; sustained outage of a user-facing service; disclosure of non-public but non-secret information; a correctness bug that is detectable and recoverable without user loss.                                                         |
| **I1 — Minor**         | Degraded performance or partial availability with a clear recovery path; noisy or misleading failure modes; information disclosure with no practical use to an attacker.                                                                                                       |
| **I0 — Informational** | No security impact. Code quality, defence-in-depth hardening, documentation drift.                                                                                                                                                                                             |

### Likelihood

| Level           | Definition                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L3 — High**   | Remotely triggerable by an unauthenticated actor with no special preconditions, or reachable through normal protocol participation (e.g. registering as a provider).                              |
| **L2 — Medium** | Requires a realistic but non-default precondition: a specific race, an operator misconfiguration we have actually seen, a privileged-but-not-trusted position, or an unusual-but-reachable input. |
| **L1 — Low**    | Requires compromise of a trusted component or credential, physical/infrastructure access, or a conjunction of unlikely conditions.                                                                |

### Matrix

|                      | **L3 High**   | **L2 Medium** | **L1 Low**    |
| -------------------- | ------------- | ------------- | ------------- |
| **I4 Catastrophic**  | Critical      | Critical      | High          |
| **I3 Severe**        | Critical      | High          | Medium        |
| **I2 Moderate**      | High          | Medium        | Low           |
| **I1 Minor**         | Medium        | Low           | Low           |
| **I0 Informational** | Informational | Informational | Informational |

### Modifiers

Apply after the matrix, and state explicitly which modifier was applied:

- **↑ one level** if the bug is silent — it produces a wrong result with no error, log, or metric,
  so it can persist undetected.
- **↑ one level** if exploitation is not attributable to an actor (no way to identify or rate-limit
  the offender after the fact).
- **↓ one level** if a deployed compensating control outside the repository (edge rate limiting,
  network isolation, monitoring alert) reliably blocks or detects the path — cite the control.
- **No downgrade for "requires a malicious insider"** if the insider is a role the system explicitly
  distrusts in its threat model.

### Not a vulnerability

Report these as ordinary issues, not security findings: theoretical weaknesses with no reachable
path in this codebase; missing hardening with no exploitable consequence; findings that rely on
already-assumed-compromised trusted components (list them as assumption violations instead);
automated-scanner output without a demonstrated path; and denial of service that requires resources
disproportionate to the impact.

### What a report must contain

Commit hash · affected component and code pointers · minimal proof of concept or precise reproduction
steps · expected versus actual behaviour · proposed severity with the Impact and Likelihood levels
that produced it, and any modifier applied · suggested remediation if you have one.

### Severity anchors for `babylon-toolkit`

Concrete calibration examples for this repository. These are illustrations, not an exhaustive list.

| Severity          | Example finding in this repo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critical**      | Any path that lets a VP-supplied value reach a signature without independent re-derivation — a payout amount, an HTLC value, or PSBT sighash metadata (I4 × L2, ↑ silent). Removal or weakening of a WASM value guard on a path feeding a signed transaction (I4 × L2). A `VAULT_WASM_COMMIT` bump that changes expander output and ships without golden-vector verification, invalidating in-flight deposits (I4 × L2). Accepting a corrupt claimer-artifact body because only the envelope prefix is validated, discovered only at claim time (I4 × L1 → High, ↑ silent → Critical). A telemetry refactor that renames a secret-bearing field out of the denylist and silently discloses vault secrets (I3 × L2 → High, ↑ silent → Critical). Write access to the vault S3 bucket or the release OIDC role, i.e. arbitrary JavaScript in every user's browser with a wallet connected (I4 × L1 → High by matrix; ↑ raise to Critical, since it is unattributable and defeats every other control). `'unsafe-inline'` or `'unsafe-eval'` added to `script-src` (I3 × L3). |
| **High**          | Undersigning or oversigning the challenger set — recovery material missing for an active challenger, or a signature handed to an unrecognised key (I4 × L1). A wrong-but-valid `NEXT_PUBLIC_TBV_BTC_VAULT_REGISTRY` shipping to production (I4 × L1). A `localStorage`-sourced value reaching PSBT construction without passing `hasValidSecurityFields` (I3 × L2). Enabling Sentry tracing or replay without the corresponding URL scrubber, transmitting depositor addresses (I3 × L2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Medium**        | Screening silently disabled by a typo'd `NEXT_PUBLIC_TBV_UTILS_API` (I3 × L2 by impact of the compliance bypass, ↓ because the gate is advisory client-side ⇒ Medium; state the reasoning). Missing `X-Frame-Options`/HSTS at the CDN, enabling clickjacking of the dApp (I2 × L2). A known-vulnerable transitive dependency shipping because no SCA gate exists (I2 × L2). A tampered `localStorage` entry wiping all pending deposit records (I2 × L2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Low**           | An external link with `target="_blank"` and no `rel="noopener"` (I1 × L2). `connect-src https:` remaining broad in an environment where a narrow allowlist is feasible (I1 × L2 — raise if paired with any script-injection path). Verbose error text exposing an internal endpoint URL in a user-facing message (I1 × L2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Informational** | `claude-md-drift.yml` reporting stale critical paths to a tracker issue rather than gating merges. `nx affected`-scoped tests in `verify.yml` while build and lint are full-sweep.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Contributor / reviewer checklist

When changing this repository, explicitly consider:

- [ ] Does the change touch a path in
      [CLAUDE.md → CRITICAL PATHS](CLAUDE.md#critical-paths--human-review-required)? If yes: two
      code-owner approvals, the author can walk every changed line unaided (for generated golden
      vectors: reviewer-repeated re-derivation instead), and the per-path rule is
      satisfied. Say so in the PR description.
- [ ] **New value crossing the WASM boundary:** is it asserted before use? Does anything downstream
      sign it, and if so is it cross-checked against an independent computation?
- [ ] **Any change to fee math or UTXO selection:** does the other implementation still produce the
      same fee for a representative fixture? Is the assertion at the broadcast site?
- [ ] **Any change to PSBT construction or signing:** could a VP-supplied value now reach a sighash
      input or an amount without re-derivation? This is blocking.
- [ ] **Any change to the challenger-set derivation:** does exact `local ∪ universal` equality still
      hold, in both directions?
- [ ] **Any change under `vault-secrets/`, `wots/`, or `VAULT_WASM_COMMIT`:** treat as a hard fork.
      Golden vectors on both sides, docs, migration plan — or do not merge.
- [ ] **New external data source or a new field from an existing one:** is the response validated at
      runtime? Is there a timeout and a size bound? Does a failure fail closed?
- [ ] **New `localStorage` field:** does anything security-relevant read it, and if so does
      `hasValidSecurityFields` cover it?
- [ ] **New log line, telemetry event, or error message:** could it carry a derived secret, a bearer
      token, an address, an amount, or raw transaction bytes? Check `SENSITIVE_FIELD_NAMES`.
- [ ] **New CSP requirement:** can it be satisfied without touching `script-src`? Adding a
      `connect-src` host is routine; adding a script grant is not.
- [ ] **New script or asset in the built output:** does the SRI gate still pass? Did you weaken it to
      make it pass?
- [ ] **New dependency:** exact pinned version, audited, and does it need an `onlyBuiltDependencies`
      entry? If it does, justify the install-script grant explicitly.
- [ ] **New env var:** is it validated in `config/env.ts`? Is a wrong or missing value's failure mode
      loud or silent? Does it silently disable a control when unset?
- [ ] **New user-facing control that looks like a security boundary** (a cap, a block, a gate): is it
      actually enforced somewhere the user cannot edit? If not, say so in the code and here.

## When to update this file

- Any change that alters trust boundaries, the attacker model, mitigations, or required tests MUST
  update this file in the same PR.
- Any change to WASM value guards, fee-model agreement, PSBT construction, challenger-set derivation,
  the frozen vault-secret primitives, `VAULT_WASM_COMMIT`, the HTLC activation check, VP response
  validation or server-identity pinning, `localStorage` validation, the CSP, the SRI gate, telemetry
  scrubbing, or the install policy MUST be treated as a security-model change.
- Closing any of the gaps named above — artifact body validation, the fail-open screening
  configuration, either dApp's CSP restrictions, production response headers, or the missing SCA
  gate — MUST update the corresponding section and the severity anchors.
- This file, [CLAUDE.md](CLAUDE.md), [`.github/CODEOWNERS`](.github/CODEOWNERS),
  [`.github/workflows/critical-path-check.yml`](.github/workflows/critical-path-check.yml), and
  [`.github/workflows/claude-md-drift.yml`](.github/workflows/claude-md-drift.yml) contain five
  hand-maintained critical-path inventories. **Change them together.** They have drifted before.
- Security-relevant PRs SHOULD reference the relevant attack-matrix row(s); if a row is missing, add
  it.
- The **Bug severity classification** section is shared across repositories. Changes to it must be
  propagated to every repository carrying a `SECURITY.md`, with the version bumped.
