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
import { createTaprootScriptPathSignOptions } from "@babylonlabs-io/ts-sdk/shared";
import { Psbt } from "bitcoinjs-lib";
import { Buffer } from "buffer";

import type {
  DepositorAsClaimerPresignatures,
  DepositorGraphTransactions,
  DepositorPreSigsPerChallenger,
} from "../../clients/vault-provider-rpc/types";
import { signPsbtsWithFallback, stripHexPrefix } from "../../utils/btc";
import { sanitizeErrorMessage } from "../../utils/errors/formatting";

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
 * Validate that a PSBT field is present, verify it against expected tx_hex,
 * and convert to hex for wallet signing.
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
  verifyAndParsePsbt(psbtBase64, expectedTxHex, label);
  return base64ToHex(psbtBase64);
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
    psbtHexes.push(base64ToHex(challenger.challenge_assert_psbt));
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
// Extract phase — pubkey-agnostic signature extraction for VP-built PSBTs
// ============================================================================

/** SIGHASH_ALL byte value for Schnorr signatures (BIP 341). */
const SIGHASH_ALL = 0x01;

/**
 * Validate and return a 64-byte Schnorr signature hex, stripping the sighash
 * byte from 65-byte signatures when it is SIGHASH_ALL.
 *
 * @throws if the signature length is invalid or sighash type is unexpected
 */
function extractSchnorrSig(sig: Buffer, inputIndex: number): string {
  if (sig.length === 64) {
    return Buffer.from(sig).toString("hex");
  }

  if (sig.length === 65) {
    if (sig[64] !== SIGHASH_ALL) {
      throw new Error(
        `Unexpected sighash type 0x${sig[64].toString(16).padStart(2, "0")} at input ${inputIndex}. Expected SIGHASH_ALL (0x01).`,
      );
    }
    return Buffer.from(sig.subarray(0, 64)).toString("hex");
  }

  throw new Error(
    `Unexpected signature length at input ${inputIndex}: ${sig.length}`,
  );
}

/**
 * Parse a BIP-141 serialized witness stack into individual stack items.
 * Format: [varint item_count] [varint len, data]...
 */
function parseWitnessStack(witness: Buffer): Buffer[] {
  const items: Buffer[] = [];
  let offset = 0;

  const readVarInt = (): number => {
    const first = witness[offset++];
    if (first < 0xfd) return first;
    if (first === 0xfd) {
      const val = witness[offset] | (witness[offset + 1] << 8);
      offset += 2;
      return val;
    }
    if (first === 0xfe) {
      const val =
        witness[offset] |
        (witness[offset + 1] << 8) |
        (witness[offset + 2] << 16) |
        (witness[offset + 3] << 24);
      offset += 4;
      return val;
    }
    // 0xff — 8-byte, won't happen for witness data
    offset += 8;
    return 0;
  };

  const count = readVarInt();
  for (let i = 0; i < count; i++) {
    const len = readVarInt();
    items.push(witness.subarray(offset, offset + len) as Buffer);
    offset += len;
  }

  return items;
}

/**
 * Extract a 64-byte Schnorr signature from a single PSBT input.
 *
 * VP-built PSBTs have exactly one signer per input, so after signing there is
 * exactly one tapScriptSig entry. We extract it without filtering by pubkey
 * because some wallets (e.g. OKX) sign with a different key than the
 * depositor's registered taproot pubkey.
 *
 * Some wallets ignore `autoFinalized: false` and return finalized PSBTs with
 * signatures only in `finalScriptWitness`. We fall back to parsing the witness
 * stack in that case: taproot script-path witness is [signature, script, controlBlock].
 *
 * @throws if the input has no tapScriptSig/finalScriptWitness or the signature is invalid
 */
function extractSignatureFromInput(
  input: {
    tapScriptSig?: { signature: Buffer }[];
    finalScriptWitness?: Buffer;
  },
  inputIndex: number,
): string {
  // Case 1: Non-finalized PSBT — extract from tapScriptSig
  if (input.tapScriptSig && input.tapScriptSig.length > 0) {
    return extractSchnorrSig(input.tapScriptSig[0].signature, inputIndex);
  }

  // Case 2: Finalized PSBT — extract from finalScriptWitness
  // Taproot script-path witness: [signature, script, controlBlock]
  if (input.finalScriptWitness && input.finalScriptWitness.length > 0) {
    const witnessStack = parseWitnessStack(input.finalScriptWitness);
    if (witnessStack.length >= 1) {
      return extractSchnorrSig(witnessStack[0], inputIndex);
    }
  }

  throw new Error(
    `No tapScriptSig or finalScriptWitness found in signed PSBT at input ${inputIndex}`,
  );
}

/**
 * Parse a signed PSBT hex and extract the Schnorr signature from a single input.
 * For single-input PSBTs (Payout, NoPayout).
 */
function extractSignatureFromSignedInput(
  signedPsbtHex: string,
  inputIndex: number,
): string {
  const psbt = Psbt.fromHex(signedPsbtHex);

  if (inputIndex >= psbt.data.inputs.length) {
    throw new Error(
      `Input index ${inputIndex} out of range (${psbt.data.inputs.length} inputs)`,
    );
  }

  return extractSignatureFromInput(psbt.data.inputs[inputIndex], inputIndex);
}

/**
 * Parse a signed PSBT hex once and extract Schnorr signatures from all inputs.
 * Avoids re-parsing the same hex for multi-input PSBTs (ChallengeAssert).
 */
function extractAllSignaturesFromSignedPsbt(
  signedPsbtHex: string,
  inputCount: number,
): string[] {
  const psbt = Psbt.fromHex(signedPsbtHex);

  if (psbt.data.inputs.length < inputCount) {
    throw new Error(
      `Expected ${inputCount} inputs but PSBT has ${psbt.data.inputs.length}`,
    );
  }

  return Array.from({ length: inputCount }, (_, i) =>
    extractSignatureFromInput(psbt.data.inputs[i], i),
  );
}

/**
 * Extract all signatures from signed PSBTs and assemble into presignatures.
 */
function extractDepositorGraphSignatures(
  signedPsbtHexes: string[],
  challengerEntries: ChallengerEntry[],
): DepositorAsClaimerPresignatures {
  // Payout signature (index 0, input 0)
  const payoutSignature = extractSignatureFromSignedInput(
    signedPsbtHexes[0],
    0,
  );

  // Per-challenger signatures
  const perChallenger: Record<string, DepositorPreSigsPerChallenger> = {};
  for (const entry of challengerEntries) {
    perChallenger[entry.challengerPubkey] = {
      challenge_assert_signatures: extractAllSignaturesFromSignedPsbt(
        signedPsbtHexes[entry.challengeAssertIdx],
        entry.challengeAssertInputCount,
      ),
      nopayout_signature: extractSignatureFromSignedInput(
        signedPsbtHexes[entry.noPayoutIdx],
        0,
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
  const { depositorGraph, btcWallet } = params;

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
  return extractDepositorGraphSignatures(signedPsbtHexes, challengerEntries);
}
