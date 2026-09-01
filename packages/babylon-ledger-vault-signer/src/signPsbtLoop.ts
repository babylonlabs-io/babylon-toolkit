/**
 * SIGN_PSBT interrupt/continue state machine over the raw APDU seam (#2219).
 *
 * States per attempt: submitting → serving* → completing → done; exits
 * failed/abandoned. Only 0xE000 continues the loop; every other status word is
 * terminal and classifies through the shared `classifyStatusWord`. No round
 * cap — the upstream client loops unbounded and the abort signal is the host's
 * liveness control, which is why the signal is a REQUIRED option rather than an
 * opt-in. No await sits inside a round other than the transport call (50-tick
 * ≈ 5 s device deadline, `base:io_ext.h:28`).
 *
 * `base:` = LedgerHQ/app-bitcoin branch `baseapp` @ `e400d8d8`:
 * `io_ext.h` and `sw.h` live under `src/boilerplate/`,
 * `constants.h` under `src/`. The pin is load-bearing — the same paths on
 * `develop` describe different behaviour.
 *
 * @module ledger-vault-signer/signPsbtLoop
 */

import { Buffer } from "buffer";

import {
  LedgerSignPsbtAbortedError,
  LedgerSignPsbtProtocolError,
  isLedgerSignPsbtProtocolError,
  isLedgerYieldMismatchError,
  toCollectedYieldRefs,
} from "./errors";
import type { CollectedYield } from "./expectedSignatures";
import { classifyStatusWord, type Apdu, type AppIdentity, type RawApduSender } from "./rawApdu";
import { buildSignPsbtApdu, getPreparedSignPsbtState, type PreparedSignPsbt } from "./signPsbtPrepare";

/** Framework CLA / CONTINUE INS (`base:constants.h:15,20`). */
const CLA_FRAMEWORK = 0xf8;
const INS_CONTINUE = 0x01;
const P1_CONTINUE = 0x00;
const P2_CONTINUE = 0x00;

const SW_OK = 0x9000;
/** A client-command request follows in the response data (`base:sw.h:90`). */
const SW_INTERRUPTED_EXECUTION = 0xe000;

export interface SignPsbtProgress {
  readonly inputIndex: number;
  /** After this yield. */
  readonly yieldedCount: number;
  readonly expectedYieldCount: number;
}

export interface RunSignPsbtLoopOptions {
  /**
   * Invocation is isolated: a throw inside the callback is swallowed —
   * progress is display-only, and a caller bug must not abort a
   * non-idempotent ceremony mid-loop.
   */
  readonly onProgress?: (progress: SignPsbtProgress) => void;
  /**
   * Required, checked before the initial send and before every CONTINUE. The
   * loop has no round cap and no internal timeout, so this is the only thing
   * that bounds it — a device that keeps answering 0xE000 would otherwise spin
   * forever. Observed between exchanges: an in-flight transport call that hangs
   * is not itself cancelled, so a bounded transport remains the caller's job.
   */
  readonly signal: AbortSignal;
  /**
   * Connect-time app name/version, woven into terminal status-word
   * diagnostics. Never gates control flow.
   */
  readonly appIdentity?: AppIdentity;
}

/**
 * Drive the device from the initial SIGN_PSBT APDU to 0x9000, serving client
 * commands from the prepared interpreter; YIELD assertions fire inside
 * `interpreter.execute` via the onYield seam. Returns the collector's yields
 * after the completion check passes.
 */
export async function runSignPsbtLoop(
  send: RawApduSender,
  prepared: PreparedSignPsbt,
  opts: RunSignPsbtLoopOptions,
): Promise<readonly CollectedYield[]> {
  const { collector, interpreter, cdata } = getPreparedSignPsbtState(prepared);
  const { table } = prepared;
  if (opts.signal.aborted) {
    // Abandoned before any I/O.
    throw new LedgerSignPsbtAbortedError(collector.yields.length);
  }

  const signPsbtApdu = buildSignPsbtApdu(cdata);
  let lastSentApdu: Apdu = signPsbtApdu;
  let response = await send(signPsbtApdu);

  let reportedYields = 0;
  while (response.sw === SW_INTERRUPTED_EXECUTION) {
    let continueData: Buffer;
    try {
      continueData = interpreter.execute(Buffer.from(response.data));
    } catch (error) {
      if (isLedgerYieldMismatchError(error)) {
        throw error;
      }
      // An unparseable YIELD is already typed but is raised inside the parser,
      // which cannot see the yields accepted so far — re-raise carrying them.
      // Re-raising the DETAIL (not the message) keeps the wrap single.
      if (isLedgerSignPsbtProtocolError(error)) {
        throw new LedgerSignPsbtProtocolError(error.detail, toCollectedYieldRefs(collector.yields));
      }
      // Anything else means the device asked for something outside the committed PSBT.
      throw new LedgerSignPsbtProtocolError(
        `client command failed: ${error instanceof Error ? error.message : String(error)}`,
        toCollectedYieldRefs(collector.yields),
      );
    }
    if (collector.yields.length > reportedYields) {
      reportedYields = collector.yields.length;
      const lastYield = collector.lastYield;
      if (lastYield !== undefined && opts.onProgress !== undefined) {
        try {
          opts.onProgress({
            inputIndex: lastYield.inputIndex,
            yieldedCount: reportedYields,
            expectedYieldCount: table.expectedYieldCount,
          });
        } catch {
          // Deliberately swallowed and unrecorded (no logging on this path):
          // a display-callback bug must not halt the ceremony.
        }
      }
    }
    if (opts.signal.aborted) {
      // Stop sending — the CONTINUE for this round is never sent. Recovery is
      // a full re-ceremony (LedgerSignPsbtAbortedError's doc has the aftermath).
      throw new LedgerSignPsbtAbortedError(collector.yields.length);
    }
    lastSentApdu = { cla: CLA_FRAMEWORK, ins: INS_CONTINUE, p1: P1_CONTINUE, p2: P2_CONTINUE, data: continueData };
    response = await send(lastSentApdu);
  }

  if (response.sw !== SW_OK) {
    const terminal = classifyStatusWord(response.sw, {
      ...opts.appIdentity,
      ins: lastSentApdu.ins,
      p1: lastSentApdu.p1,
      // Only the initial APDU's refusal proves no round ran; a lock on a
      // CONTINUE leaves caps possibly committed, so it stays unproven.
      preDispatch: lastSentApdu === signPsbtApdu,
    });
    // classifyStatusWord is undefined only for 0x9000, excluded above.
    if (terminal === undefined) {
      throw new LedgerSignPsbtProtocolError(
        `status word 0x${response.sw.toString(16)} escaped classification`,
        toCollectedYieldRefs(collector.yields),
      );
    }
    throw terminal;
  }

  collector.assertComplete();
  return collector.yields;
}
