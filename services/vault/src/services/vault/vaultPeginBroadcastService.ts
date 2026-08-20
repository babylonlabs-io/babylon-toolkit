/**
 * BTC Transaction Broadcasting Service
 *
 * Handles signing and broadcasting BTC transactions to the Bitcoin network.
 * Used in PegIn flow step after vault provider verification.
 */

import {
  HEX_RE,
  MAX_REASONABLE_FEE_SATS,
  TXID_RE,
  pushTx,
} from "@babylonlabs-io/ts-sdk";
import {
  ensurePrePeginTermsApproval,
  isDepositTermsRejectedError,
  type DepositTerms,
  type PrePeginApprovalWallet,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { assertPsbtUnsignedTxMatches } from "@babylonlabs-io/ts-sdk/tbv/core/primitives";
import { getPsbtInputFields } from "@babylonlabs-io/ts-sdk/tbv/core/utils";
import { Psbt, Transaction } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import { getMempoolApiUrl } from "../../clients/btc/config";

import { fetchUTXOFromMempool } from "./vaultUtxoDerivationService";

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
    if (!u.txid || !TXID_RE.test(u.txid)) {
      throw new Error(`Invalid UTXO txid: ${u.txid}`);
    }
    if (!u.scriptPubKey || !HEX_RE.test(u.scriptPubKey)) {
      throw new Error(`Invalid UTXO scriptPubKey for ${u.txid}:${u.vout}`);
    }
    // Normalize txid to lowercase — Buffer.toString("hex") returns lowercase,
    // but stored/external txids may use uppercase hex characters
    record[`${u.txid.toLowerCase()}:${u.vout}`] = {
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
   * BTC wallet provider with signing capability. May also implement the
   * intent-approval methods (`deriveContextHash`/`approveDepositTerms`); when it
   * does, `depositTerms` is required and the approval ceremony runs before
   * signing.
   */
  btcWalletProvider: {
    signPsbt: (psbtHex: string) => Promise<string>;
  } & PrePeginApprovalWallet;

  /**
   * Approved deposit terms — required when `btcWalletProvider` supports deposit
   * approval. Fresh flows pass `PreparePeginResult.depositTerms`; the resume
   * path rebuilds them from chain state via `rebuildDepositTerms`. Ignored
   * (but still txid-validated) for non-approval wallets.
   */
  depositTerms?: DepositTerms;

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
 * Sanity check: total input value must at least cover total output value,
 * and the implied fee must not exceed a reasonable upper bound.
 * This catches obvious manipulation (negative fees or inflated inputs) when
 * the mempool fallback is used. The primary defense is using expectedUtxos
 * from construction time; this check is defense-in-depth for the fallback path.
 */
function validateInputOutputBalance(
  totalInputValue: bigint,
  totalOutputValue: bigint,
): void {
  if (totalInputValue < totalOutputValue) {
    throw new Error(
      `UTXO value mismatch: total input value (${totalInputValue} sat) is less than ` +
        `total output value (${totalOutputValue} sat). ` +
        `This may indicate the mempool API returned manipulated UTXO data.`,
    );
  }

  const impliedFee = totalInputValue - totalOutputValue;
  if (impliedFee > MAX_REASONABLE_FEE_SATS) {
    throw new Error(
      `Implied transaction fee (${impliedFee} sat) exceeds maximum reasonable fee ` +
        `(${MAX_REASONABLE_FEE_SATS} sat). This may indicate manipulated UTXO data.`,
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

  // Cross-validate on both paths: trusted path provides extra assurance,
  // mempool fallback path relies on this as the primary sanity check
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

function formatError(error: unknown, includeErrorName = false): string {
  if (error instanceof Error) {
    const message = includeErrorName ? String(error) : error.message;
    return error.cause
      ? `${message}: ${formatError(error.cause, true)}`
      : message;
  }
  return String(error);
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

  assertPsbtUnsignedTxMatches({
    requestedPsbtHex: psbtHex,
    returnedPsbtHex: signedPsbtHex,
  });

  const signedPsbt = Psbt.fromHex(signedPsbtHex);

  // Finalize inputs if not already finalized
  try {
    signedPsbt.finalizeAllInputs();
  } catch (error) {
    // Some wallets finalize automatically, but only skip the error when every
    // input is already finalized.
    const allFinalized = signedPsbt.data.inputs.every(
      (input) => input.finalScriptWitness || input.finalScriptSig,
    );
    if (!allFinalized) {
      throw new Error(
        "PSBT finalization failed and wallet did not auto-finalize",
        { cause: error },
      );
    }
  }

  return signedPsbt.extractTransaction().toHex();
}

// The labels route mapDepositError; `cause` keeps typed wallet rejections
// visible to isUserCancellation's cause walk.
function stageError(label: string, error: unknown): Error {
  const message = error == null ? "Unknown error" : formatError(error);
  return new Error(`${label}: ${message}`, { cause: error });
}

/**
 * Sign and broadcast the funded Pre-PegIn transaction to the Bitcoin network
 *
 * @param params - Transaction and wallet parameters
 * @returns The broadcasted transaction ID
 * @throws Error labelled by failing stage (prepare / sign / broadcast), with
 *   the original error as `cause`
 */
export async function broadcastPrePeginTransaction(
  params: BroadcastPrePeginParams,
): Promise<string> {
  const {
    unsignedTxHex,
    btcWalletProvider,
    depositorBtcPubkey,
    expectedUtxos,
    depositTerms,
  } = params;

  // Stage 1: prepare.
  let psbt: Psbt;
  try {
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
    psbt = await createPsbtFromTransaction(tx, publicKeyNoCoord, expectedUtxos);
  } catch (error) {
    throw stageError("Failed to prepare Pre-PegIn transaction", error);
  }

  // Stage 2: sign. Includes the ceremony so device failures read as signing.
  let signedTxHex: string;
  try {
    // Intent-wallet ceremony (derive → approve) immediately before signing.
    // No-op for wallets that do not support deposit approval.
    await ensurePrePeginTermsApproval({
      wallet: btcWalletProvider,
      depositTerms,
      fundedPrePeginTxHex: unsignedTxHex,
      depositorBtcPubkey,
    });

    signedTxHex = await signAndFinalizePsbt(psbt.toHex(), btcWalletProvider);
  } catch (error) {
    // Typed rejection passes unwrapped so the UI shows intent-rejection copy.
    if (isDepositTermsRejectedError(error)) {
      throw error;
    }
    throw stageError("Failed to sign Pre-PegIn transaction", error);
  }

  // Stage 3: broadcast. Only the network POST may carry the broadcast label.
  try {
    return await pushTx(signedTxHex, getMempoolApiUrl());
  } catch (error) {
    throw stageError("Failed to broadcast Pre-PegIn transaction", error);
  }
}
