// Node.js entry point for the WASM bindings.
//
// Loads the committed web WASM binary synchronously from disk using
// readFileSync and initializes it via initSync. This avoids fetch()-based
// loading, which does not work in Node.js environments, and does not require
// a separate wasm-pack --target nodejs build step.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import { initSync, WasmPrePeginTx, WasmPeginTx, WasmPrePeginHtlcConnector, WasmPeginPayoutConnector, WasmAssertPayoutNoPayoutConnector, WasmAssertChallengeAssertConnector, computeMinClaimValue as wasmComputeMinClaimValue, computeMinPeginFee as wasmComputeMinPeginFee, deriveVaultId as wasmDeriveVaultId, expandAuthAnchor as wasmExpandAuthAnchor, expandHashlockSecret as wasmExpandHashlockSecret, expandWotsSeed as wasmExpandWotsSeed } from "./generated/btc_vault.js";

import type {
  PrePeginParams,
  PrePeginResult,
  PeginTxResult,
  HtlcConnectorParams,
  HtlcConnectorInfo,
  PayoutConnectorParams,
  PayoutConnectorInfo,
  Network,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  AssertNoPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
} from "./types.js";
import { assertWasmBigint } from "./value-guards.js";

/**
 * HTLC output index for single deposits.
 */

let wasmInitialized = false;

export async function initWasm(): Promise<void> {
  if (wasmInitialized) return;
  const wasmPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "generated",
    "btc_vault_bg.wasm",
  );
  initSync({ module: readFileSync(wasmPath) });
  wasmInitialized = true;
}

export async function createPrePeginTransaction(
  params: PrePeginParams,
): Promise<PrePeginResult> {
  await initWasm();

  // The 14th positional arg `auth_anchor_hash` is an Option<String> in
  // Rust — pass `undefined` for Pre-PegIns that do not commit an auth
  // anchor. Requires a WASM build from a btc-vault commit ≥ 1ced81e5
  // (btc-vault #1516). The 9th arg `min_pegin_fee_rate` requires the
  // two-rate `WasmPrePeginTx` constructor from btc-vault #1930.
  const tx = new (WasmPrePeginTx as unknown as new (
    depositor: string,
    vault_provider: string,
    vault_keepers: string[],
    universal_challengers: string[],
    hashlocks: string[],
    pegin_amounts: BigUint64Array,
    timelock_refund: number,
    fee_rate: bigint,
    min_pegin_fee_rate: bigint,
    num_local_challengers: number,
    council_quorum: number,
    council_size: number,
    network: string,
    auth_anchor_hash?: string,
  ) => typeof WasmPrePeginTx.prototype)(
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    [...params.hashlocks],
    new BigUint64Array(params.pegInAmounts),
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
        "depositorClaimValue",
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
  await initWasm();

  const unfundedTx = new (WasmPrePeginTx as unknown as new (
    depositor: string,
    vault_provider: string,
    vault_keepers: string[],
    universal_challengers: string[],
    hashlocks: string[],
    pegin_amounts: BigUint64Array,
    timelock_refund: number,
    fee_rate: bigint,
    min_pegin_fee_rate: bigint,
    num_local_challengers: number,
    council_quorum: number,
    council_size: number,
    network: string,
    auth_anchor_hash?: string,
  ) => typeof WasmPrePeginTx.prototype)(
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    [...params.hashlocks],
    new BigUint64Array(params.pegInAmounts),
    params.timelockRefund,
    params.feeRate,
    params.minPeginFeeRate,
    params.numLocalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.network,
    params.authAnchorHash,
  );

  let fundedTx: WasmPrePeginTx | null = null;
  let peginTx: WasmPeginTx | null = null;
  try {
    fundedTx = unfundedTx.fromFundedTransaction(fundedPrePeginTxHex);
    peginTx = fundedTx.buildPeginTx(timelockPegin, htlcVout);

    return {
      txHex: peginTx.toHex(),
      txid: peginTx.getTxid(),
      vaultScriptPubKey: peginTx.getVaultScriptPubKey(),
      vaultValue: peginTx.getVaultValue(),
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
  await initWasm();

  const connector = new WasmPrePeginHtlcConnector(
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
  numLocalChallengers: number,
  numUniversalChallengers: number,
  councilQuorum: number,
  councilSize: number,
  feeRate: bigint,
): Promise<bigint> {
  await initWasm();
  return assertWasmBigint(
    wasmComputeMinClaimValue(
      numLocalChallengers,
      numUniversalChallengers,
      councilQuorum,
      councilSize,
      feeRate,
    ),
    "minClaimValue",
  );
}

export async function computeMinPeginFee(
  numVks: number,
  numUcs: number,
  minPeginFeeRate: bigint,
): Promise<bigint> {
  await initWasm();
  return assertWasmBigint(
    wasmComputeMinPeginFee(numVks, numUcs, minPeginFeeRate),
    "minPeginFee",
  );
}

export async function createPayoutConnector(
  params: PayoutConnectorParams,
  network: Network,
): Promise<PayoutConnectorInfo> {
  await initWasm();

  const connector = new WasmPeginPayoutConnector(
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
  await initWasm();

  const connector = new WasmPeginPayoutConnector(
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

export async function getAssertPayoutScriptInfo(
  params: AssertPayoutNoPayoutConnectorParams,
): Promise<AssertPayoutScriptInfo> {
  await initWasm();

  const conn = new WasmAssertPayoutNoPayoutConnector(
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
  await initWasm();

  const conn = new WasmAssertPayoutNoPayoutConnector(
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
  await initWasm();

  const conn = new WasmAssertChallengeAssertConnector(
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
  const msg = typeof err === "string" ? err : String(err);
  return new Error(`${fnName}: ${msg}`);
}

/**
 * Derive 32-byte `authAnchor` (OP_RETURN preimage → VP bearer token).
 * @stability frozen — owned by btc-vault Rust (`BTC_VAULT_COMMIT`); rotation breaks VP auth for existing deposits.
 */
export async function expandAuthAnchor(root: Uint8Array): Promise<Uint8Array> {
  await initWasm();
  try {
    return wasmExpandAuthAnchor(root);
  } catch (err) {
    throw toError(err, "expandAuthAnchor");
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
  await initWasm();
  try {
    return wasmExpandHashlockSecret(root, htlcVout);
  } catch (err) {
    throw toError(err, "expandHashlockSecret");
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
  await initWasm();
  try {
    return wasmExpandWotsSeed(root, htlcVout);
  } catch (err) {
    throw toError(err, "expandWotsSeed");
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
  await initWasm();
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
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length === 0 || clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string: expected even length, got ${clean.length}`);
  }
  if (!/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error("Invalid hex string: contains non-hex characters");
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
  HtlcConnectorParams,
  HtlcConnectorInfo,
  PayoutConnectorParams,
  PayoutConnectorInfo,
  AssertPayoutNoPayoutConnectorParams,
  AssertPayoutScriptInfo,
  AssertNoPayoutScriptInfo,
  ChallengeAssertConnectorParams,
  ChallengeAssertScriptInfo,
} from "./types.js";

// Export constants
export { TAP_INTERNAL_KEY, tapInternalPubkey } from "./constants.js";

// Re-export WASM classes (mirrors index.ts browser entry)
export { WasmPrePeginTx, WasmPeginTx, WasmPrePeginHtlcConnector, WasmPeginPayoutConnector };
