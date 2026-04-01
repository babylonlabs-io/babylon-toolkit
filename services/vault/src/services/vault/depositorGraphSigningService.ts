/**
 * Depositor Graph Signing Service
 *
 * Signs the depositor's own graph transactions (Payout, NoPayout per challenger,
 * ChallengeAssert per challenger) using pre-built PSBTs from the vault provider.
 *
 * The VP returns unsigned PSBTs with prevouts, scripts, and taproot metadata
 * already embedded (BIP 174), so any standard PSBT-compatible signer can
 * produce signatures without extra context.
 *
 * Transaction counts: 1 Payout + N NoPayout + N ChallengeAssert = 1 + 2N total PSBTs
 * (each ChallengeAssert PSBT's input count is derived from the PSBT itself)
 *
 * @see btc-vault docs/pegin.md — "Automatic Graph Creation & Presigning"
 */

import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "@babylonlabs-io/ts-sdk/shared";
import {
  createTaprootScriptPathSignOptions,
  extractPayoutSignature,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { Psbt } from "bitcoinjs-lib";

import type {
  DepositorAsClaimerPresignatures,
  DepositorGraphTransactions,
  DepositorPreSigsPerChallenger,
} from "../../clients/vault-provider-rpc/types";
import { signPsbtsWithFallback, stripHexPrefix } from "../../utils/btc";
import { sanitizeErrorMessage } from "../../utils/errors/formatting";

/**
 * Parameters for signDepositorGraph
 */
export interface SignDepositorGraphParams {
  /** The depositor graph from VP response (contains pre-built PSBTs) */
  depositorGraph: DepositorGraphTransactions;
  /** Depositor's BTC public key (x-only, 64-char hex) */
  depositorBtcPubkey: string;
  /** Bitcoin wallet for signing */
  btcWallet: BitcoinWallet;
}

/** Tracks which indices in the flat PSBT array belong to which challenger */
interface ChallengerEntry {
  challengerPubkey: string;
  noPayoutIdx: number;
  challengeAssertIdx: number;
  challengeAssertInputCount: number;
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
 * @returns the parsed Psbt (for callers that need to inspect inputs)
 * @throws if the PSBT's unsigned transaction doesn't match tx_hex
 */
function verifyAndParsePsbt(
  psbtBase64: string,
  expectedTxHex: string,
  label: string,
): Psbt {
  const psbt = Psbt.fromBase64(psbtBase64);
  const unsignedTxHex = stripHexPrefix(
    psbt.data.getTransaction().toString("hex"),
  ).toLowerCase();
  const normalizedExpected = stripHexPrefix(expectedTxHex).toLowerCase();
  if (unsignedTxHex !== normalizedExpected) {
    throw new Error(
      `PSBT integrity check failed for ${label}: unsigned transaction does not match tx_hex`,
    );
  }
  return psbt;
}

/**
 * Sanitize a parsed PSBT for Taproot script-path signing.
 *
 * VP-provided PSBTs include tapBip32Derivation and tapMerkleRoot metadata
 * that causes some wallets (notably OKX) to ignore disableTweakSigner and
 * sign with a tweaked key. Stripping these fields forces the wallet to
 * rely solely on tapLeafScript for script-path signing — matching our
 * code-built PSBTs' behavior.
 *
 * Fields preserved: witnessUtxo, tapLeafScript, tapInternalKey
 * Fields stripped: tapBip32Derivation, tapMerkleRoot
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
 * Validate that a PSBT field is present, verify it against expected tx_hex,
 * sanitize taproot metadata, and convert to hex for wallet signing.
 *
 * @throws if psbtBase64 is falsy or fails integrity check
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
 * Verifies each PSBT's unsigned transaction matches the corresponding tx_hex.
 *
 * Layout: [Payout, NoPayout_0, CA_0, NoPayout_1, CA_1, ...]
 */
function collectDepositorGraphPsbts(
  depositorGraph: DepositorGraphTransactions,
  walletPublicKey: string,
): CollectedDepositorGraphPsbts {
  const psbtHexes: string[] = [];
  const signOptions: SignPsbtOptions[] = [];
  const challengerEntries: ChallengerEntry[] = [];

  const singleInputOpts = createTaprootScriptPathSignOptions(
    walletPublicKey,
    1,
  );

  // Index 0: Payout PSBT
  const payoutHex = validateAndConvertPsbt(
    depositorGraph.payout_psbt,
    depositorGraph.payout_tx.tx_hex,
    "depositor payout",
  );

  psbtHexes.push(payoutHex);
  signOptions.push(singleInputOpts);

  // Per-challenger: 1 NoPayout + 1 ChallengeAssert
  for (const challenger of depositorGraph.challenger_presign_data) {
    const challengerPubkey = stripHexPrefix(challenger.challenger_pubkey);

    // NoPayout PSBT — single input
    const noPayoutIdx = psbtHexes.length;
    const noPayoutHex = validateAndConvertPsbt(
      challenger.nopayout_psbt,
      challenger.nopayout_tx.tx_hex,
      `nopayout (challenger ${challengerPubkey})`,
    );
    psbtHexes.push(noPayoutHex);
    signOptions.push(singleInputOpts);

    // ChallengeAssert PSBT — input count derived from the PSBT itself
    const challengeAssertIdx = psbtHexes.length;
    if (!challenger.challenge_assert_psbt) {
      throw new Error(
        `Missing challenge_assert (challenger ${challengerPubkey}) PSBT`,
      );
    }
    const caPsbt = verifyAndParsePsbt(
      challenger.challenge_assert_psbt,
      challenger.challenge_assert_tx.tx_hex,
      `challenge_assert (challenger ${challengerPubkey})`,
    );
    const challengeAssertInputCount = caPsbt.data.inputs.length;
    if (challengeAssertInputCount === 0) {
      throw new Error(
        `ChallengeAssert PSBT for challenger ${challengerPubkey} has 0 inputs — expected at least 1`,
      );
    }
    const sanitizedCaPsbt = sanitizePsbtForScriptPathSigning(caPsbt);
    psbtHexes.push(sanitizedCaPsbt.toHex());
    signOptions.push(
      createTaprootScriptPathSignOptions(
        walletPublicKey,
        challengeAssertInputCount,
      ),
    );

    challengerEntries.push({
      challengerPubkey,
      noPayoutIdx,
      challengeAssertIdx,
      challengeAssertInputCount,
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
  // Payout signature (index 0, input 0)
  const payoutSignature = extractPayoutSignature(
    signedPsbtHexes[0],
    depositorPubkey,
  );

  // Per-challenger signatures
  const perChallenger: Record<string, DepositorPreSigsPerChallenger> = {};
  for (const entry of challengerEntries) {
    const caSignedPsbt = signedPsbtHexes[entry.challengeAssertIdx];

    perChallenger[entry.challengerPubkey] = {
      challenge_assert_signatures: Array.from(
        { length: entry.challengeAssertInputCount },
        (_, i) => extractPayoutSignature(caSignedPsbt, depositorPubkey, i),
      ),
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

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Sign all depositor graph transactions and assemble into presignatures.
 *
 * Flow:
 * 1. Collect pre-built PSBTs from VP response (base64 → hex)
 * 2. Batch sign via wallet.signPsbts() if available, else sequential signPsbt()
 * 3. Extract Schnorr signatures from each signed PSBT
 * 4. Assemble into DepositorAsClaimerPresignatures
 */
export async function signDepositorGraph(
  params: SignDepositorGraphParams,
): Promise<DepositorAsClaimerPresignatures> {
  const { depositorGraph, depositorBtcPubkey, btcWallet } = params;

  const depositorPubkey = stripHexPrefix(depositorBtcPubkey);

  // Get the wallet's compressed public key for signInputs identification
  const walletPublicKey = await btcWallet.getPublicKeyHex();

  // 1. Collect pre-built PSBTs from VP response
  const { psbtHexes, signOptions, challengerEntries } =
    collectDepositorGraphPsbts(depositorGraph, walletPublicKey);

  // 2. Sign all PSBTs (batch when wallet supports it, sequential fallback for mobile)
  let signedPsbtHexes: string[];

  try {
    signedPsbtHexes = await signPsbtsWithFallback(
      btcWallet,
      psbtHexes,
      signOptions,
    );
  } catch (err) {
    throw new Error(
      `Failed to sign depositor graph transactions: ${sanitizeErrorMessage(err)}`,
    );
  }

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
