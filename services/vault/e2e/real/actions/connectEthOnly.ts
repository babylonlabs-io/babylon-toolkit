/**
 * The "connect-eth-only" action: prove the app is usable with an Ethereum wallet alone.
 *
 * Bitcoin is optional for the application session (the vault declares `requiredChains={["ETH"]}`), so
 * this connects ONLY MetaMask — no Bitcoin extension approval at all — and then verifies the three
 * things that make the Ethereum-only entry real:
 *   1. the app reaches its connected state without a Bitcoin wallet (asserted by `connectWallets`,
 *      which waits for the navbar's Ethereum-only state rather than for a page CTA),
 *   2. the wallet menu shows the Ethereum address and NO Bitcoin card, and
 *   3. the app stays usable — its Deposit CTA is there — while the navbar keeps offering Bitcoin as
 *      an opt-in.
 *
 * Taking that offer up mid-deposit is the `btc-just-in-time` action; this one stops at the entry.
 */
import {
  HEADER_SETTLE_MS,
  MENU_OPEN_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover } from "./approver";
import {
  BITCOIN_WALLET_CARD,
  connectBtcButton,
  depositButton,
} from "./selectors";
import { type Action, type ActionContext, waitSeam } from "./types";
import {
  connectWallets,
  openWalletMenu,
  verifyMenuAddress,
} from "./walletConnect";

export const connectEthOnlyAction: Action = {
  id: "connect-eth-only",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log } = ctx;
    const handler = installPopupApprover(context, log);
    try {
      await connectWallets(ctx, { btc: false });

      log("Opening wallet menu to verify the Ethereum-only session");
      await openWalletMenu(page, log, MENU_OPEN_TIMEOUT_MS, HEADER_SETTLE_MS);
      await verifyMenuAddress(page, "Ethereum", ctx.eth.address, log);
      // The generic `WalletMenu` is handed no btcAddress, so it must render no Bitcoin card at all —
      // a blank one would show an address-less wallet the user never connected.
      const btcCard = page
        .getByText(BITCOIN_WALLET_CARD, { exact: true })
        .first();
      if (await btcCard.isVisible().catch(() => false))
        throw new Error(
          "connect-eth-only: the wallet menu shows a Bitcoin wallet card, but this run connected Ethereum only.",
        );
      await page.keyboard.press("Escape").catch(() => {});

      await depositButton(page).waitFor({
        state: "visible",
        timeout: STEP_TIMEOUT_MS,
      });
      await connectBtcButton(page).waitFor({
        state: "visible",
        timeout: STEP_TIMEOUT_MS,
      });

      await waitSeam(ctx, "post-connect");
      log(
        "Ethereum-only entry verified ✅ (Ethereum address matches, no Bitcoin card, app usable, Bitcoin still offered)",
      );
    } finally {
      context.off("page", handler);
    }
  },
};
