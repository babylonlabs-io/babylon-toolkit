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

import { Psbt } from "bitcoinjs-lib";

import type { BitcoinWallet, SignPsbtOptions } from "../../../../shared/wallets/interfaces";
import type {
  DepositorAsClaimerPresignatures,
  DepositorGraphTransactions,
  DepositorPreSigsPerChallenger,
} from "../../clients/vault-provider/types";
import {
  assertPayoutOutputMatchesRegistered,
  extractPayoutSignature,
} from "../../primitives/psbt/payout";
import { stripHexPrefix } from "../../primitives/utils/bitcoin";
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
 *
 * Also enforces PSBT-shape invariants required for safe Taproot script-path
 * signing of a single VP-controlled input:
 * - exactly one input
 * - input is not finalized (no finalScriptWitness / finalScriptSig)
 * - input has witnessUtxo, tapLeafScript, and tapInternalKey
 * - no partial signatures or non-Taproot signing metadata that the wallet
 *   could honor instead of the expected script path
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

  if (psbt.data.inputs.length !== SINGLE_PSBT_INPUT_COUNT) {
    throw new Error(
      `PSBT integrity check failed for ${label}: expected ${SINGLE_PSBT_INPUT_COUNT} input, got ${psbt.data.inputs.length}`,
    );
  }

  const input = psbt.data.inputs[0];
  if (input.finalScriptWitness || input.finalScriptSig) {
    throw new Error(
      `PSBT integrity check failed for ${label}: input is already finalized`,
    );
  }
  if (input.partialSig && input.partialSig.length > 0) {
    throw new Error(
      `PSBT integrity check failed for ${label}: input contains pre-existing non-Taproot signatures`,
    );
  }
  if (input.tapKeySig) {
    throw new Error(
      `PSBT integrity check failed for ${label}: input contains pre-existing tapKeySig (key-path signature)`,
    );
  }
  if (input.tapScriptSig && input.tapScriptSig.length > 0) {
    throw new Error(
      `PSBT integrity check failed for ${label}: input contains pre-existing tapScriptSig`,
    );
  }
  if (!input.witnessUtxo) {
    throw new Error(
      `PSBT integrity check failed for ${label}: input is missing witnessUtxo`,
    );
  }
  if (!input.tapInternalKey) {
    throw new Error(
      `PSBT integrity check failed for ${label}: input is missing tapInternalKey`,
    );
  }
  if (!input.tapLeafScript || input.tapLeafScript.length === 0) {
    throw new Error(
      `PSBT integrity check failed for ${label}: input is missing tapLeafScript (script-path required)`,
    );
  }

  return psbt;
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

/**
 * Validate, verify integrity, sanitize, and convert a PSBT to hex.
 */
function validateAndConvertPsbt(
  psbtBase64: string | undefined,
  expectedTxHex: string,
  label: string,
): string {
  if (!psbtBase64) {
    throw new Error(`Missing ${label} PSBT`);
  }
  const psbt = verifyAndParsePsbt(psbtBase64, expectedTxHex, label);
  const sanitized = sanitizePsbtForScriptPathSigning(psbt);
  return sanitized.toHex();
}

// ============================================================================
// Collect phase — decode pre-built PSBTs from VP response
// ============================================================================

/**
 * Collect all pre-built PSBTs from the depositor graph and track their indices.
 * Layout: [Payout, NoPayout_0, NoPayout_1, ...]
 */
function collectDepositorGraphPsbts(
  depositorGraph: DepositorGraphTransactions,
  walletPublicKey: string,
  registeredPayoutScriptPubKey: string,
): CollectedDepositorGraphPsbts {
  const psbtHexes: string[] = [];
  const signOptions: SignPsbtOptions[] = [];
  const challengerEntries: ChallengerEntry[] = [];

  // Validate the payout transaction's largest output pays to the
  // depositor's on-chain registered payout scriptPubKey before signing.
  // The VP-provided payout PSBT is otherwise unconstrained and could redirect
  // funds to an attacker-controlled script.
  assertPayoutOutputMatchesRegistered(
    depositorGraph.payout_tx.tx_hex,
    registeredPayoutScriptPubKey,
  );

  // Index 0: Payout PSBT
  const payoutHex = validateAndConvertPsbt(
    depositorGraph.payout_psbt,
    depositorGraph.payout_tx.tx_hex,
    "depositor payout",
  );
  psbtHexes.push(payoutHex);
  signOptions.push(
    createTaprootScriptPathSignOptions(walletPublicKey, SINGLE_PSBT_INPUT_COUNT),
  );

  // Per-challenger: 1 NoPayout
  for (const challenger of depositorGraph.challenger_presign_data) {
    const challengerPubkey = stripHexPrefix(challenger.challenger_pubkey);

    const noPayoutIdx = psbtHexes.length;
    const noPayoutHex = validateAndConvertPsbt(
      challenger.nopayout_psbt,
      challenger.nopayout_tx.tx_hex,
      `nopayout (challenger ${challengerPubkey})`,
    );
    psbtHexes.push(noPayoutHex);
    signOptions.push(
      createTaprootScriptPathSignOptions(walletPublicKey, SINGLE_PSBT_INPUT_COUNT),
    );

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
  /** Depositor's BTC public key (x-only, 64-char hex, no 0x prefix) */
  depositorBtcPubkey: string;
  /** Bitcoin wallet for signing */
  btcWallet: BitcoinWallet;
  /**
   * On-chain registered depositor payout scriptPubKey (hex, with or without
   * 0x prefix). Used to validate that the VP-provided depositor-graph payout
   * transaction actually pays to the depositor's registered address before
   * the wallet produces a signature.
   */
  registeredPayoutScriptPubKey: string;
}

/**
 * Sign all depositor graph transactions and assemble into presignatures.
 *
 * Flow:
 * 1. Collect pre-built PSBTs from VP response (base64 -> hex)
 * 2. Batch sign via wallet.signPsbts() if available, else sequential signPsbt()
 * 3. Extract Schnorr signatures from each signed PSBT
 * 4. Assemble into DepositorAsClaimerPresignatures
 */
export async function signDepositorGraph(
  params: SignDepositorGraphParams,
): Promise<DepositorAsClaimerPresignatures> {
  const {
    depositorGraph,
    depositorBtcPubkey,
    btcWallet,
    registeredPayoutScriptPubKey,
  } = params;

  const depositorPubkey = stripHexPrefix(depositorBtcPubkey);
  const walletPublicKey = await btcWallet.getPublicKeyHex();

  // 1. Collect pre-built PSBTs from VP response
  const { psbtHexes, signOptions, challengerEntries } =
    collectDepositorGraphPsbts(
      depositorGraph,
      walletPublicKey,
      registeredPayoutScriptPubKey,
    );

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
