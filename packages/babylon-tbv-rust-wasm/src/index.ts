// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import init, { WasmPrePeginTx, WasmPrePeginHtlcConnector, WasmPeginTx, computeMinClaimValue as wasmComputeMinClaimValue, deriveVaultId as wasmDeriveVaultId } from "./generated/btc_vault.js";
import type {
  PrePeginParams,
  PrePeginResult,
  PeginTxResult,
  HtlcConnectorParams,
  HtlcConnectorInfo,
} from "./types.js";

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

export async function initWasm() {
  if (wasmInitialized) return;
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      await init();
      wasmInitialized = true;
    } finally {
      wasmInitPromise = null;
    }
  })();

  return wasmInitPromise;
}

/**
 * Creates an unfunded Pre-PegIn transaction with no inputs and HTLC output(s).
 *
 * The HTLC output value (htlcValue) covers the peg-in amount, depositor claim value,
 * and minimum pegin fee — all computed internally from the provided contract parameters.
 *
 * After building the Pre-PegIn transaction, the caller must:
 * 1. Select UTXOs covering htlcValue + network fees
 * 2. Fund the transaction (add inputs and change output)
 * 3. Call reconstructFromFundedTx() with the funded tx hex
 * 4. Call buildPeginTx() to derive the PegIn transaction
 * 5. Sign the PegIn input using the HTLC hashlock leaf (leaf 0)
 *
 * @param params - Pre-PegIn parameters from contract and depositor wallet
 * @returns Unfunded transaction details with HTLC output information
 */
export async function createPrePeginTransaction(
  params: PrePeginParams,
): Promise<PrePeginResult> {
  await initWasm();

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

/**
 * Derives the PegIn transaction from a funded Pre-PegIn transaction.
 *
 * The PegIn transaction has a single input spending the Pre-PegIn HTLC output
 * at `htlcVout` via the hashlock + all-party script (leaf 0).
 *
 * @param params - Same PrePeginParams used to create the Pre-PegIn transaction
 * @param timelockPegin - CSV timelock in blocks for the PegIn vault output
 * @param fundedPrePeginTxHex - Hex-encoded funded Pre-PegIn transaction
 * @param htlcVout - Index of the HTLC output to spend
 * @returns PegIn transaction details including vault output information
 */
export async function buildPeginTxFromPrePegin(
  params: PrePeginParams,
  timelockPegin: number,
  fundedPrePeginTxHex: string,
  htlcVout: number,
): Promise<PeginTxResult> {
  await initWasm();

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

/**
 * Returns HTLC connector script info for signing the PegIn transaction input.
 *
 * The depositor signs PegIn input 0 using the hashlock leaf (leaf 0) of the
 * Pre-PegIn HTLC output. Use getHashlockScript() and getHashlockControlBlock()
 * to construct the tapLeafScript entry in the PSBT.
 *
 * @param params - HTLC connector parameters (subset of PrePeginParams)
 * @returns Hashlock and refund script info for PSBT construction
 */
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

/**
 * Compute the minimum depositor claim value (PegIn output 1) in satoshis.
 *
 * This covers the full downstream tx graph cost (Claim → Assert → Payout)
 * based on the protocol parameters.
 */
export async function computeMinClaimValue(
  numLocalChallengers: number,
  numUniversalChallengers: number,
  councilQuorum: number,
  councilSize: number,
  feeRate: bigint,
): Promise<bigint> {
  await initWasm();
  return wasmComputeMinClaimValue(
    numLocalChallengers,
    numUniversalChallengers,
    councilQuorum,
    councilSize,
    feeRate,
  );
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

// Export payout connector utilities
export { createPayoutConnector, getPeginPayoutScript } from "./payoutConnector.js";

// Export assert payout/nopayout connector utilities (depositor-as-claimer)
export {
  getAssertPayoutScriptInfo,
  getAssertNoPayoutScriptInfo,
} from "./assertPayoutNoPayoutConnector.js";

// Export challenge assert connector utilities (depositor-as-claimer)
export { getChallengeAssertScriptInfo } from "./challengeAssertConnector.js";

// Re-export raw WASM types for callers that need direct access
// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
export { WasmPeginTx, WasmPeginPayoutConnector, WasmPrePeginTx, WasmPrePeginHtlcConnector } from "./generated/btc_vault.js";
