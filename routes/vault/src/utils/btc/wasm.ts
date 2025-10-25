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

/**
 * Parameters for creating an unfunded peg-in transaction.
 *
 * Note: This creates a transaction with no inputs and one output (the pegin output).
 * The frontend is responsible for:
 * - Selecting UTXOs to fund the transaction
 * - Calculating transaction fees
 * - Adding inputs to cover peginAmount + fees
 * - Adding a change output if needed
 * - Creating and signing the PSBT via wallet
 */
export interface PegInParams {
  /** X-only public key of the depositor (hex encoded) */
  depositorPubkey: string;
  /** X-only public key of the claimer/vault provider (hex encoded) */
  claimerPubkey: string;
  /** Array of x-only public keys of challengers (hex encoded) */
  challengerPubkeys: string[];
  /** Amount to peg-in in satoshis */
  pegInAmount: bigint;
  /** Bitcoin network */
  network: Network;
}

/**
 * Result of creating an unfunded peg-in transaction.
 *
 * This transaction has no inputs and only one output (the pegin output).
 * The frontend must:
 * - Add inputs from selected UTXOs
 * - Calculate and add change output if needed
 * - Sign the transaction via wallet
 */
export interface PegInResult {
  /** Unfunded transaction hex (no inputs, only pegin output) */
  txHex: string;
  /** Transaction ID (will change after adding inputs and signing) */
  txid: string;
  /** Vault script pubkey (hex encoded) */
  vaultScriptPubKey: string;
  /** Vault output value in satoshis */
  vaultValue: bigint;
}

/**
 * Creates an unfunded peg-in transaction with no inputs and one output.
 *
 * This function creates a Bitcoin transaction template that the frontend
 * must fund by:
 * 1. Selecting appropriate UTXOs from the wallet
 * 2. Calculating transaction fees based on selected inputs
 * 3. Adding inputs to cover peginAmount + fees
 * 4. Adding a change output if the input value exceeds peginAmount + fees
 * 5. Creating a PSBT and signing it via the wallet
 *
 * The returned transaction has:
 * - 0 inputs
 * - 1 output (the pegin output to the vault address)
 *
 * @param params - Peg-in parameters (public keys, amount, network)
 * @returns Unfunded transaction details with vault output information
 */
export async function createPegInTransaction(
  params: PegInParams
): Promise<PegInResult> {
  await initWasm();

  const tx = new WasmPeginTx(
    params.depositorPubkey,
    params.claimerPubkey,
    params.challengerPubkeys,
    params.pegInAmount,
    params.network
  );

  return {
    txHex: tx.toHex(),
    txid: tx.getTxid(),
    vaultScriptPubKey: tx.getVaultScriptPubKey(),
    vaultValue: tx.getVaultValue(),
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
