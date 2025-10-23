import init, {
  WasmPeginTx,
  WasmPeginPayoutConnector,
} from "@routes/vault/wasm/btc_vault.js";

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

export type Network = "bitcoin" | "testnet" | "regtest" | "signet";

export interface PegInParams {
  depositTxid: string;
  depositVout: number;
  depositValue: bigint;
  depositScriptPubKey: string; // hex
  depositorPubkey: string; // 64-char hex
  claimerPubkey: string; // 64-char hex
  challengerPubkeys: string[]; // array of 64-char hex
  pegInAmount: bigint;
  fee: bigint;
  network: Network;
}

export interface PegInResult {
  txHex: string;
  txid: string;
  vaultScriptPubKey: string;
  vaultValue: bigint;
  changeValue: bigint;
}

export async function createPegInTransaction(
  params: PegInParams
): Promise<PegInResult> {
  await initWasm();

  const tx = new WasmPeginTx(
    params.depositTxid,
    params.depositVout,
    params.depositValue,
    params.depositScriptPubKey,
    params.depositorPubkey,
    params.claimerPubkey,
    params.challengerPubkeys,
    params.pegInAmount,
    params.fee,
    params.network
  );

  return {
    txHex: tx.toHex(),
    txid: tx.getTxid(),
    vaultScriptPubKey: tx.getVaultScriptPubKey(),
    vaultValue: tx.getVaultValue(),
    changeValue: tx.getChangeValue(),
  };
}

// ==================== Payout Connector ====================

/**
 * Parameters for creating a payout connector
 */
export interface PayoutConnectorParams {
  /** X-only public key of the depositor (hex encoded) */
  depositor: string;
  /** X-only public key of the vault provider (hex encoded) */
  vaultProvider: string;
  /** Array of x-only public keys of liquidators (hex encoded) */
  liquidators: string[];
}

/**
 * Information about a payout connector
 */
export interface PayoutConnectorInfo {
  /** The full payout script (hex encoded) */
  payoutScript: string;
  /** Taproot script hash (TapNodeHash) - this is the tapLeafHash needed for signing PSBTs */
  taprootScriptHash: string;
  /** Taproot script pubkey (hex encoded) */
  scriptPubKey: string;
  /** Pay-to-Taproot (P2TR) address */
  address: string;
}

/**
 * Creates a payout connector for vault transactions.
 *
 * The payout connector generates the necessary taproot scripts and information
 * required for signing payout transactions (both optimistic and regular payout paths).
 *
 * @param params - Parameters for creating the payout connector
 * @param network - Bitcoin network
 * @returns Payout connector information including scripts, hashes, and address
 *
 * @example
 * ```typescript
 * const payoutInfo = await createPayoutConnector({
 *   depositor: "abc123...",
 *   vaultProvider: "def456...",
 *   liquidators: ["ghi789..."]
 * }, "testnet");
 *
 * console.log(payoutInfo.taprootScriptHash); // Use this for PSBT signing
 * console.log(payoutInfo.address); // P2TR address
 * ```
 */
export async function createPayoutConnector(
  params: PayoutConnectorParams,
  network: Network
): Promise<PayoutConnectorInfo> {
  await initWasm();

  const connector = new WasmPeginPayoutConnector(
    params.depositor,
    params.vaultProvider,
    params.liquidators
  );

  return {
    payoutScript: connector.getPayoutScript(),
    taprootScriptHash: connector.getTaprootScriptHash(),
    scriptPubKey: connector.getScriptPubKey(network),
    address: connector.getAddress(network),
  };
}

// Re-export the raw WASM types if needed
export { WasmPeginTx, WasmPeginPayoutConnector } from "@routes/vault/wasm/btc_vault.js";
