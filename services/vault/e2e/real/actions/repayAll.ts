/**
 * The "repay-all" action: clear every outstanding loan on every hub, end-to-end on real Sepolia.
 *
 * For each debt the position holds (any token, any hub) it runs the repay flow pinned to that reserve
 * with the form's Max, then checks on-chain that the reserve's debt fell. While several debts remain the
 * Repay button opens the picker (rows chosen by reserve id); the last one routes straight to its form.
 * A debt the wallet can't fully cover is repaid with the whole balance (what the form's Max does) and a
 * debt with a zero balance is skipped; either is reported at the end, and a remaining debt fails the run.
 *
 * NEVER run without an explicit go-ahead: it moves real value (one repay, plus any approval, per debt).
 */
import { describeReserve } from "../borrowParams";
import { fetchRepayableDebts } from "../repayParams";

import { installPopupApprover } from "./approver";
import { startRecording } from "./recording";
import { runRepayFlow } from "./repay";
import { legContext, readReserveDebt, waitForReserveDebt } from "./reserveLegs";
import { MAX_AMOUNT_KEYWORD } from "./selectors";
import { type Action, type ActionContext } from "./types";
import { connectWallets } from "./walletConnect";

export const repayAllAction: Action = {
  id: "repay-all",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log, artifactsDir } = ctx;
    const { network } = ctx.config;

    const handler = installPopupApprover(context, log);
    let currentStep = "connect";
    const recorder = await startRecording(
      context,
      page,
      artifactsDir,
      log,
      () => currentStep,
    );
    try {
      await connectWallets(ctx);

      const debts = await fetchRepayableDebts(network, ctx.eth.address);
      if (debts.length === 0) {
        log("Repay all: no outstanding debt on any hub — nothing to repay.");
        return;
      }
      log(
        `Repay all: ${debts.map((d) => `${describeReserve(d)} — ${d.debtTokens} owed`).join("; ")}`,
      );

      for (const debt of debts) {
        if (debt.balanceTokens <= 0) {
          log(
            `⚠️ Skipping ${describeReserve(debt)}: the wallet holds no ${debt.symbol} to repay it with.`,
          );
          continue;
        }
        if (debt.balanceTokens < debt.debtTokens)
          log(
            `⚠️ ${describeReserve(debt)}: the wallet holds ${debt.balanceTokens} ${debt.symbol}, less than the ${debt.debtTokens} owed — Max repays the balance and leaves the rest.`,
          );

        const before = await readReserveDebt(ctx, debt.reserveId);
        log(`── Repay leg: ${describeReserve(debt)}`);
        await runRepayFlow(
          legContext(ctx, {
            repayReserveId: debt.reserveId.toString(),
            repayToken: debt.symbol,
            repayHub: undefined,
            repayAmount: MAX_AMOUNT_KEYWORD,
            borrowFirst: false,
          }),
          (step) => {
            currentStep = `repay:${debt.reserveId}:${step}`;
          },
        );
        currentStep = `repay:${debt.reserveId}:reserve-debt`;
        await waitForReserveDebt(ctx, debt, before, "fall");
      }

      currentStep = "remaining-debt";
      const remaining = await fetchRepayableDebts(network, ctx.eth.address);
      if (remaining.length > 0)
        throw new Error(
          `repay-all: debt remains — ${remaining.map((d) => `${describeReserve(d)}: ${d.debtTokens} owed, wallet holds ${d.balanceTokens}`).join("; ")}.`,
        );
      log("✅ Repay all complete — no outstanding debt on any hub.");
    } finally {
      await recorder.stop();
      context.off("page", handler);
    }
  },
};
