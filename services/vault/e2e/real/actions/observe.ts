/**
 * The "observe" action: capture one human-driven, fully-recorded peg-in as ground truth.
 *
 * It auto-connects the wallets (approver on), then UNINSTALLS the approver and hands the browser to the
 * human, who drives the deposit + approves every wallet pop-up themselves — so the recording reflects
 * the true, unautomated flow. The recorder (Playwright trace + HTTP fixtures) runs the whole time. When
 * the human confirms the peg-in is complete, it stops the recorder and writes the artifacts.
 *
 * This is the FIRST run for the peg-in work: the `pegin` action's selectors + step timing are written
 * against this recording (and can be dev-looped against its replay) rather than discovered blind on a
 * 30 min–2 hr real run. Inherently interactive — it requires a TTY.
 */
import { createInterface } from "node:readline/promises";

import { installPopupApprover } from "./approver";
import { startRecording } from "./recording";
import type { Action, ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

export const observeAction: Action = {
  id: "observe",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir } = ctx;
    if (!process.stdin.isTTY)
      throw new Error(
        "observe is interactive — run it in a terminal (a human drives the peg-in). Do not pass --yes.",
      );

    // Auto-connect with the approver, then remove it so the human approves the peg-in pop-ups manually.
    const handler = installPopupApprover(context, log);
    try {
      await connectWallets(ctx);
    } finally {
      context.off("page", handler);
    }
    log(
      "Connected. Approver uninstalled — you now drive + approve the peg-in manually.",
    );

    // Observe exists to build the per-wallet signing fixtures, so it opts into the signing capture.
    const recorder = await startRecording(
      context,
      page,
      artifactsDir,
      log,
      () => "observe",
      { captureSigning: true },
    );
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    // Flush the trace on BOTH stop paths — Enter (clean) and Ctrl-C (abort). readline's default on
    // Ctrl-C is to emit 'pause', so without this listener a Ctrl-C would kill the process before
    // recorder.stop() runs and trace.zip would never flush (http.jsonl is written live, so it always
    // survives either way). Idempotent so the finally + the handler don't double-stop.
    let stopped = false;
    const stop = async () => {
      if (stopped) return;
      stopped = true;
      await recorder.stop();
    };
    rl.on("SIGINT", () => {
      log("Ctrl-C received — flushing the recording before exit…");
      void stop().finally(() => process.exit(130));
    });
    try {
      log(
        "RECORDING. Drive the deposit in the browser: select a vault provider, enter an amount, click " +
          "Deposit, and approve every wallet pop-up — all the way to the activated vault.",
      );
      log(
        "At EACH meaningful screen (provider list, amount entered, each signing step, activated view), " +
          "type a short label here + Enter to snapshot its DOM. Type 'done' when finished (Ctrl-C also saves).",
      );
      for (;;) {
        const answer = (await rl.question("\nlabel (or 'done'): ")).trim();
        if (answer.toLowerCase() === "done") break;
        await recorder.snapshot(answer || "screen");
      }
    } finally {
      rl.close();
      await stop();
    }
    log(`Observe recording saved under ${artifactsDir}`);
  },
};
