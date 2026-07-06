// @ts-expect-error - WASM files are in dist/generated/ (checked into git), not src/generated/
import init, { WasmPrePeginTx, WasmPrePeginHtlcConnector, WasmPeginTx, computeMinClaimValue as wasmComputeMinClaimValue, computeMinPeginFee as wasmComputeMinPeginFee, deriveVaultId as wasmDeriveVaultId, expandAuthAnchor as wasmExpandAuthAnchor, expandHashlockSecret as wasmExpandHashlockSecret, expandWotsSeed as wasmExpandWotsSeed } from "./generated/btc_vault.js";
import type {
  PrePeginParams,
  PrePeginResult,
  PeginTxResult,
  HtlcConnectorParams,
  HtlcConnectorInfo,
} from "./types.js";
import { assertPositiveBigintArray, assertWasmBigint } from "./value-guards.js";

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
    new BigUint64Array(
      assertPositiveBigintArray(params.pegInAmounts, "pegInAmounts"),
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
        "depositorClaimValue",
      ),
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
    new BigUint64Array(
      assertPositiveBigintArray(params.pegInAmounts, "pegInAmounts"),
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

  let fundedTx: WasmPrePeginTx | null = null;
  let peginTx: WasmPeginTx | null = null;
  try {
    fundedTx = unfundedTx.fromFundedTransaction(fundedPrePeginTxHex);
    peginTx = fundedTx.buildPeginTx(timelockPegin, htlcVout);

    return {
      txHex: peginTx.toHex(),
      txid: peginTx.getTxid(),
      vaultScriptPubKey: peginTx.getVaultScriptPubKey(),
      vaultValue: assertWasmBigint(peginTx.getVaultValue(), "vaultValue"),
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
  try {
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
  } catch (err) {
    throw toError(err, "computeMinClaimValue");
  }
}

/**
 * Compute the minimum PegIn (activation) transaction fee in satoshis.
 *
 * `minPeginFee = peginTxVsize(numVks, numUcs) × minPeginFeeRate`. Each HTLC
 * the depositor funds in the Pre-PegIn tx must reserve at least this fee
 * inside its value (`htlcValue = peginAmount + depositorClaimValue +
 * minPeginFee`), otherwise the VP cannot afford to broadcast the PegIn at
 * activation. The vsize comes from a Taproot script-path-spend weight
 * prediction whose witness shape depends on the VK + UC signer count.
 */
export async function computeMinPeginFee(
  numVks: number,
  numUcs: number,
  minPeginFeeRate: bigint,
): Promise<bigint> {
  await initWasm();
  try {
    return assertWasmBigint(
      wasmComputeMinPeginFee(numVks, numUcs, minPeginFeeRate),
      "minPeginFee",
    );
  } catch (err) {
    throw toError(err, "computeMinPeginFee");
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
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
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

// Export boundary value guards (input validation for callers)
export { assertPositiveBigintArray } from "./value-guards.js";

// Export payout connector utilities
export { createPayoutConnector, getPeginPayoutScriptInfo } from "./payoutConnector.js";

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
