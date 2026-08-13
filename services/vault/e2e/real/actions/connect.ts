/**
 * The "connect" action: drive the vault app's real wallet-connection flow with BOTH wallets and
 * verify it.
 *
 * The connect sequence itself lives in the shared `connectWallets` helper (reused by pegin/observe);
 * this action installs the pop-up approver, runs that sequence, and then verifies success: it opens the
 * wallet menu (the avatar group) and confirms the BTC + ETH addresses each card displays (a truncated
 * "first6...last6", read straight from the DOM) match the addresses derived locally from the mnemonic.
 *
 * The Ethereum-only entry — Bitcoin is optional for the app session — is its own action
 * (`connect-eth-only`), so this one always asserts the both-wallets state.
 */
import { HEADER_SETTLE_MS, MENU_OPEN_TIMEOUT_MS } from "../timing";

import { installPopupApprover } from "./approver";
import { type Action, type ActionContext, waitSeam } from "./types";
import {
  connectWallets,
  openWalletMenu,
  verifyMenuAddress,
} from "./walletConnect";

export const connectAction: Action = {
  id: "connect",
  async run(ctx: ActionContext): Promise<void> {
    const { page, context, log } = ctx;
    const handler = installPopupApprover(context, log);
    try {
      await connectWallets(ctx);

      log("Opening wallet menu to verify addresses");
      await openWalletMenu(page, log, MENU_OPEN_TIMEOUT_MS, HEADER_SETTLE_MS);
      await verifyMenuAddress(page, "Bitcoin", ctx.btc.address, log);
      await verifyMenuAddress(page, "Ethereum", ctx.eth.address, log);

      await waitSeam(ctx, "post-connect");
      log("Connect verified ✅ (both addresses match)");
    } finally {
      context.off("page", handler);
    }
  },
};
