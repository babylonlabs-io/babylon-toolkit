/**
 * The "btc-just-in-time" action: start a deposit from an Ethereum-only session, get prompted for a
 * Bitcoin wallet, approve it, and continue.
 *
 * This is the other half of the optional-Bitcoin story (`connect-eth-only` covers the entry): a
 * depositor who connected Ethereum alone must be able to reach the deposit form without going back to
 * the navbar. Clicking Deposit runs `RootLayout.openDeposit` → `useRequireBtcWallet`, which opens the
 * wallet dialog straight on Bitcoin instead of the form.
 *
 * The run then asserts the form did NOT open by itself once Bitcoin connected: `useRequireBtcWallet`
 * deliberately does not replay the interrupted action, so that every signature starts from a fresh,
 * explicit user gesture (services/vault/src/context/wallet/useRequireBtcWallet.ts). If product ever
 * decides the deposit SHOULD resume automatically, that assertion is the one to change — and this
 * comment is the trail back to the reason it exists.
 *
 * It stops at the opened deposit form: filling and submitting it spends real signet BTC + Sepolia ETH
 * and is the `pegin` action's job.
 */
import { STEP_TIMEOUT_MS } from "../timing";

import { installPopupApprover } from "./approver";
import {
  depositAmountInput,
  depositButton,
  walletDialogOption,
} from "./selectors";
import { type Action, type ActionContext, waitSeam } from "./types";
import { completeBtcWalletDialog, connectWallets } from "./walletConnect";

export const btcJustInTimeAction: Action = {
  id: "btc-just-in-time",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log } = ctx;
    const handler = installPopupApprover(context, log);
    try {
      await connectWallets(ctx, { btc: false });

      log("Starting a deposit from the Ethereum-only session");
      await depositButton(page).click({ timeout: STEP_TIMEOUT_MS });

      await walletDialogOption(page)
        .waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS })
        .catch(() => {
          throw new Error(
            "btc-just-in-time: clicking Deposit did not prompt for a Bitcoin wallet. An Ethereum-only session must be gated at the deposit entry point, not left to fail later at signing.",
          );
        });
      log("Prompted for a Bitcoin wallet — connecting it in place");
      await completeBtcWalletDialog(ctx);

      if (
        await depositAmountInput(page)
          .isVisible()
          .catch(() => false)
      )
        throw new Error(
          "btc-just-in-time: the deposit form opened by itself after Bitcoin connected. `useRequireBtcWallet` must not replay the interrupted action — every signature has to start from a fresh user gesture (services/vault/src/context/wallet/useRequireBtcWallet.ts).",
        );

      log("Deposit not replayed (as intended) — clicking Deposit again");
      await depositButton(page).click({ timeout: STEP_TIMEOUT_MS });
      await depositAmountInput(page).waitFor({
        state: "visible",
        timeout: STEP_TIMEOUT_MS,
      });

      await waitSeam(ctx, "post-just-in-time-connect");
      log(
        "Just-in-time Bitcoin connect verified ✅ (prompted at Deposit, connected in place, deposit form reachable on the next click)",
      );
    } finally {
      context.off("page", handler);
    }
  },
};
