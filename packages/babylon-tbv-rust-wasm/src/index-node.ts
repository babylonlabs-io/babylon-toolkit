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
import { initSync, WasmPrePeginTx, WasmPeginTx, WasmPrePeginHtlcConnector, WasmPeginPayoutConnector, WasmAssertPayoutNoPayoutConnector, WasmAssertChallengeAssertConnector, computeMinClaimValue as wasmComputeMinClaimValue, deriveVaultId as wasmDeriveVaultId } from "./generated/btc_vault.js";

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
  const tx = new WasmPrePeginTx(
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    [...params.hashlocks],
    new BigUint64Array(params.pegInAmounts),
    params.timelockRefund,
    params.feeRate,
    params.numLocalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.network,
  );

  try {
    const numHtlcs = tx.getNumHtlcs();
    const htlcValues: bigint[] = [];
    const htlcScriptPubKeys: string[] = [];
    const htlcAddresses: string[] = [];
    const peginAmounts: bigint[] = [];

    for (let i = 0; i < numHtlcs; i++) {
      htlcValues.push(tx.getHtlcValue(i));
      htlcScriptPubKeys.push(tx.getHtlcScriptPubKey(i));
      htlcAddresses.push(tx.getHtlcAddress(i));
      peginAmounts.push(tx.getPeginAmountAt(i));
    }

    return {
      txHex: tx.toHex(),
      txid: tx.getTxid(),
      htlcValues,
      htlcScriptPubKeys,
      htlcAddresses,
      peginAmounts,
      depositorClaimValue: tx.getDepositorClaimValue(),
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
  const unfundedTx = new WasmPrePeginTx(
    params.depositorPubkey,
    params.vaultProviderPubkey,
    params.vaultKeeperPubkeys,
    params.universalChallengerPubkeys,
    [...params.hashlocks],
    new BigUint64Array(params.pegInAmounts),
    params.timelockRefund,
    params.feeRate,
    params.numLocalChallengers,
    params.councilQuorum,
    params.councilSize,
    params.network,
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
  return wasmComputeMinClaimValue(
    numLocalChallengers,
    numUniversalChallengers,
    councilQuorum,
    councilSize,
    feeRate,
  );
}

export async function createPayoutConnector(
  params: PayoutConnectorParams,
  network: Network,
): Promise<PayoutConnectorInfo> {
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
