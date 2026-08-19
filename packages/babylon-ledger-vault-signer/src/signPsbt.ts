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

import { LedgerSignPsbtProtocolError, toCollectedYieldRefs } from "./errors";
import type { CollectedYield } from "./expectedSignatures";
import type { AppIdentity, RawApduSender } from "./rawApdu";
import { runSignPsbtLoop, type SignPsbtProgress } from "./signPsbtLoop";
import { mergeYields } from "./signPsbtMerge";
import { getPreparedSignPsbtState, prepareSignPsbt, type PreparedSignPsbt } from "./signPsbtPrepare";

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
   * CONTINUE. Required: the loop has no round cap and no internal timeout, so
   * the signal is by design the only way to bound it. The check runs between
   * exchanges — an in-flight transport call that hangs is not itself
   * cancelled, so a bounded transport remains the caller's job.
   */
  readonly signal: AbortSignal;
  /**
   * Connect-time app name/version, woven into terminal status-word
   * diagnostics. Never gates control flow.
   */
  readonly appIdentity?: AppIdentity;
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

/** The device-facing half of {@link SignVaultPsbtParams} — everything but the PSBT itself. */
export type SignPreparedVaultPsbtOptions = Omit<SignVaultPsbtParams, "psbtHex" | "depositorXOnlyHex">;

// Single-use: a prepared object's mutable collector/interpreter would replay a
// non-idempotent device ceremony with stale yields on a second run.
const consumedPrepared = new WeakSet<PreparedSignPsbt>();

/**
 * Device half of the staged API: drive the interrupt/continue loop for an
 * already-prepared PSBT, then merge. A caller that needs the expected-signature
 * table BEFORE any device I/O (e.g. the provider's keypath pre-rejection,
 * #2219 B3 plan D5/D7) prepares via `prepareSignPsbt`, inspects
 * `prepared.table`, and hands the SAME object here — no double-prepare, no
 * parse gap. Everything a prepared object signs, this signs identically to
 * {@link signVaultPsbt}.
 */
export async function signPreparedVaultPsbt(
  send: RawApduSender,
  prepared: PreparedSignPsbt,
  options: SignPreparedVaultPsbtOptions,
): Promise<SignVaultPsbtResult> {
  // Resolve first so a forged handle dies as "unrecognised", then claim —
  // synchronously BEFORE the first await, so success, abort, and concurrent
  // reuse are all rejected with zero device I/O.
  const { originalPsbtHex } = getPreparedSignPsbtState(prepared);
  if (consumedPrepared.has(prepared)) {
    throw new LedgerSignPsbtProtocolError(
      "prepared signing state was already used — call prepareSignPsbt again for a retry",
    );
  }
  consumedPrepared.add(prepared);
  // Completion (collector.assertComplete) runs inside the loop's completing state.
  const yields = await runSignPsbtLoop(send, prepared, options);
  let signedPsbtHex: string;
  try {
    signedPsbtHex = mergeYields(originalPsbtHex, yields);
  } catch (error) {
    // Post-ceremony merge failures stay inside the typed contract. The error
    // names WHICH yields arrived, never their bytes (CLAUDE.md §7).
    throw new LedgerSignPsbtProtocolError(
      `merge failed after signing: ${error instanceof Error ? error.message : String(error)}`,
      toCollectedYieldRefs(yields),
    );
  }
  // Finding-3 hardening: detach from the collector's live backing array.
  return { signedPsbtHex, yields: [...yields] };
}

/**
 * Sign a vault PSBT on the device: build the expected-signature table (zero
 * device I/O on any rejection), drive the interrupt/continue loop with
 * per-YIELD assertions, check set-equal completion, then merge the yields
 * into the original PSBT. Throws the typed SIGN_PSBT errors from `errors.ts`.
 *
 * `params.signal` is required: the loop is unbounded by design (no round cap,
 * no internal timeout), so the abort signal is the only way to stop a device
 * that never answers 0x9000. It is observed between exchanges — a transport
 * call that itself hangs is not cancelled.
 */
export async function signVaultPsbt(send: RawApduSender, params: SignVaultPsbtParams): Promise<SignVaultPsbtResult> {
  const { psbtHex, depositorXOnlyHex, ...options } = params;
  const prepared = prepareSignPsbt({ psbtHex, depositorXOnlyHex });
  return signPreparedVaultPsbt(send, prepared, options);
}
