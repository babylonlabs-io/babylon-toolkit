/**
 * Depositor Graph Signing Service
 *
 * Signs the depositor's own graph transactions (Payout, NoPayout per challenger)
 * using pre-built PSBTs from the vault provider.
 *
 * The VP returns unsigned PSBTs with prevouts, scripts, and taproot metadata
 * already embedded (BIP 174), so any standard PSBT-compatible signer can
 * produce signatures without extra context.
 *
 * Transaction counts: 1 Payout + N NoPayout = 1 + N total PSBTs
 *
 * @see btc-vault docs/pegin.md — "Automatic Graph Creation & Presigning"
 */

import { Psbt, Transaction } from "bitcoinjs-lib";

import type { BitcoinWallet, SignPsbtOptions } from "../../../../shared/wallets/interfaces";
import type {
  DepositorAsClaimerPresignatures,
  DepositorGraphTransactions,
  DepositorPreSigsPerChallenger,
} from "../../clients/vault-provider/types";
import {
  ASSERT_NOPAYOUT_OUTPUT_INDEX,
  ASSERT_PAYOUT_OUTPUT_INDEX,
  DEPOSITOR_PAYOUT_INPUT_COUNT,
  PAYOUT_ASSERT_INPUT_INDEX,
  PEGIN_VAULT_OUTPUT_INDEX,
} from "../../primitives/psbt/constants";
import { extractPayoutSignature } from "../../primitives/psbt/payout";
import {
  inputTxidHex,
  stripHexPrefix,
  uint8ArrayToHex,
} from "../../primitives/utils/bitcoin";
import { createTaprootScriptPathSignOptions } from "../../utils/signing";

/**
 * Each payout/nopayout PSBT has exactly one input that needs signing.
 * Used to construct SignPsbtOptions for wallet.signPsbt().
 */
const SINGLE_PSBT_INPUT_COUNT = 1;

/** Tracks which indices in the flat PSBT array belong to which challenger */
interface ChallengerEntry {
  challengerPubkey: string;
  noPayoutIdx: number;
}

/** Result of the collect phase — flat PSBT array with index mapping */
interface CollectedDepositorGraphPsbts {
  psbtHexes: string[];
  signOptions: SignPsbtOptions[];
  challengerEntries: ChallengerEntry[];
}

// ============================================================================
// PSBT verification — ensure pre-built PSBTs match advertised tx_hex
// ============================================================================

/**
 * Parse a base64-encoded PSBT and verify its unsigned transaction matches
 * the expected transaction hex. Catches VP serialization bugs.
 */
function verifyAndParsePsbt(
  psbtBase64: string,
  expectedTxHex: string,
  label: string,
): Psbt {
  const psbt = Psbt.fromBase64(psbtBase64);
  const unsignedTxHex = psbt.data
    .getTransaction()
    .toString("hex")
    .toLowerCase();
  const normalizedExpected = stripHexPrefix(expectedTxHex).toLowerCase();
  if (unsignedTxHex !== normalizedExpected) {
    throw new Error(
      `PSBT integrity check failed for ${label}: unsigned transaction does not match tx_hex`,
    );
  }
  return psbt;
}

/**
 * Verify that the PSBT input at `inputIndex` spends `parentTx:expectedVout` and
 * that its embedded witnessUtxo (the prevout the wallet will sign over) matches
 * the actual parent output. This binds the depositor's signature to the real
 * parent tx instead of a VP-asserted prevout.
 */
function verifyInputAgainstParent(
  psbt: Psbt,
  childTx: Transaction,
  inputIndex: number,
  parentTx: Transaction,
  expectedVout: number,
  label: string,
): void {
  const txIn = childTx.ins[inputIndex];
  const psbtInput = psbt.data.inputs[inputIndex];
  if (!psbtInput || !txIn) {
    throw new Error(`${label}: input ${inputIndex} missing from PSBT`);
  }

  const parentTxid = parentTx.getId();
  const actualTxid = inputTxidHex(txIn);
  if (actualTxid !== parentTxid || txIn.index !== expectedVout) {
    throw new Error(
      `${label}: input ${inputIndex} must spend ${parentTxid}:${expectedVout}, ` +
        `got ${actualTxid}:${txIn.index}`,
    );
  }

  const expectedPrevout = parentTx.outs[expectedVout];
  if (!expectedPrevout) {
    throw new Error(
      `${label}: parent output ${parentTxid}:${expectedVout} not found`,
    );
  }

  const witnessUtxo = psbtInput.witnessUtxo;
  if (!witnessUtxo) {
    throw new Error(`${label}: input ${inputIndex} has no witnessUtxo`);
  }

  if (witnessUtxo.value !== expectedPrevout.value) {
    throw new Error(
      `${label}: input ${inputIndex} witnessUtxo value ${witnessUtxo.value} ` +
        `does not match parent output value ${expectedPrevout.value}`,
    );
  }

  const witnessScriptHex = uint8ArrayToHex(new Uint8Array(witnessUtxo.script));
  const expectedScriptHex = uint8ArrayToHex(
    new Uint8Array(expectedPrevout.script),
  );
  if (witnessScriptHex !== expectedScriptHex) {
    throw new Error(
      `${label}: input ${inputIndex} witnessUtxo script does not match parent output script`,
    );
  }
}

/**
 * Sanitize a parsed PSBT for Taproot script-path signing.
 *
 * VP-provided PSBTs include tapBip32Derivation and tapMerkleRoot metadata
 * that causes some wallets (notably OKX) to ignore the tweak-signer
 * directive (`useTweakedSigner` / legacy `disableTweakSigner`) and sign
 * with a tweaked key. Stripping these fields forces the wallet to rely
 * solely on tapLeafScript for script-path signing.
 */
function sanitizePsbtForScriptPathSigning(psbt: Psbt): Psbt {
  const clone = Psbt.fromHex(psbt.toHex());
  for (const input of clone.data.inputs) {
    delete input.tapBip32Derivation;
    delete input.tapMerkleRoot;
  }
  return clone;
}

interface ValidatedPsbt {
  psbt: Psbt;
  childTx: Transaction;
}

/**
 * Validate, verify integrity, and parse a PSBT plus its child transaction.
 */
function validateAndParsePsbt(
  psbtBase64: string | undefined,
  expectedTxHex: string,
  label: string,
): ValidatedPsbt {
  if (!psbtBase64) {
    throw new Error(`Missing ${label} PSBT`);
  }
  const psbt = verifyAndParsePsbt(psbtBase64, expectedTxHex, label);
  const childTx = Transaction.fromHex(stripHexPrefix(expectedTxHex));
  return { psbt, childTx };
}

// ============================================================================
// Collect phase — decode pre-built PSBTs from VP response
// ============================================================================

/**
 * Collect all pre-built PSBTs from the depositor graph and track their indices.
 * Layout: [Payout, NoPayout_0, NoPayout_1, ...]
 *
 * For every signed input the depositor will produce, the input's outpoint and
 * embedded prevout are cross-checked against an authoritative parent
 * transaction (peg-in tx for Payout, graph Assert tx for NoPayout). The peg-in
 * tx is supplied by the caller from on-chain (contract) state, so a malicious
 * VP cannot substitute it. The Assert tx still comes from the VP response, so
 * this only catches inconsistencies between the VP-supplied Assert tx and the
 * VP-supplied PSBT prevouts; rebuilding the Assert tx from authoritative
 * connector parameters would close the residual trust gap.
 */
function collectDepositorGraphPsbts(
  depositorGraph: DepositorGraphTransactions,
  peginTxHex: string,
  walletPublicKey: string,
): CollectedDepositorGraphPsbts {
  const psbtHexes: string[] = [];
  const signOptions: SignPsbtOptions[] = [];
  const challengerEntries: ChallengerEntry[] = [];

  const singleInputOpts = createTaprootScriptPathSignOptions(
    walletPublicKey,
    SINGLE_PSBT_INPUT_COUNT,
  );

  const peginTx = Transaction.fromHex(stripHexPrefix(peginTxHex));
  const graphAssertTx = Transaction.fromHex(
    stripHexPrefix(depositorGraph.assert_tx.tx_hex),
  );

  // Index 0: Payout PSBT
  // Input 0 (signed): PegIn:0  → bound to on-chain authoritative pegin tx
  // Input 1 (unsigned but in sighash): Assert:0 → bound to graph Assert tx
  const payoutLabel = "depositor payout";
  const payoutValidated = validateAndParsePsbt(
    depositorGraph.payout_psbt,
    depositorGraph.payout_tx.tx_hex,
    payoutLabel,
  );
  if (payoutValidated.childTx.ins.length !== DEPOSITOR_PAYOUT_INPUT_COUNT) {
    throw new Error(
      `${payoutLabel}: transaction must have exactly ${DEPOSITOR_PAYOUT_INPUT_COUNT} inputs, got ${payoutValidated.childTx.ins.length}`,
    );
  }
  verifyInputAgainstParent(
    payoutValidated.psbt,
    payoutValidated.childTx,
    0,
    peginTx,
    PEGIN_VAULT_OUTPUT_INDEX,
    payoutLabel,
  );
  verifyInputAgainstParent(
    payoutValidated.psbt,
    payoutValidated.childTx,
    PAYOUT_ASSERT_INPUT_INDEX,
    graphAssertTx,
    ASSERT_PAYOUT_OUTPUT_INDEX,
    payoutLabel,
  );
  const payoutHex = sanitizePsbtForScriptPathSigning(
    payoutValidated.psbt,
  ).toHex();
  psbtHexes.push(payoutHex);
  signOptions.push(singleInputOpts);

  // Per-challenger: 1 NoPayout
  // Input 0 (signed): Assert:0 → bound to graph Assert tx
  for (const challenger of depositorGraph.challenger_presign_data) {
    const challengerPubkey = stripHexPrefix(challenger.challenger_pubkey);
    const noPayoutLabel = `nopayout (challenger ${challengerPubkey})`;

    const noPayoutValidated = validateAndParsePsbt(
      challenger.nopayout_psbt,
      challenger.nopayout_tx.tx_hex,
      noPayoutLabel,
    );
    verifyInputAgainstParent(
      noPayoutValidated.psbt,
      noPayoutValidated.childTx,
      0,
      graphAssertTx,
      ASSERT_NOPAYOUT_OUTPUT_INDEX,
      noPayoutLabel,
    );
    const noPayoutHex = sanitizePsbtForScriptPathSigning(
      noPayoutValidated.psbt,
    ).toHex();

    const noPayoutIdx = psbtHexes.length;
    psbtHexes.push(noPayoutHex);
    signOptions.push(singleInputOpts);

    challengerEntries.push({
      challengerPubkey,
      noPayoutIdx,
    });
  }

  return { psbtHexes, signOptions, challengerEntries };
}

// ============================================================================
// Extract phase
// ============================================================================

/**
 * Extract all signatures from signed PSBTs and assemble into presignatures.
 */
function extractDepositorGraphSignatures(
  signedPsbtHexes: string[],
  challengerEntries: ChallengerEntry[],
  depositorPubkey: string,
): DepositorAsClaimerPresignatures {
  const payoutSignature = extractPayoutSignature(
    signedPsbtHexes[0],
    depositorPubkey,
  );

  const perChallenger: Record<string, DepositorPreSigsPerChallenger> = {};
  for (const entry of challengerEntries) {
    perChallenger[entry.challengerPubkey] = {
      nopayout_signature: extractPayoutSignature(
        signedPsbtHexes[entry.noPayoutIdx],
        depositorPubkey,
      ),
    };
  }

  return {
    payout_signatures: {
      payout_signature: payoutSignature,
    },
    per_challenger: perChallenger,
  };
}

/**
 * Sign multiple PSBTs, using batch signing when the wallet supports it.
 * Falls back to sequential `signPsbt` calls for wallets without `signPsbts`.
 */
async function signPsbtsWithFallback(
  wallet: BitcoinWallet,
  psbtHexes: string[],
  options?: SignPsbtOptions[],
): Promise<string[]> {
  if (typeof wallet.signPsbts === "function") {
    return wallet.signPsbts(psbtHexes, options);
  }

  const signed: string[] = [];
  for (let i = 0; i < psbtHexes.length; i++) {
    signed.push(await wallet.signPsbt(psbtHexes[i], options?.[i]));
  }
  return signed;
}

// ============================================================================
// Main entry point
// ============================================================================

export interface SignDepositorGraphParams {
  /** The depositor graph from VP response (contains pre-built PSBTs) */
  depositorGraph: DepositorGraphTransactions;
  /**
   * Authoritative PegIn transaction hex.
   *
   * MUST come from a trusted source (the on-chain BTCVault record), not from
   * the vault provider. Used to bind the depositor's Payout signature to the
   * real peg-in vault UTXO so a malicious VP cannot get the depositor to sign
   * over an attacker-chosen prevout.
   */
  peginTxHex: string;
  /** Depositor's BTC public key (x-only, 64-char hex, no 0x prefix) */
  depositorBtcPubkey: string;
  /** Bitcoin wallet for signing */
  btcWallet: BitcoinWallet;
}

/**
 * Sign all depositor graph transactions and assemble into presignatures.
 *
 * Flow:
 * 1. Collect pre-built PSBTs from VP response (base64 -> hex), cross-checking
 *    every signed input's outpoint and prevout against the authoritative
 *    parent transaction (peg-in tx for Payout, graph Assert tx for NoPayout)
 * 2. Batch sign via wallet.signPsbts() if available, else sequential signPsbt()
 * 3. Extract Schnorr signatures from each signed PSBT
 * 4. Assemble into DepositorAsClaimerPresignatures
 */
export async function signDepositorGraph(
  params: SignDepositorGraphParams,
): Promise<DepositorAsClaimerPresignatures> {
  const { depositorGraph, peginTxHex, depositorBtcPubkey, btcWallet } = params;

  const depositorPubkey = stripHexPrefix(depositorBtcPubkey);
  const walletPublicKey = await btcWallet.getPublicKeyHex();

  // 1. Collect pre-built PSBTs from VP response (validated against parent txs)
  const { psbtHexes, signOptions, challengerEntries } =
    collectDepositorGraphPsbts(depositorGraph, peginTxHex, walletPublicKey);

  // 2. Sign all PSBTs (batch when supported, sequential fallback for mobile)
  const signedPsbtHexes = await signPsbtsWithFallback(
    btcWallet,
    psbtHexes,
    signOptions,
  );

  if (signedPsbtHexes.length !== psbtHexes.length) {
    throw new Error(
      `Wallet returned ${signedPsbtHexes.length} signed PSBTs, expected ${psbtHexes.length}`,
    );
  }

  // 3. Extract signatures and assemble presignatures
  return extractDepositorGraphSignatures(
    signedPsbtHexes,
    challengerEntries,
    depositorPubkey,
  );
}
