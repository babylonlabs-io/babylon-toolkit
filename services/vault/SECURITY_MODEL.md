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
| Repository-wide security model: adversaries A–G, per-file controls and their code pointers, the authoritative gap register, severity rubric, vulnerability disclosure | [`SECURITY.md`](../../SECURITY.md) |
| Engineering rules on the critical paths | [`CLAUDE.md`](../../CLAUDE.md#critical-paths--human-review-required) |
| Deployment parameters and feature flags | [`README.md`](README.md) |

**Which of the two security documents to read.** Root [`SECURITY.md`](../../SECURITY.md) is the
repository-wide model. It is longer than this file and goes deeper on the vault app's own code: its
domain sections carry the per-file controls, code pointers, and test evidence, and it holds the
single gap register for the whole repository. It is where you go to find *what the code does and
where*. This file is the component model: what `services/vault` must protect, against whom, under
which assumptions, and which invariants a change may not break. It is where you go to find *what
must remain true*. Where the two overlap, root is authoritative on control detail and this file is
authoritative on the component's invariants. Neither is a summary of the other.

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
| Transaction sizing and fee model; local PSBT assembly and structural validation of vault-provider-proposed transactions; byte-frozen vault-secret derivation; validation and identity-pinning of vault-provider responses | `@babylonlabs-io/ts-sdk` (TBV) and `babylon-tbv-rust-wasm` |
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
2. **The depositor never signs a counterparty-supplied PSBT.** The peg-in transaction is
   constructed locally in full. The depositor-graph transactions are not: their skeletons
   (Payout, Assert, NoPayout, ChallengeAssert) are proposed by the vault provider, because the
   graph is a joint object the depositor cannot build alone. The property is therefore not that
   the bytes originate locally, but that no proposed byte is signed until it has been checked
   against a source other than the proposer. Every PSBT is assembled locally; each sighash-relevant
   field is either re-derived — tapscript leaf and control block, prevout script and value, the
   challenger set — or asserted against the protocol layout: input count and each input's parent
   outpoint, output count, the payout destination script, the commission cap and anchor value for
   the claimer's role, and a bound on the implicit fee. A skeleton that fails any of these is
   refused rather than repaired.
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
10. **The application offers no actionable surface while it cannot establish a security-relevant
    operating parameter.** This covers network, chain and contract set, and equally any parameter
    whose absence silently disables a control rather than announcing itself — a missing endpoint
    that turns a check into a no-op is an unestablished parameter, not a configured absence.
    Uncertainty blocks action rather than resolving to a default.
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

Four non-claims apply to this component but are not this component's to state, because they hold
repository-wide. [`SECURITY.md` → _Scope and non-goals_](../../SECURITY.md#scope-and-non-goals) is
authoritative for all four; they are named here only so a reader of this file knows they exist:
**no enforcement boundary** (every client-side check is advisory), **no protection against local
compromise**, **no user authentication**, and **deployment-layer controls a static bundle cannot
establish** (HSTS, framing policy, TLS). If this file and root ever disagree on one of them, root
is correct.

Specific to this component:

- **No availability or durability guarantee.** Clearing site data mid-flow can strand a deposit;
  this component holds the only copy of some resume state.
- **No claim about protocol correctness or economic outcomes**, including liquidation.
- **No chain-privacy claim.** The model claims only that this component does not amplify linkage
  through telemetry.

### Accepted risks

- A user bypassing advisory client-side checks on their own machine.
- Operator configuration errors shipping as a release, where the error is a *valid but wrong*
  value — a well-formed address for the wrong contract. No runtime control can catch this, because
  configuration is baked in at build time and the application has nothing to check it against.
  Mitigated by review only. This does **not** extend to a malformed or absent parameter that
  silently disables a control; that is invariant 10's business and is tracked as a deviation below.

### Known deviations

Invariants of this component that are currently violated or incompletely enforced.

**There is one gap register for this repository, and it is not this table.**
[`SECURITY.md` → _Attack scenarios matrix_](../../SECURITY.md#attack-scenarios-matrix) holds the
authoritative entry for each gap below — scenario, adversary, impact, current mitigation, and
remediation. This table exists only to answer the question root cannot: *which invariant of this
component does each gap break?* It restates nothing else, deliberately, so that the two documents
cannot drift into disagreeing about the same gap.

| # | Invariant broken | Gap | Authoritative entry (root matrix row) |
| --- | --- | --- | --- |
| 1 | 8 | Recovery-artifact bodies are validated structurally, from the envelope prefix only. A well-formed envelope may wrap a corrupt body, after which the client records the artifacts as obtained and stops warning — a failure surfacing at claim time. | `Artifacts` / adversary A |
| 2 | 10 | Address screening fails open when its endpoint is unset or malformed. This is an operator-error deviation with a real fix (a production startup gate), **not** an instance of the advisory-checks non-claim: that non-claim covers a user editing their own bundle, whereas a typo'd `NEXT_PUBLIC_TBV_UTILS_API` ships screening disabled for everyone, with no user-visible signal. | `Screening` / adversary G |
| 3 | 7 | Egress is not constrained to known hosts, so exfiltration of derived secrets is prevented by discipline — telemetry field denylists, absence of HTML sinks — rather than by a runtime boundary. | `CSP` / adversary D |
| 4 | 11 | The entry document is not integrity-protected by subresource hashing; only its assets are. Origin write access remains the residual trust for the whole application. | `Delivery` / adversary D |

When a gap in root's matrix is closed, the corresponding row here is deleted. When a new gap is
found in this component, it is added to root's matrix first and mapped here second.
