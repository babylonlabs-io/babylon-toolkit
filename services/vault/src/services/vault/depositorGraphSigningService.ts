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
 * (each ChallengeAssert PSBT has 3 inputs signed in one go)
 *
 * @see btc-vault docs/pegin.md — "Automatic Graph Creation & Presigning"
 */

import type {
  BitcoinWallet,
  SignPsbtOptions,
} from "@babylonlabs-io/ts-sdk/shared";
import { createTaprootScriptPathSignOptions } from "@babylonlabs-io/ts-sdk/shared";
import { extractPayoutSignature } from "@babylonlabs-io/ts-sdk/tbv/core";
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import type {
  DepositorAsClaimerPresignatures,
  DepositorGraphTransactions,
  DepositorPreSigsPerChallenger,
} from "../../clients/vault-provider-rpc/types";
import { signPsbtsWithFallback, stripHexPrefix } from "../../utils/btc";
import { sanitizeErrorMessage } from "../../utils/errors/formatting";

/**
 * Number of ChallengeAssert inputs per challenger.
 * Protocol constant from btc-vault (NUM_UTXOS_FOR_CHALLENGE_ASSERT).
 */
const NUM_CHALLENGE_ASSERT_INPUTS = 3;

/** Convert a base64-encoded PSBT to hex (wallet signing format). */
function base64ToHex(b64: string): string {
  return Buffer.from(b64, "base64").toString("hex");
}

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
interface ChallengerIndexEntry {
  challengerPubkey: string;
  noPayoutIdx: number;
  challengeAssertIdx: number;
}

/** Result of the collect phase — flat PSBT array with index mapping */
interface CollectedDepositorGraphPsbts {
  psbtHexes: string[];
  signOptions: SignPsbtOptions[];
  challengerIndexMap: ChallengerIndexEntry[];
}

// ============================================================================
// PSBT verification — ensure pre-built PSBTs match advertised tx_hex
// ============================================================================

/**
 * Verify that a base64-encoded PSBT's unsigned transaction matches the
 * expected transaction hex. Catches VP serialization bugs.
 *
 * @throws if the PSBT's unsigned transaction doesn't match tx_hex
 */
function verifyPsbtMatchesTxHex(
  psbtBase64: string,
  expectedTxHex: string,
  label: string,
): void {
  const psbt = Psbt.fromBase64(psbtBase64);
  // psbt.data is a bip174 PsbtBase; getTransaction() returns the unsigned tx as a Buffer
  const unsignedTxHex = stripHexPrefix(
    psbt.data.getTransaction().toString("hex"),
  ).toLowerCase();
  const normalizedExpected = stripHexPrefix(expectedTxHex).toLowerCase();
  if (unsignedTxHex !== normalizedExpected) {
    throw new Error(
      `PSBT integrity check failed for ${label}: unsigned transaction does not match tx_hex`,
    );
  }
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
  const challengerIndexMap: ChallengerIndexEntry[] = [];

  const singleInputOpts = createTaprootScriptPathSignOptions(
    walletPublicKey,
    1,
  );
  const challengeAssertOpts = createTaprootScriptPathSignOptions(
    walletPublicKey,
    NUM_CHALLENGE_ASSERT_INPUTS,
  );

  // Index 0: Payout PSBT
  if (!depositorGraph.payout_psbt) {
    throw new Error("depositorGraph.payout_psbt is missing");
  }
  verifyPsbtMatchesTxHex(
    depositorGraph.payout_psbt,
    depositorGraph.payout_tx.tx_hex,
    "depositor payout",
  );
  psbtHexes.push(base64ToHex(depositorGraph.payout_psbt));
  signOptions.push(singleInputOpts);

  // Per-challenger: 1 NoPayout + 1 ChallengeAssert (with 3 inputs)
  for (const challenger of depositorGraph.challenger_presign_data) {
    const challengerPubkey = stripHexPrefix(challenger.challenger_pubkey);

    // NoPayout PSBT
    const noPayoutIdx = psbtHexes.length;
    if (!challenger.nopayout_psbt) {
      throw new Error(
        `Missing nopayout_psbt for challenger ${challengerPubkey}`,
      );
    }
    verifyPsbtMatchesTxHex(
      challenger.nopayout_psbt,
      challenger.nopayout_tx.tx_hex,
      `nopayout (challenger ${challengerPubkey})`,
    );
    psbtHexes.push(base64ToHex(challenger.nopayout_psbt));
    signOptions.push(singleInputOpts);

    // ChallengeAssert PSBT — 1 PSBT with NUM_CHALLENGE_ASSERT_INPUTS inputs
    const challengeAssertIdx = psbtHexes.length;
    if (!challenger.challenge_assert_psbt) {
      throw new Error(
        `Missing challenge_assert_psbt for challenger ${challengerPubkey}`,
      );
    }
    verifyPsbtMatchesTxHex(
      challenger.challenge_assert_psbt,
      challenger.challenge_assert_tx.tx_hex,
      `challenge_assert (challenger ${challengerPubkey})`,
    );
    psbtHexes.push(base64ToHex(challenger.challenge_assert_psbt));
    signOptions.push(challengeAssertOpts);

    challengerIndexMap.push({
      challengerPubkey,
      noPayoutIdx,
      challengeAssertIdx,
    });
  }

  return { psbtHexes, signOptions, challengerIndexMap };
}

// ============================================================================
// Extract phase
// ============================================================================

/**
 * Extract all signatures from signed PSBTs and assemble into presignatures.
 */
function extractDepositorGraphSignatures(
  signedPsbtHexes: string[],
  challengerIndexMap: ChallengerIndexEntry[],
  depositorPubkey: string,
): DepositorAsClaimerPresignatures {
  // Payout signature (index 0, input 0)
  const payoutSignature = extractPayoutSignature(
    signedPsbtHexes[0],
    depositorPubkey,
  );

  // Per-challenger signatures
  const perChallenger: Record<string, DepositorPreSigsPerChallenger> = {};
  for (const entry of challengerIndexMap) {
    const caSignedPsbt = signedPsbtHexes[entry.challengeAssertIdx];

    perChallenger[entry.challengerPubkey] = {
      challenge_assert_signatures: Array.from(
        { length: NUM_CHALLENGE_ASSERT_INPUTS },
        (_, i) => extractPayoutSignature(caSignedPsbt, depositorPubkey, i),
      ) as [string, string, string],
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
  const { psbtHexes, signOptions, challengerIndexMap } =
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
    challengerIndexMap,
    depositorPubkey,
  );
}
