# Security model — Babylon Vault dApp (`services/vault`)

> Status: first iteration, pending component-owner review.
> Scope: the depositor-facing web client only. See [Security boundary and seams](#security-boundary-and-seams).

## Purpose and references

The Babylon Vault dApp is the browser client through which a depositor locks BTC into a vault and
manages the resulting collateral position. It holds no custody, runs no server, and possesses no
privileged key. Its role is narrower and sharper than that suggests: **it is the software that
decides what bytes the user's own wallet is asked to sign.** It sizes and constructs Bitcoin
transactions, derives the secrets that are the only material capable of recovering a deposit,
pre-signs a transaction graph proposed by a third party, and reveals an HTLC preimage on Ethereum.
Each of those actions is irreversible, is attributed to the user, and has no administrative undo.

Normative references:

| Concern | Document |
| --- | --- |
| TBV protocol, contracts, enforcement | [`babylonlabs-io/vault-contracts`](https://github.com/babylonlabs-io/vault-contracts), [`babylonlabs-io/btc-vault`](https://github.com/babylonlabs-io/btc-vault) |
| Vault-secret and context-hash derivation | [`docs/specs/derive-vault-secrets.md`](../../docs/specs/derive-vault-secrets.md), [`docs/specs/derive-context-hash.md`](../../docs/specs/derive-context-hash.md) |
| Repository threat analysis, attack matrix, severity rubric, vulnerability disclosure | [`SECURITY.md`](../../SECURITY.md) |
| Engineering rules on the critical paths | [`CLAUDE.md`](../../CLAUDE.md#critical-paths--human-review-required) |
| Deployment parameters and feature flags | [`README.md`](README.md) |

**Documentation gap.** There is no protocol-level specification that defines the depositor-side
actor model as such. The actors below are therefore defined here, at the minimum detail needed to
read this document, rather than being inferred from the implementation. Closing that gap belongs to
the protocol specification, not to this file.

## Security boundary and seams

**Covered.** The production vault dApp as built and served as a static bundle: vault provider
selection, peg-in sizing and construction, presigning the depositor graph, broadcast, activation,
borrow / repay / withdraw, recovery-material download, and resume of an in-flight deposit from
browser storage.

**Out of scope.**

- The vault contracts, the BaBe / vaultd protocol, and the vault provider daemon — separate
  components with their own models.
- The backend services this client reads from (indexer, sidecar, utils-api, btc-monitor); each
  carries its own `SECURITY.md`.
- [`services/simple-staking`](../simple-staking) — a different dApp with different signing flows.
- Development and test-only surfaces: the real-wallet E2E CLI and its signet/Sepolia credentials,
  stubs, and dev-only routes. These establish no production guarantee, and none of them may become
  a production path.
- TLS termination, response headers, CDN and object-store configuration, and edge rate limiting.
  A static bundle cannot establish these; they are deployment responsibilities.

**Guarantees imported.** These are established by a named layer outside this component. This
component depends on them and must not be read as establishing them itself.

| Imported guarantee | Established by |
| --- | --- |
| Transaction sizing and fee model; local PSBT construction; byte-frozen vault-secret derivation; validation and identity-pinning of vault-provider responses | `@babylonlabs-io/ts-sdk` (TBV) and `babylon-tbv-rust-wasm` |
| The authoritative vault provider set, provider Bitcoin public keys, challenger verification keys, and protocol parameters | The vault registry contract on Ethereum |
| Enforcement of every protocol rule that must actually hold | The vault contracts |
| Key custody, and signing exactly the bytes handed to the wallet | The user's wallet |
| Dereferencing provider-supplied URLs under an SSRF policy | The vault-provider proxy |
| Integrity of the bundle that reaches the user's browser | The build and deployment pipeline |

**Guarantees exported or delegated.** This component is a leaf: no other software component
consumes a guarantee from it. To the depositor it offers one thing — that what they are asked to
sign corresponds to what the interface represents. Everything that must be *enforced* is delegated
to the contracts; everything about *delivery* is delegated to deployment.

**Seam that needs its own model.** The SDK and WASM packages above are published to npm and have
consumers outside this repository. Their guarantees are stated here as imported, but they are not
this component's to define. They warrant a separate `SECURITY_MODEL.md`.

## Actors and adversary capabilities

- **Depositor.** The party this model protects, and where every impact lands. Not an adversary.
- **Vault provider.** Untrusted counterparty, and the strongest protocol-level position against a
  depositor. Proposes the transaction graph the depositor pre-signs, returns the challenger set,
  issues scoped bearer tokens, and serves recovery artifacts. May supply arbitrary values and
  metadata, withhold material the depositor needs, or return well-formed but useless data.
- **Indexer.** Untrusted. Defines what the interface believes about vault state. Cannot forge a
  signature, but can induce an irreversible action against a false picture of the world.
- **Chain and data providers** (Ethereum RPC, mempool, sidecar, screening API). Untrusted. Define
  "what the chain said", fee rates, and advisory verdicts.
- **Attacker in the page's origin** — a hostile browser extension, a successful XSS, or anyone who
  can modify the delivered bundle. Owns the application outright and can rewrite what the wallet is
  asked to sign. Every property below is stated *against the other adversaries*; this one defeats
  all of them, which is why delivery and supply-chain controls are load-bearing rather than hygiene.
- **Wallet.** Trusted for custody; **not** trusted to conform. May ignore non-standard taproot
  script-path signing options, or report success for a signature that is invalid. This is an
  observed condition across wallets, not a hypothetical.
- **Supply-chain attacker.** A hostile npm release in the dependency tree, a compromised CI action,
  or a hostile revision of the external WASM source pulled at build time.
- **Operator.** Honest but fallible. Every deployment parameter is a build-time constant baked into
  a static bundle, so a configuration mistake ships as a release.

**Honest environment.** The user's operating system, browser, and extension set; the same-origin
boundary; the wallet's custody of keys; the integrity of the build and deployment pipeline; and the
correctness of the contracts.

## Protected outcomes

Security-critical assets:

- the depositor's BTC and the collateral position it backs;
- vault-secret material — the only material capable of recovering a deposit;
- the depositor's ability to claim **independently of the vault provider**;
- the association between one browser session and the depositor's chain identity.

An outcome is a security failure of this component when:

- the depositor signs, or commits on-chain to, a value they did not intend — a wrong amount, a wrong
  destination, or a wrong set of counterparties;
- a deposit becomes unrecoverable, or cannot be activated, because secret material was rotated,
  lost, or never derivable;
- recovery material is absent or corrupt while the depositor is led to believe it is in hand — a
  failure discovered only at claim time, when it can no longer be corrected;
- vault-secret material leaves the browser;
- the depositor takes an irreversible action against a false picture of chain state;
- the application operates against the wrong network or the wrong contract set.

A user bypassing an advisory client-side check on their own machine is **not** a security failure of
this component. See [Non-claims](#non-claims-accepted-risks-and-known-deviations).

## Critical security properties / invariants

1. **No signed value is taken on trust.** Every value entering a signature or an on-chain commitment
   is independently re-derived, or asserted against a source other than the party that proposed it.
   Values originating from a counterparty, the indexer, browser storage, or interface state are
   never signed verbatim.
2. **Every transaction the depositor signs is constructed locally**, from data sourced on-chain —
   never accepted, whole or in part, from a counterparty.
3. **The set of counterparties the depositor signs for is derived, not supplied.** A proposed set is
   accepted only when it matches the derived set exactly. Both directions are failures: signing for
   too few leaves recovery material missing, signing for too many hands signatures to keys the
   protocol does not recognise.
4. **A signature is not treated as produced until it has been verified** against the expected
   sighash. A wallet reporting success is not evidence that it signed correctly.
5. **Vault-secret derivation is byte-stable for the lifetime of a deposit.** Any change to layout,
   ordering, labels, or the pinned derivation source rotates every depositor's secrets and is a hard
   fork — permissible only with golden-vector updates on both sides of the seam and a migration plan
   for in-flight deposits.
6. **A secret is checked against its on-chain commitment immediately before it is revealed**, and is
   taken only from the source that generated it — never reconstructed from interface or storage state.
7. **Vault-secret material never leaves the browser.** It is not logged, transmitted as telemetry,
   placed in a URL, or persisted outside its intended store.
8. **Data crossing an untrusted boundary is validated before it reaches a security-relevant path.**
   The application's own browser storage is such a boundary: it is user- and attacker-writable, and
   simultaneously holds the only copy of some unrecoverable in-flight state.
9. **Counterparty identity is pinned to the chain**, not to a hostname, a transport, or a proxy.
10. **The application offers no actionable surface while it cannot establish its own operating
    parameters.** Uncertainty about network, chain, or contract set blocks action rather than
    resolving to a default.
11. **The delivered page executes no code it did not ship**, and no interface path renders
    counterparty-supplied data as markup or script.

Properties 1–6 and 9 are enforced principally in the SDK and WASM layer named under
[imported guarantees](#security-boundary-and-seams). This component's obligation is to compose them
correctly and to introduce no path that bypasses them.

## Trust assumptions / roots of trust

- **The vault registry contract is the root of trust** for provider identity, challenger keys, and
  protocol parameters. If the application is pointed at the wrong registry, no property above holds.
- **Build-time configuration is trusted and unverifiable at runtime.** A valid-but-wrong contract
  address, chain id, or endpoint passes every check the application can make about itself.
- **The wallet custodies keys correctly** and signs the bytes it was handed.
- **The browser, operating system, and installed extensions are honest**, and the same-origin
  boundary holds.
- **The bundle in the user's browser is the one that was built and reviewed.** Whoever can write to
  the serving origin decides what code runs with the user's wallet connected.
- **The derivation seam matches its Rust reference byte for byte**, as fixed by the specs and the
  pinned WASM source revision.
- **The contracts enforce the protocol correctly**, and the vault-provider proxy enforces its SSRF
  policy on provider-supplied URLs.

## Non-claims, accepted risks, and known deviations

### Non-claims

- **This component is not an enforcement boundary.** It is a static bundle running in a
  user-controlled browser. Every check it performs — address screening, amount caps, kill-switches
  — is advisory and defeated by anyone willing to edit their own JavaScript. Controls that must
  actually hold belong in the contracts or in a server the user does not control. What these checks
  protect against is user mistakes and a hostile counterparty, not a determined user.
- **No protection against local compromise.** A hostile extension in the origin, or a wallet that
  signs something other than what it was handed, defeats every property above.
- **No availability or durability guarantee.** Clearing site data mid-flow can strand a deposit;
  this component holds the only copy of some resume state.
- **No user authentication.** There are no accounts and no sessions.
- **No claim about protocol correctness or economic outcomes**, including liquidation.
- **No chain-privacy claim.** The model claims only that this component does not amplify linkage
  through telemetry.

### Accepted risks

- A user bypassing advisory client-side checks on their own machine.
- Operator configuration errors shipping as a release. Mitigated by review, not by any runtime
  control, because configuration is baked in at build time.
- Deployment-layer controls (HSTS, framing policy, TLS) that a static bundle cannot establish.

### Known deviations

Invariants that are currently violated or incompletely enforced. Each needs a tracking issue before
this document is merged.

| # | Deviation | Invariant | Impact | Current mitigation | Issue |
| --- | --- | --- | --- | --- | --- |
| 1 | Recovery-artifact bodies are validated only structurally, from the envelope prefix. A hostile provider can return a well-formed envelope wrapping a corrupt body; the client then records the artifacts as obtained and stops warning. | 8 | Loss of independent claim capability, discovered only at claim time. Treat as fund recovery, not robustness. | None client-side. Full validation is deferred until the backend supports streaming delivery. | *TBD* |
| 2 | Address screening fails open when its endpoint is unset or malformed. | 10 | Compliance bypass. Bounded by the non-claim above: screening is advisory in any case. | Startup warning only. | *TBD* |
| 3 | Egress is not constrained to known hosts, so exfiltration of derived secrets is prevented by discipline — field denylists, absence of HTML sinks — rather than by a runtime boundary. | 7 | Confidentiality of vault-secret material under an in-origin adversary. | Redaction contract in telemetry; no HTML sinks in source. | *TBD* |
| 4 | The entry document itself is not integrity-protected by subresource hashing; only its assets are. | 11 | Origin write access remains the residual trust for the whole application. | Scoped deployment credentials; per-release hash manifests. | *TBD* |

Deviations 1–4 are stated at model level. Their implementation detail, adversary mapping, and test
evidence live in [`SECURITY.md`](../../SECURITY.md) and are not repeated here.
