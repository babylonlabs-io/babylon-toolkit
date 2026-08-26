/**
 * Asserts a wallet-returned PSBT encodes the same unsigned transaction
 * as the locally-built PSBT we asked the wallet to sign. Per-input PSBT
 * metadata (witnessUtxo, tapLeafScript, sighashType) is intentionally NOT
 * compared — those fields are committed to the Schnorr sighash and the
 * vault provider's `verify_depositor_signature` rejects mismatches there.
 * This primitive defends the path where a colluding VP would otherwise
 * accept a wallet-substituted signature.
 */

import { Buffer } from "buffer";

import { Psbt } from "bitcoinjs-lib";

/**
 * Thrown when a wallet-returned PSBT encodes a different unsigned
 * transaction than the one the caller asked the wallet to sign.
 */
export class PsbtSubstitutionError extends Error {
  constructor(detail: string) {
    super(
      `Wallet returned a PSBT for a different transaction: ${detail}`,
    );
    this.name = "PsbtSubstitutionError";
  }
}

export interface AssertPsbtUnsignedTxMatchesParams {
  /** PSBT we built locally and asked the wallet to sign. */
  requestedPsbtHex: string;
  /** PSBT the wallet returned after signing. */
  returnedPsbtHex: string;
}

function parsePsbt(label: "requested" | "returned", hex: string): Psbt {
  try {
    return Psbt.fromHex(hex);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Failed to parse ${label} PSBT: ${reason}`);
  }
}

/**
 * Length of the hex prefix included in mismatch errors. Short enough that
 * full prevout txids and output scriptPubKeys never reach logs / error
 * trackers, long enough to disambiguate during forensic triage.
 */
const REDACTED_HEX_PREFIX_LEN = 8;

function redactHex(buf: Buffer): string {
  return `${buf.toString("hex").slice(0, REDACTED_HEX_PREFIX_LEN)}…`;
}

/**
 * `bitcoinjs-lib` exposes `txInputs[i].hash` in internal little-endian form;
 * a human reading logs expects the big-endian txid an explorer would show.
 * Reverse before truncating so the surfaced prefix matches what an operator
 * can search for.
 */
function redactTxid(internalHash: Buffer): string {
  const reversed = Buffer.from(internalHash).reverse();
  return redactHex(reversed);
}

/**
 * Compare two PSBTs and throw `PsbtSubstitutionError` unless they encode
 * the same unsigned transaction (version, locktime, inputs, outputs).
 *
 * @throws PsbtSubstitutionError on any mismatch in the unsigned tx
 * @throws Error if either PSBT cannot be parsed
 */
export function assertPsbtUnsignedTxMatches(
  params: AssertPsbtUnsignedTxMatchesParams,
): void {
  const requested = parsePsbt("requested", params.requestedPsbtHex);
  const returned = parsePsbt("returned", params.returnedPsbtHex);

  if (requested.version !== returned.version) {
    throw new PsbtSubstitutionError(
      `tx version differs (requested=${requested.version}, returned=${returned.version})`,
    );
  }
  if (requested.locktime !== returned.locktime) {
    throw new PsbtSubstitutionError(
      `tx locktime differs (requested=${requested.locktime}, returned=${returned.locktime})`,
    );
  }
  if (requested.txInputs.length !== returned.txInputs.length) {
    throw new PsbtSubstitutionError(
      `input count differs (requested=${requested.txInputs.length}, returned=${returned.txInputs.length})`,
    );
  }
  if (requested.txOutputs.length !== returned.txOutputs.length) {
    throw new PsbtSubstitutionError(
      `output count differs (requested=${requested.txOutputs.length}, returned=${returned.txOutputs.length})`,
    );
  }
  for (let i = 0; i < requested.txInputs.length; i++) {
    const r = requested.txInputs[i];
    const s = returned.txInputs[i];
    if (!r.hash.equals(s.hash)) {
      throw new PsbtSubstitutionError(
        `input ${i} prevout txid differs (requested=${redactTxid(r.hash)}, returned=${redactTxid(s.hash)})`,
      );
    }
    if (r.index !== s.index) {
      throw new PsbtSubstitutionError(
        `input ${i} prevout vout differs (requested=${r.index}, returned=${s.index})`,
      );
    }
    if (r.sequence !== s.sequence) {
      throw new PsbtSubstitutionError(
        `input ${i} sequence differs (requested=${r.sequence}, returned=${s.sequence})`,
      );
    }
  }
  for (let i = 0; i < requested.txOutputs.length; i++) {
    const r = requested.txOutputs[i];
    const s = returned.txOutputs[i];
    if (!r.script.equals(s.script)) {
      throw new PsbtSubstitutionError(
        `output ${i} scriptPubKey differs (requested=${redactHex(r.script)}, returned=${redactHex(s.script)})`,
      );
    }
    if (r.value !== s.value) {
      throw new PsbtSubstitutionError(
        `output ${i} value differs (requested=${r.value}, returned=${s.value})`,
      );
    }
  }
}
