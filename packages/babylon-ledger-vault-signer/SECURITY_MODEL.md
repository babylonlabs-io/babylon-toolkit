# Security model — Ledger vault signer (`packages/babylon-ledger-vault-signer`)

> Status: first iteration, pending component-owner review.
> Scope: the host-side client for the Ledger Babylon Vault app. See
> [Security boundary and seams](#security-boundary-and-seams).

## Purpose and references

This package is the host half of the Ledger signing path. It frames APDUs, encodes the intent
the depositor approves on the device, prepares and drives the SIGN_PSBT interrupt/continue loop,
and merges the returned signatures into the caller's PSBT. It holds no key and stores no secret.

The device has a trusted screen, but it can only show what the host sends it. **The user
approves the terms this package encodes, so encoding them wrong defeats the device.** A wrong
byte here ships to a hardware signer silently: the code compiles, the tests pass, and the user
confirms terms that are not the deposit.

Normative references:

| Concern                                                                                      | Document                                                                       |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Firmware, base app and SDK revisions every device-behaviour statement is checked against     | [`FIRMWARE.md`](FIRMWARE.md)                                                   |
| Vendored `ledger-bitcoin` code, its golden vectors and how to regenerate them                | [`src/vendor/ledger-bitcoin/README.md`](src/vendor/ledger-bitcoin/README.md)   |
| Repository-wide model: adversaries A–G, per-area controls, the gap register, severity rubric | [`SECURITY.md`](../../SECURITY.md)                                             |
| Engineering and review rules for this package                                                | [`CLAUDE.md`](../../CLAUDE.md#7-ledger-vault-signer-package) (critical path 7) |

Root [`SECURITY.md`](../../SECURITY.md) says what the code does and where. This file says what
must remain true. Where the two overlap, root is authoritative on control detail and this file
on the package's invariants.

## Security boundary and seams

**Covered.** Everything under `src/`, the vector generators under `scripts/`, and `FIRMWARE.md`:

- APDU framing and status-word classification (`dmkApduSender.ts`, `rawApdu.ts`)
- The DMK session lifecycle (`dmkSession.ts`)
- The DERIVE_CONTEXT_HASH / APPROVE_VAULT_INTENT / GET_VAULT_STATE commands (`vaultCommands.ts`)
  and the intent TLV encoder (`intentTlv.ts`)
- The device-envelope gate (`envelope.ts`, `deviceCaps.ts`)
- SIGN_PSBT: preparation, the expected-signature table, the loop and the merge (`signPsbt*.ts`,
  `expectedSignatures.ts`)
- The wallet-policy, PoP, refund, reclaim and delegated-claim PSBT helpers
- Read-only key derivation (`derivation.ts`, `bip86Path.ts`)

**Out of scope.**

- The Ledger firmware and the base Bitcoin app. They are pinned in `FIRMWARE.md` and are not
  reviewed here.
- Deciding what to sign. Terms, counterparties, transaction skeletons and prevout data arrive
  already validated from the SDK.
- Ceremony orchestration: which operation runs when, replay bookkeeping, app identity and version
  gating. These live in the wallet-connector's `ledger-vault` provider.
- `src/testing.ts` (the `./testing` export) and the Speculos E2E suites. They establish no
  production guarantee.

**Guarantees imported.** These are established by a named layer outside this package. The package
depends on them and does not establish them itself.

| Imported guarantee                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Established by                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terms are validated before they reach `buildDepositTerms` (which only projects them) and bound to the signing context; vault-provider-supplied skeletons are checked against locally derived values and the protocol layout before signing. This inherits the presigning gaps root records (unauthenticated output label hashes and GC WOTS keys); the device's validation does not close them                                                                                                                                                             | `@babylonlabs-io/ts-sdk` (`PeginManager.preparePegin`, `rebuildDepositTermsCore`, `runDepositorPresignFlow`, `signDepositorGraph`, `planDelegatedClaimSigning` for the delegated-claim skeletons, `signDelegatedClaimPlan` for the terms and the signer); root [`SECURITY.md` → _Presigning the depositor graph_](../../SECURITY.md#presigning-the-depositor-graph) |
| Returned signatures are verified before use: script-path with `assertScriptPathSchnorrSignature`, key-path with `assertReturnedKeyPathSignatures`, PoP with `verifyPopWitness`. Where the returned PSBT is used, its transaction is compared with the requested one (`assertPsbtUnsignedTxMatches`). Delegated claims take only the signature from the returned PSBT and verify it against the original request (`assertSignatureForRequest`)                                                                                                              | `@babylonlabs-io/ts-sdk` callers (`signDepositorGraph`, `PeginManager`, `buildAndBroadcastRefund`, `buildAndBroadcastReclaim`, delegated-claim `verifySignatureForRequest`)                                                                                                                                                                                         |
| Finalization and broadcast; which tapscript inputs each flow signs (the per-flow `signInputs` indices)                                                                                                                                                                                                                                                                                                                                                                                                                                                     | The SDK caller; the indices come from `createTaprootScriptPathSignOptions` and `createTaprootScriptPathSignOptionsForInput`                                                                                                                                                                                                                                         |
| The envelope gate runs before the approval ceremony; the depositor's own key is disjoint from every participant key                                                                                                                                                                                                                                                                                                                                                                                                                                        | wallet-connector `doApproveDepositTerms`                                                                                                                                                                                                                                                                                                                            |
| Network, coin type and the depositor's fixed `/0/0` path; the policy xpub derives the connected key; the caller's `signInputs` indices narrow tapscript expectations only and are forwarded as given for those flows, while an all-key-path PSBT (Pre-PegIn) is re-prepared under the wallet policy without them and signs every depositor key-path input (invariant 5); a delegated claim must request exactly one; a mixed-flow PSBT is refused using the unnarrowed classification (`stagePsbt`), and replay identity uses it too (`signingRequestKey`) | wallet-connector `ledger-vault` provider                                                                                                                                                                                                                                                                                                                            |
| Which flows need an approved intent: Pre-PegIn, PegIn, the depositor graph, the delegated-claim depositor Payout (routed through `signPsbt`) and the claimer Assert do; PoP, refund, reclaim and the three standalone claim kinds (Claim, WronglyChallenged, the claimer Payout) are signed without one                                                                                                                                                                                                                                                    | wallet-connector `gateSignContext`, called per flow                                                                                                                                                                                                                                                                                                                 |
| One device operation at a time; no stale-connection state commits; no replay of a request the device may already have counted; `refreshSessionApp` never runs during a ceremony                                                                                                                                                                                                                                                                                                                                                                            | wallet-connector `withDeviceOperation`, `assertSameConnection`, `stagePsbt` (refuses the replay), `signStaged` and `resumeIntentFromDevice` (keep its record)                                                                                                                                                                                                       |
| No ceremony is driven on an unsupported app build (`MIN_APP_VERSION` ≤ version < `FIRST_UNSUPPORTED_APP_VERSION`); the silent, read-only `GET_VAULT_STATE` probe in `holdsApprovedDepositTerms` is sent without that gate and answers false on any failure. An unread version comes only with an unread name: DMK's `GetAppAndVersionCommand` returns both or neither, a missing version decodes to `""`, which `checkMinVersion` rejects, and `awaitExpectedApp` proceeds only on the expected name                                                       | wallet-connector `refuseUnexpectedApp`, `awaitExpectedApp`                                                                                                                                                                                                                                                                                                          |
| An abort signal, which the signing loop checks between rounds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | the caller of `signVaultPsbt` / `signPreparedVaultPsbt` (the wallet-connector)                                                                                                                                                                                                                                                                                      |
| Seed custody; the screen shows what was received; intent-bound transactions are signed only inside the approved intent, and standalone transactions only after their own review screen; validation of each transaction's shape, leaf, fee and destination, including the checks this package's reclaim and delegated-claim helpers leave to it                                                                                                                                                                                                             | Ledger firmware, at the revision in `FIRMWARE.md`                                                                                                                                                                                                                                                                                                                   |
| The test transport override is never installed in production                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | the consumer's build (`setDmkTransportOverride` has no runtime environment check)                                                                                                                                                                                                                                                                                   |

**Guarantees exported to the wallet-connector.**

- A pure envelope check (`assertDepositTermsDeviceCompatible`) that throws
  `DepositTermsRejectedError` with `reason: "device-envelope"` and performs no device I/O.
- Deterministic intent encoding, plus `intentFingerprint`, which reproduces from the same terms
  the fingerprint the device reports.
- A single-use prepared signing handle whose expected-signature table is built from the exact
  model committed to the device.
- On success, exactly the expected set of structurally checked signatures, merged into the
  caller's original PSBT and not finalized.
- Typed outcomes for refusal, lock, busy, protocol error, mismatch, incomplete and abort, and
  diagnostics with no signature bytes.

**Not exported.** Schnorr validity, chain truth, protocol validation, and any internal check that
an approved intent is loaded. The low-level commands (`approveVaultIntent`, `encodeKeyBatches`)
do not call the envelope gate themselves. A consumer that bypasses the wallet-connector must run
it first.

## Actors and adversary capabilities

Letters refer to the adversaries in root [`SECURITY.md`](../../SECURITY.md#threat-model-assumed-adversaries).

- **Depositor.** The party this model protects. Refusing on the device is a user action, not a
  failure (`LedgerUserRefusedError`).
- **Vault provider (A), indexer (B), data providers (C).** Reach this package only through values
  the SDK has already validated. The package checks structure, not meaning or origin. A wrong
  value that passes the SDK and fits the envelope is encoded faithfully.
- **Attacker in the page origin (D).** Owns the host. It can replace this code, mutate a prepared
  table, read the returned context root, or skip every host gate. Against D, the only defence is
  the device screen and the user reading it.
- **Non-conforming device or transport (E).** May return wrong status words, short or malformed
  responses, signatures for unexpected inputs, keys or leaves, duplicates, omissions, or a
  non-default sighash byte. This is the adversary the package's own checks are built for.
- **Supply-chain attacker (F).** A hostile dependency, a tampered vendored file, a changed vector
  oracle or fixture, or a wrong firmware pin. Any of these can change the bytes sent to the
  device.
- **Operator (G).** Wrong network or unsupported app build. Gated by the wallet-connector, not here.
- **Our own bugs.** An encoder, parser or table bug produces wrong bytes as surely as an attacker
  does. This is the most likely failure, and the reason for the golden-vector rule.

## Protected outcomes

An outcome is a security failure of this package when:

- the device shows, and the user approves, terms other than those the package was handed;
- a signature for an input, key, leaf or spend type the request did not expect is recorded,
  merged or returned;
- a signing round reports success while an expected signature is missing;
- the merge changes the unsigned transaction or finalizes an input;
- payload bytes (keys, context preimage, the context root, PSBT data, signatures) reach a log;
- a request that fails the envelope gate or a preflight check this package implements reaches
  the device. Checks the package deliberately leaves to the firmware (the reclaim and
  delegated-claim helpers say which) are not covered by this outcome.

## Critical security properties / invariants

1. **The intent encoding matches the firmware byte for byte.** `intentTlv.ts` mirrors Ledger's
   reference encoder, and `intentTlv.test.ts` checks it against vectors that encoder produced.
   Integers are checked against their encoded width and are never truncated. `approveVaultIntent`
   encodes every APDU before the first send, checks the declared counts against the supplied
   data, and refuses an empty roster, which would otherwise resolve "approved" while nothing was
   approved.
2. **The context root is derived only behind the device's approval screen.** `deriveContextHash`
   always requests the approval screen (`P2_SHOW`), validates the app name, path and context
   before framing them, and rejects any response that is not exactly 32 bytes. The root feeds
   vault-secret derivation, which root `SECURITY.md` requires to stay byte-stable.
3. **Out-of-envelope terms fail before the device sees them.** `assertDepositTermsDeviceCompatible`
   enforces the limits in `deviceCaps.ts`, mirrored from the firmware's intent parser, and throws
   the seam's typed error. The `deviceCaps.ts` limits live in this package only. The SDK's
   payout vsize ceiling (`assertPayoutFeeBand`) is a separate bound its own comment keeps at
   parity with the app's, so a firmware change to that bound must move the SDK too.
4. **The host and the device read the same PSBT.** `prepareSignPsbt` parses the caller's PSBT
   twice: with bitcoinjs for the merge target, and with the vendored parser for the model it
   commits to the device. The vendored parser closes the differentials found so far: non-minimal
   CompactSize (`parseVarint`), repeated keys and trailing bytes (`psbtv2.ts` `deserialize`), and
   map counts that do not match (`MerkelizedPsbt`). The vendor README records why each change was
   made. One differential is still open; see known deviation 2.
5. **Every signature is checked against a table computed before the first APDU.**
   `buildExpectedSignatureTable` classifies every input before it narrows to the requested ones.
   It narrows tapscript expectations only; a key-path input bound to the depositor's BIP-86
   output is always expected. It requires each tapscript input's control block to commit to its
   leaf (`assertControlBlockCommitsToLeaf`), so a leaf the spent output never paid to is never
   armed. For inputs that carry no taproot signing metadata, a tripwire (not a guarantee)
   refuses a `witnessUtxo` paying the depositor's BIP-86 P2TR or P2WPKH script; P2SH-P2WPKH and
   P2PKH depositor outputs are not recognised. The table
   is built from the same merkleized model the device receives. `prepareSignPsbt` also rejects
   conflicting signatures and non-default sighashes on the inputs it will sign. Any throw during
   preparation means zero device I/O. Caller options narrow what is signed; they never weaken
   the classification.
6. **Each YIELD is checked before it is recorded.** `createYieldCollector.assertAndRecord` checks
   the input index, spend type, signer key, leaf hash, a signature length of exactly 64 bytes (a
   65th byte is rejected, never stripped), and that the yield is not a duplicate. A mismatch
   aborts the ceremony.
7. **Success means exact completion.** `assertComplete` requires the collected set to equal the
   expected set in both directions. `runSignPsbtLoop` calls it only after `0x9000`, before any
   merge.
8. **The merge adds signatures and nothing else.** `mergeYields` writes only `tapScriptSig` and
   `tapKeySig` into the caller's original PSBT. It never rewrites the unsigned transaction and
   never finalizes. Inputs that arrived already finalized and are not signed in this round are
   left as they are.
9. **A prepared handle is used once.** `signPreparedVaultPsbt` refuses a handle it has already
   consumed (`consumedPrepared`), and refuses key-path expectations prepared without a wallet
   policy.
10. **Framing never truncates or guesses.** Header fields must be bytes, data must fit one APDU,
    and a status word must be exactly two bytes. A missing byte is an error, never `0`, because
    `[0x90]` would otherwise read as `0x9000`.
11. **No APDU is injected into a ceremony.** `connectDmkSession` turns off DMK's session refresher
    (`SESSION_REFRESHER_OPTIONS`), which would otherwise send `GET_APP_AND_VERSION` in the middle
    of a ceremony. `refreshSessionApp` sends that read only when called, and the caller keeps it
    out of a running ceremony.
12. **Device outcomes keep their type.** `classifyStatusWord` separates user refusal, lock, busy
    and generic errors. `preDispatch` is set only on a lock or busy answer to the initial
    SIGN_PSBT APDU, never on a user refusal or on a CONTINUE. The wallet-connector relies on it to
    decide whether a request may be retried.
13. **No payload bytes are logged**, the context root included. DMK is built with no logger,
    because its own logs include full APDU payloads. The opt-in trace (`__LEDGER_VAULT_APDU_TRACE__`) prints headers, status
    words and lengths only. Structured diagnostics (`toCollectedYieldRefs`) carry no signature
    bytes. See known deviation 1 for the transport-error branch.
14. **Vectors and their provenance are source.** The generators under `scripts/`, the oracle pin
    in `scripts/requirements.txt` and `FIRMWARE.md` are reviewed as source. A change to the
    generated vectors under `src/vendor/ledger-bitcoin/__tests__/vectors/` is accepted only after
    a reviewer regenerates the whole tree and confirms byte-identity. Golden-test code and
    hand-recorded expectations elsewhere are reviewed line by line. Both rules are CLAUDE.md
    critical path 7's.

## Trust assumptions / roots of trust

- **The device is the root of trust for intent and custody.** It shows what it received. It
  signs an intent-bound transaction only inside the approved intent and validates it against
  that intent, and signs a standalone transaction (PoP, refund, reclaim, and a delegated claim's
  Claim, WronglyChallenged and claimer Payout) only after that transaction's own review screen.
  If the firmware is wrong, nothing in this package compensates.
- **`FIRMWARE.md` names the revision every mirrored rule was checked against.** It is provenance,
  not a runtime check. The wallet-connector's version window admits a whole minor line
  (`MIN_APP_VERSION` ≤ version < `FIRST_UNSUPPORTED_APP_VERSION`), so a patch release inside it
  is driven with no rule re-checked against it; see accepted risks.
- **The SDK has already decided that the terms and PSBTs are the right ones.** This package
  guarantees they reach the device faithfully, not that they are correct.
- **The host is honest** (adversary D excluded), and the wallet-connector composes the gates
  listed under imported guarantees.
- **A connected device answers or disconnects.** DMK applies a timeout to `sendApdu` only when
  the caller passes `abortTimeout`, and `createDmkRawApduSender` passes none; the WebHID sender
  settles on the device's input report, a send error or a disconnect. A connected device that
  never answers leaves the call, and with it the wallet-connector's single-operation lock,
  pending until it is unplugged or the provider's `disconnect()` tears the session down. Nothing
  in this repository establishes this; see _No transport timeout_ under non-claims.
- **Ledger's reference client and the pinned fixtures are correct.** The golden vectors are
  generated from them.

## Non-claims, accepted risks, and known deviations

### Non-claims

The repository-wide non-claims in [`SECURITY.md` → _Scope and non-goals_](../../SECURITY.md#scope-and-non-goals)
apply here, root being authoritative. Specific to this package:

- **No signature verification.** A YIELD is checked for routing and shape, not Schnorr validity.
  The SDK verifies.
- **No leaf semantics.** The table checks that a leaf is committed to by its output, not what the
  leaf script means.
- **No protection of a prepared table against the host.** Its maps and sets are readonly in
  TypeScript only. Code that can mutate them is adversary D, which owns the host anyway.
- **No complete path allowlist.** `assertBip86Path` fixes purpose, hardening and the five-level
  shape but not the change branch. The wallet-connector's fixed `/0/0` path is what holds the
  branch today, and `augmentPsbtForWalletPolicy` checks branch 0 on its own path.
- **No transport timeout.** `runSignPsbtLoop` has no round cap or timeout, and aborting does not
  cancel a hung transport call. DMK's `sendApdu` takes an optional `abortTimeout`;
  `createDmkRawApduSender` does not pass one.
- **Typed errors are not universal.** The TLV, path, derivation and augmentation helpers, the
  vault commands (`vaultCommands.ts`) and the APDU framing (`dmkApduSender.ts`) throw a plain
  `Error`, and raw transport failures propagate unchanged.
- **Resuming an intent matches a four-byte fingerprint.** `intentFingerprint` is the last four
  bytes of a SHA-256, and the wallet-connector's `resumeIntentFromDevice` compares only that
  value. A mismatch proves the deposits differ; a match does not prove they are the same, since
  32 bits can be ground. On a match, the provider rebuilds its view of the device (`termsKey`,
  `prepeginTxidInternalHex`, `htlcRefundTimelock`) from the host's terms while the device keeps
  enforcing the intent the user approved, so the two can diverge.

### Accepted risks

- Golden vectors prove serialization against the reference client, not signature validity or
  every current firmware flow. Some trace vectors use synthetic signatures. The Speculos suite,
  run by hand against the pinned ELF, covers the device side.
- The vector generators enforce the oracle version but not the fixtures commit or an empty output
  directory. Those remain reviewer obligations under CLAUDE.md critical path 7.
- The wallet-connector's app gate is a minor-version window while `FIRMWARE.md` pins one build
  inside it. A later patch release of that minor line passes the gate and is driven without any
  of this package's mirrored rules being checked against it. Closing it needs a per-build pin on
  the connector side, or a window ceiling raised only together with `FIRMWARE.md`.

### Known deviations

The repository's one gap register is
[`SECURITY.md` → _Attack scenarios matrix_](../../SECURITY.md#attack-scenarios-matrix). This table
only maps each gap to the invariant it breaks here.

| #   | Invariant broken | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Authoritative entry (root matrix row)                |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 1   | 13               | With tracing on, a transport error is logged as the raw caught `error` object. The same error is rethrown unchanged. The wallet-connector then copies a DMK error's `originalError.message` (or its `_tag`), or an `Error`'s `message`, into the `WalletError` it returns and keeps the object as `cause`, with or without tracing; on every call through the wrapped sender (`withWalletErrorMapping`: derive, approve, GET_VAULT_STATE, and the depositor-pubkey and policy reads) an error it does not recognise is rethrown raw, with no `WalletError` at all. Whether DMK's transport errors carry payload bytes is not established.                                                                                                                                                                                               | `Ledger signer` row on the trace transport-error log |
| 2   | 4                | A hybrid PSBT that carries `PSBT_GLOBAL_VERSION = 2` and a conflicting `PSBT_GLOBAL_UNSIGNED_TX` passes `prepareSignPsbt`. `normalizeToV2` keeps the v2 fields for the device model, while bitcoinjs builds the merge target from `UNSIGNED_TX`, so the two read different transactions. The replay identity (`unsignedTxid`, used by the wallet-connector's `signingRequestKey`) is also computed from `UNSIGNED_TX`, and so are the flow classifications: `classifyRefundPsbt`, `classifyReclaimPsbt` and `classifyDelegatedClaimPsbt` parse with bitcoinjs, so the wallet-connector's standalone-or-intent decision, its zero-I/O refund pins and the claim kind are decided about a transaction the device does not sign. The SDK builders emit v0 PSBTs only. | `Ledger signer` row on the hybrid PSBT               |

When a gap in root's matrix is closed, the corresponding row here is deleted. When a new gap is
found in this package, it is added to root's matrix first and mapped here second.
