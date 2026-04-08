/**
 * BTC Transaction Broadcasting Service
 *
 * Handles signing and broadcasting BTC transactions to the Bitcoin network.
 * Used in PegIn flow step after vault provider verification.
 */

import { pushTx } from "@babylonlabs-io/ts-sdk";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { getMempoolApiUrl } from "../../clients/btc/config";
import { getPsbtInputFields } from "../../utils/btc";

import { fetchUTXOFromMempool } from "./vaultUtxoDerivationService";

/**
 * UTXO information needed for PSBT construction
 */
export interface UTXOInfo {
  txid: string;
  vout: number;
  value: bigint;
  scriptPubKey: string;
}

const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Convert a UTXO array into the expectedUtxos Record format
 * used by broadcastPrePeginTransaction for trusted UTXO resolution.
 * Validates each entry and throws on malformed data (e.g. corrupted localStorage).
 */
export function utxosToExpectedRecord(
  utxos: ReadonlyArray<{
    txid: string;
    vout: number;
    value: number | string;
    scriptPubKey: string;
  }>,
): Record<string, { scriptPubKey: string; value: number }> {
  const record: Record<string, { scriptPubKey: string; value: number }> = {};
  for (const u of utxos) {
    const numValue = Number(u.value);
    if (!Number.isSafeInteger(numValue) || numValue < 0) {
      throw new Error(`Invalid UTXO value for ${u.txid}:${u.vout}: ${u.value}`);
    }
    if (!u.txid || !HEX_RE.test(u.txid)) {
      throw new Error(`Invalid UTXO txid: ${u.txid}`);
    }
    if (!u.scriptPubKey || !HEX_RE.test(u.scriptPubKey)) {
      throw new Error(`Invalid UTXO scriptPubKey for ${u.txid}:${u.vout}`);
    }
    record[`${u.txid}:${u.vout}`] = {
      scriptPubKey: u.scriptPubKey,
      value: numValue,
    };
  }
  return record;
}

export interface BroadcastPrePeginParams {
  /**
   * Unsigned transaction hex (from contract or WASM)
   */
  unsignedTxHex: string;

  /**
   * BTC wallet provider with signing capability
   */
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  };

  /**
   * Depositor's BTC public key (x-only format, 32 bytes hex)
   * Required for Taproot (P2TR) signing
   */
  depositorBtcPubkey: string;

  /**
   * Trusted UTXO data from transaction construction phase.
   * When provided, these are used directly instead of querying the mempool API,
   * eliminating the trust boundary violation where a compromised mempool API
   * could return manipulated UTXO values.
   * Key format: "txid:vout" (e.g. "abc123...def:0").
   */
  expectedUtxos?: Record<string, { scriptPubKey: string; value: number }>;
}

/**
 * Resolve UTXO data for a transaction input.
 * When expectedUtxos is provided, ALL inputs must be present in the map —
 * a partial map would silently fall back to untrusted mempool data for
 * missing entries, defeating the purpose of trusted prevout resolution.
 */
async function resolveInputUtxo(
  txid: string,
  vout: number,
  expectedUtxos:
    | Record<string, { scriptPubKey: string; value: number }>
    | undefined,
): Promise<{ scriptPubKey: string; value: number }> {
  if (!expectedUtxos) {
    return fetchUTXOFromMempool(txid, vout);
  }

  const expected = expectedUtxos[`${txid}:${vout}`];
  if (!expected) {
    throw new Error(
      `expectedUtxos provided but missing entry for ${txid}:${vout}. ` +
        `All transaction inputs must be covered when expectedUtxos is supplied.`,
    );
  }
  return expected;
}

/**
 * Sanity check: total input value must at least cover total output value.
 * This catches obvious manipulation (negative fees) when the mempool fallback
 * is used. The primary defense is using expectedUtxos from construction time;
 * this check is defense-in-depth for the fallback path.
 */
function validateInputOutputBalance(
  totalInputValue: bigint,
  totalOutputValue: bigint,
): void {
  // The difference (input - output) is the miner fee. We validate that
  // inputs are at least as large as outputs (negative fee = impossible).
  if (totalInputValue < totalOutputValue) {
    throw new Error(
      `UTXO value mismatch: total input value (${totalInputValue} sat) is less than ` +
        `total output value (${totalOutputValue} sat). ` +
        `This may indicate the mempool API returned manipulated UTXO data.`,
    );
  }
}

/**
 * Add inputs from transaction to PSBT with proper UTXO data.
 * When expectedUtxos is provided, uses trusted data from the transaction
 * construction phase instead of querying the untrusted mempool API.
 */
async function addInputsToPsbt(
  psbt: Psbt,
  tx: Transaction,
  publicKeyNoCoord: Buffer,
  expectedUtxos?: Record<string, { scriptPubKey: string; value: number }>,
): Promise<void> {
  let totalInputValue = 0n;

  for (const input of tx.ins) {
    // Extract txid and vout (Bitcoin stores txid in reverse byte order)
    const txid = Buffer.from(input.hash).reverse().toString("hex");
    const vout = input.index;

    // Use trusted data when available, fall back to mempool API
    const utxoData = await resolveInputUtxo(txid, vout, expectedUtxos);
    totalInputValue += BigInt(utxoData.value);

    // Get proper PSBT input fields based on script type
    // Handles P2PKH, P2SH, P2WPKH, P2WSH, P2TR
    const psbtInputFields = getPsbtInputFields(
      {
        txid,
        vout,
        value: utxoData.value,
        scriptPubKey: utxoData.scriptPubKey,
      },
      publicKeyNoCoord,
    );

    // Add input with proper fields for the script type
    psbt.addInput({
      hash: input.hash,
      index: input.index,
      sequence: input.sequence,
      ...psbtInputFields, // Includes witnessUtxo, tapInternalKey (for P2TR), etc.
    });
  }

  // Cross-validate: total inputs must cover total outputs
  const totalOutputValue = tx.outs.reduce(
    (sum, out) => sum + BigInt(out.value),
    0n,
  );
  validateInputOutputBalance(totalInputValue, totalOutputValue);
}

/**
 * Add outputs from transaction to PSBT
 */
function addOutputsToPsbt(psbt: Psbt, tx: Transaction): void {
  for (const output of tx.outs) {
    psbt.addOutput({
      script: output.script,
      value: output.value,
    });
  }
}

/**
 * Convert unsigned transaction to PSBT format
 */
async function createPsbtFromTransaction(
  tx: Transaction,
  publicKeyNoCoord: Buffer,
  expectedUtxos?: Record<string, { scriptPubKey: string; value: number }>,
): Promise<Psbt> {
  const psbt = new Psbt();
  psbt.setVersion(tx.version);
  psbt.setLocktime(tx.locktime);

  await addInputsToPsbt(psbt, tx, publicKeyNoCoord, expectedUtxos);
  addOutputsToPsbt(psbt, tx);

  return psbt;
}

/**
 * Sign PSBT and extract final transaction hex
 */
async function signAndFinalizePsbt(
  psbtHex: string,
  btcWalletProvider: { signPsbt: (psbtHex: string) => Promise<string> },
): Promise<string> {
  const signedPsbtHex = await btcWalletProvider.signPsbt(psbtHex);
  const signedPsbt = Psbt.fromHex(signedPsbtHex);

  // Finalize inputs if not already finalized
  try {
    signedPsbt.finalizeAllInputs();
  } catch {
    // Some wallets finalize automatically, ignore errors
  }

  return signedPsbt.extractTransaction().toHex();
}

/**
 * Sign and broadcast the funded Pre-PegIn transaction to the Bitcoin network
 *
 * @param params - Transaction and wallet parameters
 * @returns The broadcasted transaction ID
 * @throws Error if signing or broadcasting fails
 */
export async function broadcastPrePeginTransaction(
  params: BroadcastPrePeginParams,
): Promise<string> {
  const {
    unsignedTxHex,
    btcWalletProvider,
    depositorBtcPubkey,
    expectedUtxos,
  } = params;

  try {
    // Parse transaction
    const cleanHex = unsignedTxHex.startsWith("0x")
      ? unsignedTxHex.slice(2)
      : unsignedTxHex;
    const tx = Transaction.fromHex(cleanHex);

    if (tx.ins.length === 0) {
      throw new Error("Transaction has no inputs");
    }

    // Convert to PSBT with proper input fields
    // When expectedUtxos is provided, trusted construction-time data is used
    // instead of querying the untrusted mempool API
    const publicKeyNoCoord = Buffer.from(depositorBtcPubkey, "hex");
    const psbt = await createPsbtFromTransaction(
      tx,
      publicKeyNoCoord,
      expectedUtxos,
    );

    // Sign and finalize
    const signedTxHex = await signAndFinalizePsbt(
      psbt.toHex(),
      btcWalletProvider,
    );

    // Broadcast to network
    return await pushTx(signedTxHex, getMempoolApiUrl());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to broadcast Pre-PegIn transaction: ${message}`);
  }
}
