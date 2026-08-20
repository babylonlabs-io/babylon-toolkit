# Recovering a Pre-PegIn stranded by an Ethereum reorg

For a responder handling the case where a depositor's `submitPeginRequestBatch` registration was orphaned and never re-included, *after* their Pre-PegIn Bitcoin transaction was broadcast. The on-chain vault row and the indexer's copy are both gone; the BTC is locked in the HTLC.

Nothing here is on the deposit path. It runs only in response to an incident.

## First: the funds are not lost, and refund is not the first option

Both HTLC leaves hardcode the depositor's key, so this is liveness, not theft. Two ways out, in order of preference:

1. **Re-submit the registration.** Nothing on-chain blocks it — the uniqueness guards are all storage written by the orphaned transaction, the same parameters derive the same `vaultId`, and the ACK message is chain-state-independent so previously-collected signatures stay valid. The depositor pays the peg-in fee again and keeps their deposit. Conditional on the off-chain actors ACKing, whose policy is to reject a Pre-PegIn older than `t_stale`.
2. **Refund.** Only once re-submission is out of reach. Spends the HTLC's timelock leaf after `timelockRefund`, returning the BTC and ending the deposit.

This module serves (2), and supplies the verification (1) also needs.

## What to gather

| Item | Where from |
| --- | --- |
| Funded Pre-PegIn tx hex | The depositor's BTC wallet history, or a Bitcoin node — it is on-chain and unaffected |
| The orphaned `PegInSubmitted` log | The recovery script that scans forked blocks |
| Depositor's connected wallet | The depositor, on the account and network they deposited with |
| `prepeginMaxFee` (Σin − Σout) | Bitcoin-keyed reads of the funding UTXOs, which survive |

The log is the important one. It carries **every field the reorg destroyed**: `amount`, all four version stamps, `hashlock`, `htlcVout`, `unsignedPrePeginTx`, and the three RFC-006 key epochs (`vpKeyEpoch`, `appKeeperKeyEpoch`, `ucKeyEpoch`). With it, nothing has to be guessed.

## Call order

**1. Confirm the transaction belongs to this wallet** — `deriveHashlocksFromPrePegin`.

Re-derives the vault root from the connected wallet and the transaction's funding outpoints, then checks `sha256(expandAuthAnchor(root))` against the transaction's auth-anchor OP_RETURN. Costs one HKDF call, needs zero protocol parameters, and separates a depositor problem from ours before anything else runs. Also returns the hashlocks, which is the fallback source when the log is unavailable.

**2. Verify the parameters against the transaction** — `reconstructPeginParams`.

Parameters from the recovery script are untrusted input and must never feed a signed Bitcoin transaction unverified. Build one `PeginParamsCandidate` from the log via `buildPeginParamsCandidates` and pass it: each HTLC scriptPubKey is rebuilt and byte-matched against the funded transaction, along with the output values, and the peg-in amounts are inverted from the observed values.

Resolve participant keys **before** this call. The arrays must be sorted RFC-006 *operation* keys at the vault's own epochs — what `resolveParticipantKeysAtEpochs` returns. Registration keys only coincide with operation keys while nobody has rotated; passing them produces a wrong script on every candidate.

**3. Build and broadcast the refund** — `toRefundInputs`, then the ordinary `buildAndBroadcastRefund`.

`buildAndBroadcastRefund` takes its two reads as injected callbacks, so recovery supplies them from the verified reconstruction instead of from the row that no longer exists:

```ts
const { vault, context } = toRefundInputs(result, {
  htlcVout, depositorBtcPubkey, applicationEntryPoint,
  fundedPrePeginTxHex, hashlocks, network,
});

await buildAndBroadcastRefund({
  vaultId,
  readVault: async () => vault,
  readPrePeginContext: async () => context,
  feeRate, signPsbt, broadcastTx,
});
```

There is deliberately no separate refund implementation for recovery: the fee cap, the abort checks, the `htlcVout` contiguity invariant and the bitcoind error classification stay in one place for both paths. `applicationEntryPoint` is the one field not carried by the reconstruction — take it from the vault-provider registry row, which is address-keyed and survives.

A test asserts that a refund PSBT built from recovered parameters is **byte-identical** to one built from the parameters the deposit was actually made with. `broadcastTx` is an injected callback, so the whole path can be rehearsed with a capturing broadcaster that never touches the network.

If the log is unavailable, step 2 becomes a search: enumerate the version-keyed reads that survive (`getOffchainParamsByVersion`, `getVaultKeepersByVersion`, `getUniversalChallengersByVersion`) and pass the product. Record every version you could not read in `unresolvedVersions` — see below.

## Reading the failures

| Error | Meaning | Do |
| --- | --- | --- |
| `VaultRootMismatchError` | Wrong wallet, account or network. The root is bound to all three, not just the seed. | Ask the depositor to reconnect on the exact account and network they deposited with. Not our bug. |
| `UnanchoredPrePeginError` | No single auth-anchor OP_RETURN. | Nothing — this module refuses the transaction and neither step takes an `htlcVout` override. The log does not rescue it either: the verifier needs the anchor to prove the sibling set is complete, not merely to count it. Legacy pre-anchor deposits are out of scope today. |
| `PeginParamsNotFoundError` | Nothing matched. | Check the pubkey came from the wallet and the keys are operation keys at the right epochs. Read `unresolvedLabels` first — the answer is usually in a version that failed to resolve. |
| `PeginParamsAmbiguousError` | Matches disagree on the projected terms. | Genuinely unknowable from the transaction. Take the version stamps from the log rather than searching. |
| `PeginParamsIncompleteSpaceError` | Something matched, but the space had holes. | **Do not trust the match.** Resolve the named gaps and re-run. A look-alike sharing the matched `timelockRefund` and participants is indistinguishable from the truth. |
| `PeginSizingIntegrityError` | WASM returned a value no valid parameter set can produce. | Stop. This indicts the build, not the deposit. |

`unresolvedVersions` is required, and `[]` is a positive claim that the enumeration was complete — so a caller cannot reach a trusted answer by failing to mention its own gaps.

## Limits, honestly

- **`vaultCoreVersion` is taken on trust.** v1 and v2 produce byte-identical HTLC scriptPubKeys, and the amount is inverted using the supplied version's reserve, so both gates pass either way and a wrong value is accepted in silence — the refund is unaffected, but the reported amount split is wrong. Read it from the log. `activeVaultCoreVersion()` is the *current* version and is wrong for any deposit predating a bump. Pinned by a test.
- **`timelockRefund` is the only offchain-params scalar reaching the scriptPubKey.** Two params versions sharing it are indistinguishable to a search. Another reason to use the log.
- **A multi-vault Pre-PegIn must be recovered whole.** The refund path's anchor check is fail-closed; reconstructing one sibling of a batch is rejected outright.
- **Some wallets cannot be rescued.** The root depends on the wallet's derivation, so an MPC wallet the depositor has lost access to, or a wallet build implementing an earlier derivation spec, will not reproduce it.

## Before anyone needs this

It has never been rehearsed. A practice run on signet — reconstruct a known vault blind and diff every recovered field against the live row, which still exists there — is worth more than any of the text above.
