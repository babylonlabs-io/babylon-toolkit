// Node.js entry point for the WASM bindings.
//
// Loads the committed web WASM binary synchronously from disk using
// readFileSync and initializes it via initSync. This avoids fetch()-based
// loading, which does not work in Node.js environments, and does not require
// a separate wasm-pack --target nodejs build step.

import { createDelegatedClaimApi } from './delegatedClaim.js';
import {
  getWasmBindings,
  initWasm as initializeWasm,
} from './wasm-loader-node.js';

import type {
  PrePeginParams,
  PrePeginResult,
  PeginTxResult,
  HtlcConnectorParams,
  HtlcConnectorInfo,
  PeginP2aAnchorInfo,
  PayoutConnectorParams,
  PayoutConnectorInfo,
  Network,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  AssertNoPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
} from './types.js';
import { assertPositiveBigintArray, assertWasmBigint } from './value-guards.js';

/**
 * HTLC output index for single deposits.
 */

export async function initWasm(): Promise<void> {
  await initializeWasm();
}

export async function createPrePeginTransaction(
  params: PrePeginParams,
): Promise<PrePeginResult> {
  const { WasmPrePeginTx } = await getWasmBindings();

  // Leading arg selects the tx-graph version inside the vault-wasm facade;
  // an unsupported version throws before any construction (fail closed).
  const tx = new WasmPrePeginTx(
    params.txGraphVersion,
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    [...params.hashlocks],
    new BigUint64Array(
      assertPositiveBigintArray(params.pegInAmounts, 'pegInAmounts'),
    ),
    params.timelockRefund,
    params.feeRate,
    params.minPeginFeeRate,
    params.numLocalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.network,
    params.authAnchorHash,
  );

  try {
    const numHtlcs = tx.getNumHtlcs();
    const htlcValues: bigint[] = [];
    const htlcScriptPubKeys: string[] = [];
    const htlcAddresses: string[] = [];
    const peginAmounts: bigint[] = [];

    for (let i = 0; i < numHtlcs; i++) {
      htlcValues.push(assertWasmBigint(tx.getHtlcValue(i), `htlcValue[${i}]`));
      htlcScriptPubKeys.push(tx.getHtlcScriptPubKey(i));
      htlcAddresses.push(tx.getHtlcAddress(i));
      peginAmounts.push(
        assertWasmBigint(tx.getPeginAmountAt(i), `peginAmount[${i}]`),
      );
    }

    return {
      txHex: tx.toHex(),
      txid: tx.getTxid(),
      htlcValues,
      htlcScriptPubKeys,
      htlcAddresses,
      peginAmounts,
      depositorClaimValue: assertWasmBigint(
        tx.getDepositorClaimValue(),
        'depositorClaimValue',
      ),
    };
  } finally {
    tx.free();
  }
}

export async function buildPeginTxFromPrePegin(
  params: PrePeginParams,
  timelockPegin: number,
  fundedPrePeginTxHex: string,
  htlcVout: number,
): Promise<PeginTxResult> {
  const { WasmPrePeginTx } = await getWasmBindings();

  const unfundedTx = new WasmPrePeginTx(
    params.txGraphVersion,
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    [...params.hashlocks],
    new BigUint64Array(
      assertPositiveBigintArray(params.pegInAmounts, 'pegInAmounts'),
    ),
    params.timelockRefund,
    params.feeRate,
    params.minPeginFeeRate,
    params.numLocalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.network,
    params.authAnchorHash,
  );

  let fundedTx: typeof unfundedTx | null = null;
  let peginTx: ReturnType<typeof unfundedTx.buildPeginTx> | null = null;
  try {
    fundedTx = unfundedTx.fromFundedTransaction(fundedPrePeginTxHex);
    peginTx = fundedTx.buildPeginTx(timelockPegin, htlcVout);

    return {
      txHex: peginTx.toHex(),
      txid: peginTx.getTxid(),
      vaultScriptPubKey: peginTx.getVaultScriptPubKey(),
      vaultValue: assertWasmBigint(peginTx.getVaultValue(), 'vaultValue'),
    };
  } finally {
    peginTx?.free();
    fundedTx?.free();
    unfundedTx.free();
  }
}

export async function getPrePeginHtlcConnectorInfo(
  params: HtlcConnectorParams,
): Promise<HtlcConnectorInfo> {
  const { WasmPrePeginHtlcConnector } = await getWasmBindings();

  const connector = new WasmPrePeginHtlcConnector(
    params.txGraphVersion,
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    params.hashlock,
    params.timelockRefund,
  );

  try {
    return {
      hashlockScript: connector.getHashlockScript(),
      hashlockControlBlock: connector.getHashlockControlBlock(),
      refundScript: connector.getRefundScript(),
      refundControlBlock: connector.getRefundControlBlock(),
      address: connector.getAddress(params.network),
      scriptPubKey: connector.getScriptPubKey(params.network),
    };
  } finally {
    connector.free();
  }
}

export async function computeMinClaimValue(
  txGraphVersion: number,
  numLocalChallengers: number,
  numUniversalChallengers: number,
  councilQuorum: number,
  councilSize: number,
  feeRate: bigint,
): Promise<bigint> {
  const { computeMinClaimValue: wasmComputeMinClaimValue } =
    await getWasmBindings();
  try {
    return assertWasmBigint(
      wasmComputeMinClaimValue(
        txGraphVersion,
        numLocalChallengers,
        numUniversalChallengers,
        councilQuorum,
        councilSize,
        feeRate,
      ),
      'minClaimValue',
    );
  } catch (err) {
    throw toError(err, 'computeMinClaimValue');
  }
}

export async function computeMinPeginFee(
  txGraphVersion: number,
  numVks: number,
  numUcs: number,
  minPeginFeeRate: bigint,
): Promise<bigint> {
  const { computeMinPeginFee: wasmComputeMinPeginFee } =
    await getWasmBindings();
  try {
    return assertWasmBigint(
      wasmComputeMinPeginFee(txGraphVersion, numVks, numUcs, minPeginFeeRate),
      'minPeginFee',
    );
  } catch (err) {
    throw toError(err, 'computeMinPeginFee');
  }
}

/**
 * Floor of the Payout transaction fee under `txGraphVersion`: the minimum of
 * `estimatedVsize * feeRate` across every output-sizing model a deployed
 * vault provider is known to have used (fixed-34, intermediate,
 * script-aware). A VP-built payout paying less than this is provably not
 * produced by any known VP build. `out0Len` must be the TRUSTED length of the
 * pinned outs[0] script (1..=128); `out1Len` is the measured, UNTRUSTED
 * commission-script length — safe here because padding cannot raise the floor
 * (the fixed-34 model saturates the minimum) and shortening only lowers it.
 * Pass `undefined` for `out1Len` on 2-output (non-VP-claimer) payouts.
 * `feeRate` is the vault's version-locked `offchainParams.feeRate`.
 */
export async function computePayoutFeeFloor(
  txGraphVersion: number,
  numVaultKeepers: number,
  numUniversalChallengers: number,
  numLocalChallengers: number,
  councilSize: number,
  out0Len: number,
  out1Len: number | null | undefined,
  feeRate: bigint,
): Promise<bigint> {
  const { computePayoutFeeFloor: wasmComputePayoutFeeFloor } =
    await getWasmBindings();
  try {
    return assertWasmBigint(
      wasmComputePayoutFeeFloor(
        txGraphVersion,
        numVaultKeepers,
        numUniversalChallengers,
        numLocalChallengers,
        councilSize,
        out0Len,
        out1Len,
        feeRate,
      ),
      'payoutFeeFloor',
    );
  } catch (err) {
    throw toError(err, 'computePayoutFeeFloor');
  }
}

/**
 * Tx graph versions the shipped vault-wasm binary can build. Callers must
 * preflight the required version (fresh: active; resume: stamped) against
 * this list and fail closed instead of hitting per-call errors mid-flow.
 *
 * Note: the facade constructors themselves fail closed on unsupported
 * versions, and derived objects carry the version they were built with —
 * value-level cross-checks live in `assertWasmPeginSizing` and the golden
 * byte-parity tests, not in a per-call version echo.
 */
export async function supportedTxGraphVersions(): Promise<number[]> {
  const { supportedTxGraphVersions: wasmSupportedTxGraphVersions } =
    await getWasmBindings();
  return Array.from(wasmSupportedTxGraphVersions());
}

/**
 * The PegIn transaction's P2A (pay-to-anchor) output for a graph version, or
 * `null` when that version's PegIn carries no anchor (v1). For v2/v3: 240 sats
 * at vout 2, script `51024e73`.
 */
export async function peginP2aAnchorOutput(
  txGraphVersion: number,
): Promise<PeginP2aAnchorInfo | null> {
  const { peginP2aAnchorOutput: wasmPeginP2aAnchorOutput } =
    await getWasmBindings();
  let anchor;
  try {
    anchor = wasmPeginP2aAnchorOutput(txGraphVersion);
  } catch (err) {
    throw toError(err, 'peginP2aAnchorOutput');
  }
  if (anchor === undefined) return null;
  try {
    return {
      value: assertWasmBigint(anchor.value, 'p2aAnchorValue'),
      vout: anchor.vout,
      scriptPubKey: anchor.scriptPubKey,
    };
  } finally {
    anchor.free();
  }
}

/**
 * Validate a PegIn transaction's P2A anchor against a graph version's rules:
 * v2 requires the exact anchor (240 sats, vout 2, P2A script) and v1 requires
 * that NO output carries the P2A script. Throws on any mismatch.
 */
export async function validatePeginP2aAnchor(
  txGraphVersion: number,
  txHex: string,
): Promise<void> {
  const { validatePeginP2aAnchor: wasmValidatePeginP2aAnchor } =
    await getWasmBindings();
  try {
    wasmValidatePeginP2aAnchor(txGraphVersion, txHex);
  } catch (err) {
    throw toError(err, 'validatePeginP2aAnchor');
  }
}

export async function createPayoutConnector(
  params: PayoutConnectorParams,
  network: Network,
): Promise<PayoutConnectorInfo> {
  const { WasmPeginPayoutConnector } = await getWasmBindings();

  const connector = new WasmPeginPayoutConnector(
    params.txGraphVersion,
    params.depositor,
    params.vaultProvider,
    params.vaultKeepers,
    params.universalChallengers,
    params.timelockPegin,
  );

  try {
    return {
      payoutScript: connector.getPayoutScript(),
      taprootScriptHash: connector.getTaprootScriptHash(),
      scriptPubKey: connector.getScriptPubKey(network),
      address: connector.getAddress(network),
      payoutControlBlock: connector.getPayoutControlBlock(),
    };
  } finally {
    connector.free();
  }
}

export async function getPeginPayoutScriptInfo(
  params: PayoutConnectorParams,
): Promise<{ payoutScript: string; payoutControlBlock: string }> {
  const { WasmPeginPayoutConnector } = await getWasmBindings();

  const connector = new WasmPeginPayoutConnector(
    params.txGraphVersion,
    params.depositor,
    params.vaultProvider,
    params.vaultKeepers,
    params.universalChallengers,
    params.timelockPegin,
  );

  try {
    return {
      payoutScript: connector.getPayoutScript(),
      payoutControlBlock: connector.getPayoutControlBlock(),
    };
  } finally {
    connector.free();
  }
}

// The Assert Payout/NoPayout connector is allocated, read and freed inside the
// call that needs it, so no allocation outlives the call that made it and no
// call can observe or free another call's object. Same construction as the
// browser facade in assertPayoutNoPayoutConnector.ts.
export async function getAssertPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
): Promise<AssertPayoutScriptInfo> {
  const { WasmAssertPayoutNoPayoutConnector } = await getWasmBindings();

  const conn = new WasmAssertPayoutNoPayoutConnector(
    params.txGraphVersion,
    params.claimer,
    params.localChallengers,
    params.universalChallengers,
    params.timelockAssert,
    params.councilMembers,
    params.councilQuorum,
  );

  try {
    return {
      payoutScript: conn.getPayoutScript(),
      payoutControlBlock: conn.getPayoutControlBlock(),
    };
  } finally {
    conn.free();
  }
}

export async function getAssertNoPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
  challengerPubkey: string,
): Promise<AssertNoPayoutScriptInfo> {
  const { WasmAssertPayoutNoPayoutConnector } = await getWasmBindings();

  const conn = new WasmAssertPayoutNoPayoutConnector(
    params.txGraphVersion,
    params.claimer,
    params.localChallengers,
    params.universalChallengers,
    params.timelockAssert,
    params.councilMembers,
    params.councilQuorum,
  );

  try {
    return {
      noPayoutScript: conn.getNoPayoutScript(challengerPubkey),
      noPayoutControlBlock: conn.getNoPayoutControlBlock(challengerPubkey),
    };
  } finally {
    conn.free();
  }
}

export async function getChallengeAssertScriptInfo(
  params: ChallengeAssertConnectorParams,
): Promise<ChallengeAssertScriptInfo> {
  const { WasmAssertChallengeAssertConnector } = await getWasmBindings();

  const conn = new WasmAssertChallengeAssertConnector(
    params.txGraphVersion,
    params.claimer,
    params.challenger,
    params.claimerWotsKeysJson,
    params.gcWotsKeysJson,
  );

  try {
    return {
      script: conn.getScript(),
      controlBlock: conn.getControlBlock(),
    };
  } finally {
    conn.free();
  }
}

// wasm-bindgen rethrows Rust `JsValue::from_str(...)` errors as bare strings,
// which break `err instanceof Error` and structured error handling. Normalize
// to `Error` so the JS API surface is consistent with idiomatic JS rejection.
function toError(err: unknown, fnName: string): Error {
  if (err instanceof Error) return err;
  const msg = typeof err === 'string' ? err : String(err);
  return new Error(`${fnName}: ${msg}`);
}

/**
 * Derive 32-byte `authAnchor` (OP_RETURN preimage → VP bearer token).
 * @stability frozen — owned by btc-vault Rust via the vault-wasm pin (`VAULT_WASM_COMMIT`); rotation breaks VP auth for existing deposits.
 */
export async function expandAuthAnchor(root: Uint8Array): Promise<Uint8Array> {
  const { expandAuthAnchor: wasmExpandAuthAnchor } = await getWasmBindings();
  try {
    return wasmExpandAuthAnchor(root);
  } catch (err) {
    throw toError(err, 'expandAuthAnchor');
  }
}

/**
 * Derive 32-byte `hashlockSecret` for HTLC `htlcVout` (preimage → `activateVaultWithSecret`).
 * @stability frozen — owned by btc-vault Rust; rotation means affected vaults can never activate.
 */
export async function expandHashlockSecret(
  root: Uint8Array,
  htlcVout: number,
): Promise<Uint8Array> {
  const { expandHashlockSecret: wasmExpandHashlockSecret } =
    await getWasmBindings();
  try {
    return wasmExpandHashlockSecret(root, htlcVout);
  } catch (err) {
    throw toError(err, 'expandHashlockSecret');
  }
}

/**
 * Derive 64-byte `wotsSeed` for HTLC `htlcVout` (→ WOTS keys, hashed as `depositorWotsPkHash`).
 * @stability frozen — owned by btc-vault Rust; rotation breaks existing `depositorWotsPkHash` → no claim path.
 */
export async function expandWotsSeed(
  root: Uint8Array,
  htlcVout: number,
): Promise<Uint8Array> {
  const { expandWotsSeed: wasmExpandWotsSeed } = await getWasmBindings();
  try {
    return wasmExpandWotsSeed(root, htlcVout);
  } catch (err) {
    throw toError(err, 'expandWotsSeed');
  }
}

/**
 * Derives the vault ID from a PegIn transaction hash and depositor ETH address.
 *
 * Vault ID = keccak256(abi.encode(peginTxHash, depositor))
 * This matches the Solidity-side derivation in BTCVaultRegistry.
 *
 * @param peginTxHash - 32-byte PegIn tx hash in display order (big-endian), hex encoded
 * @param depositor - 20-byte Ethereum address of the depositor, hex encoded
 * @returns Hex-encoded vault ID (32 bytes)
 */
export async function deriveVaultId(
  peginTxHash: string,
  depositor: string,
): Promise<string> {
  const { deriveVaultId: wasmDeriveVaultId } = await getWasmBindings();
  const hashBytes = hexToBytes(peginTxHash);
  if (hashBytes.length !== 32) {
    throw new Error(`peginTxHash must be 32 bytes, got ${hashBytes.length}`);
  }
  const depositorBytes = hexToBytes(depositor);
  if (depositorBytes.length !== 20) {
    throw new Error(`depositor must be 20 bytes, got ${depositorBytes.length}`);
  }
  return wasmDeriveVaultId(hashBytes, depositorBytes);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0) {
    throw new Error(
      `Invalid hex string: expected even length, got ${clean.length}`,
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error('Invalid hex string: contains non-hex characters');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Export types
export type {
  Network,
  PrePeginParams,
  PrePeginResult,
  PeginTxResult,
  PeginP2aAnchorInfo,
  HtlcConnectorParams,
  HtlcConnectorInfo,
  PayoutConnectorParams,
  PayoutConnectorInfo,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  AssertNoPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
  WatchtowerArtifactsInputs,
  WotsKeypairDerivation,
  WronglyChallengedPsbts,
  WronglyChallengedSigs,
} from './types.js';

// Export constants
export { TAP_INTERNAL_KEY, tapInternalPubkey } from './constants.js';

// Export boundary value guards (input validation for callers)
export { assertPositiveBigintArray } from './value-guards.js';

// The delegated-claim assembly surface (graph v3 only). Claim-time execution
// stays with the `vaultd vp wt` watchtower CLI, which reads the files these
// produce.
export const {
  buildAssertClaimerPsbt,
  buildClaimPsbt,
  buildPayoutClaimerPsbt,
  buildPayoutDepositorPsbt,
  buildWatchtowerArtifacts,
  buildWronglyChallengedPsbts,
  extractDepositorPayoutSig,
  extractTapScriptSig,
  finalizeClaimTx,
  validateWotsKeypairAgainstGraph,
  verifyWatchtowerArtifacts,
  wotsKeypairFromSeed,
} = createDelegatedClaimApi(getWasmBindings);
