/**
 * The "connect" action: drive the vault app's real wallet-connection flow and verify it.
 *
 * The connect sequence itself lives in the shared `connectWallets` helper (reused by pegin/observe);
 * this action installs the pop-up approver, runs that sequence, and then verifies success: it opens the
 * wallet menu (the avatar group) and confirms the BTC + ETH addresses each card displays (a truncated
 * "first6...last6", read straight from the DOM) match the addresses derived locally from the mnemonic.
 */
import type { Page } from "@playwright/test";

import { addrMatches } from "../connector";
import {
  HEADER_SETTLE_MS,
  MENU_OPEN_TIMEOUT_MS,
  STEP_TIMEOUT_MS,
} from "../timing";

import { installPopupApprover } from "./approver";
import { type Action, type ActionContext, waitSeam } from "./types";
import { connectWallets, openWalletMenu } from "./walletConnect";

/**
 * Verify one chain's address in the open wallet menu. The card renders the address via core-ui's
 * `DisplayHash` as a truncated `first6...last6` string, which `addrMatches` compares against the full
 * expected address by prefix + suffix. We read it straight from the DOM (no clipboard) — clipboard
 * reads throw "Document is not focused" whenever a popup holds focus, and clicking copy would swap the
 * address node for a "Copied ✓" label. The label ("{walletLabel} Wallet") is stripped before matching.
 */
async function verifyMenuAddress(
  page: Page,
  walletLabel: string,
  expected: string,
  log: (m: string) => void,
): Promise<void> {
  const label = page
    .getByText(`${walletLabel} Wallet`, { exact: true })
    .first();
  await label.waitFor({ state: "visible", timeout: STEP_TIMEOUT_MS });
  // Nearest ancestor block that also holds the copy button — contains the label + the address only.
  const card = label.locator("xpath=ancestor::div[.//button][1]");
  const cardText = (await card.innerText().catch(() => ""))
    .replace(/\s+/g, " ")
    .trim();
  const displayed = cardText.replace(`${walletLabel} Wallet`, "").trim();
  const ok = addrMatches(displayed, expected);
  log(
    `${walletLabel} address: displayed="${displayed}" expected=${expected} → ${ok ? "MATCH" : "MISMATCH"}`,
  );
  if (!ok)
    throw new Error(
      `${walletLabel} address does not match expected ${expected} (shown "${displayed}")`,
    );
}

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
