/**
 * Public SIGN_PSBT entry point (#2219): prepare → loop → merge.
 *
 * CRITICAL PATH (CLAUDE.md §7). `prepareSignPsbt` builds the expected-signature
 * table and rejects before any device I/O; `runSignPsbtLoop` asserts every
 * YIELD against the table and set-equal completion; `mergeYields` writes
 * signature fields into the ORIGINAL v0 PSBT and never finalizes — the caller
 * finalizes. No payload bytes are ever logged anywhere in the core (module
 * contract inherited from `dmkApduSender.ts`).
 *
 * @module ledger-vault-signer/signPsbt
 */

import { LedgerSignPsbtProtocolError } from "./errors";
import type { CollectedYield } from "./expectedSignatures";
import type { RawApduSender } from "./rawApdu";
import { runSignPsbtLoop, type SignPsbtProgress } from "./signPsbtLoop";
import { mergeYields } from "./signPsbtMerge";
import { prepareSignPsbt } from "./signPsbtPrepare";

export type { CollectedYield } from "./expectedSignatures";
export type { SignPsbtProgress } from "./signPsbtLoop";

export interface SignVaultPsbtParams {
  /** v0 PSBT hex from the SDK builders. */
  readonly psbtHex: string;
  /** Cached GET_EXTENDED_PUBKEY read (64 lowercase hex) — pins the table. */
  readonly depositorXOnlyHex: string;
  /**
   * Fires after each accepted YIELD. Invocation is isolated: a throw inside
   * the callback is swallowed — progress is display-only, and a caller bug
   * must not abort a non-idempotent ceremony mid-loop.
   */
  readonly onProgress?: (progress: SignPsbtProgress) => void;
  /**
   * Host liveness control, checked before the initial send and before every
   * CONTINUE. The loop has no round cap and no internal timeout (the abort
   * signal is by design the only way to bound it) — production callers MUST
   * always pass a signal; omit it only in tests with a scripted transport.
   * The check runs between exchanges: an in-flight transport call that hangs
   * is not itself cancelled, so a bounded transport remains the caller's job.
   */
  readonly signal?: AbortSignal;
  /**
   * Provider's `loopAbandoned` flag: resend the initial SIGN_PSBT APDU once
   * if it answers 0x6A80 (the dispatcher eats exactly one non-CONTINUE APDU
   * after a host-abandoned interruption). Never set on a first attempt.
   */
  readonly resendOnceOnIncorrectData?: boolean;
}

export interface SignVaultPsbtResult {
  /**
   * The original v0 PSBT plus signature fields (`tapScriptSig`/`tapKeySig`),
   * unsigned tx byte-identical, NEVER finalized — the caller finalizes.
   */
  readonly signedPsbtHex: string;
  /** The raw collected yields — the #2221 PoP seam (detached witness packaging). */
  readonly yields: readonly CollectedYield[];
}

/**
 * Sign a vault PSBT on the device: build the expected-signature table (zero
 * device I/O on any rejection), drive the interrupt/continue loop with
 * per-YIELD assertions, check set-equal completion, then merge the yields
 * into the original PSBT. Throws the typed SIGN_PSBT errors from `errors.ts`.
 *
 * Production callers MUST pass `params.signal`: the loop is unbounded by
 * design (no round cap, no internal timeout), so the abort signal is the only
 * way to stop a device that never answers 0x9000. The signal is observed
 * between exchanges — a transport call that itself hangs is not cancelled.
 */
export async function signVaultPsbt(send: RawApduSender, params: SignVaultPsbtParams): Promise<SignVaultPsbtResult> {
  const prepared = prepareSignPsbt({ psbtHex: params.psbtHex, depositorXOnlyHex: params.depositorXOnlyHex });
  // Completion (collector.assertComplete) runs inside the loop's completing state.
  const yields = await runSignPsbtLoop(send, prepared, {
    onProgress: params.onProgress,
    signal: params.signal,
    resendOnceOnIncorrectData: params.resendOnceOnIncorrectData,
  });
  let signedPsbtHex: string;
  try {
    signedPsbtHex = mergeYields(prepared.originalPsbtHex, yields);
  } catch (error) {
    // Post-ceremony merge failures stay inside the typed contract.
    throw new LedgerSignPsbtProtocolError(
      `merge failed after signing: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  // Finding-3 hardening: detach from the collector's live backing array.
  return { signedPsbtHex, yields: [...yields] };
}
