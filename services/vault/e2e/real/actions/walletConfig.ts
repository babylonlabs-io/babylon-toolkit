/**
 * The "wallet-config" action: capture where each wallet's auto-lock / lock-timeout setting lives, so
 * that setting can be automated in the importers (a wallet that locks mid-run — MetaMask/UniSat/OKX/
 * OneKey all auto-lock after a few minutes — stalls the peg-in at "wallet locked", see the deposit
 * progress view). It imports the chosen BTC wallet + MetaMask (done by the run orchestrator before this
 * action), re-opens each wallet's extension UI in its own tab, and drops into a snapshot loop: you
 * navigate to the lock setting and type a label + Enter; it dumps the DOM + a screenshot of whichever
 * wallet tab is frontmost, so the settings path can be encoded per wallet.
 *
 * Inherently interactive — it requires a TTY. It does not touch the dapp page.
 */
import type { Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import type { BtcWalletId, EthWalletId } from "../config";
import { EXTENSION_CHROME_STORE_IDS, runtimeExtensionId } from "../connector";

import { appendNote, captureSnapshot, snapshotName } from "./recording";
import type { Action, ActionContext } from "./types";

/** Store id + home path (the URL that opens the unlocked wallet UI) per wallet. */
const WALLET_UI: Record<
  BtcWalletId | EthWalletId,
  { storeId: string; homePath: string }
> = {
  unisat: {
    storeId: EXTENSION_CHROME_STORE_IDS.UNISAT,
    homePath: "index.html",
  },
  okx: { storeId: EXTENSION_CHROME_STORE_IDS.OKX, homePath: "home.html#/" },
  onekey: {
    storeId: EXTENSION_CHROME_STORE_IDS.ONEKEY,
    homePath: "ui-expand-tab.html",
  },
  metamask: {
    storeId: EXTENSION_CHROME_STORE_IDS.METAMASK,
    homePath: "home.html#/",
  },
};

interface WalletTab {
  id: BtcWalletId | EthWalletId;
  tab: Page;
}

/** Open a wallet's extension UI in a fresh tab. */
async function openWalletUi(
  ctx: ActionContext,
  id: BtcWalletId | EthWalletId,
): Promise<WalletTab> {
  const { storeId, homePath } = WALLET_UI[id];
  const url = `chrome-extension://${runtimeExtensionId(storeId)}/${homePath}`;
  const tab = await ctx.context.newPage();
  await tab.goto(url).catch(() => {});
  await tab.waitForLoadState("domcontentloaded").catch(() => {});
  ctx.log(`Opened ${id} wallet UI: ${url}`);
  return { id, tab };
}

export const walletConfigAction: Action = {
  id: "wallet-config",
  async run(ctx: ActionContext): Promise<void> {
    if (!process.stdin.isTTY)
      throw new Error(
        "wallet-config is interactive — run it in a terminal (you navigate the wallet settings). Do not pass --yes.",
      );

    const dir = join(ctx.artifactsDir, "wallet-config");
    mkdirSync(dir, { recursive: true });
    const tabs: WalletTab[] = [
      await openWalletUi(ctx, ctx.btc.id),
      await openWalletUi(ctx, ctx.eth.id),
    ];

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    let seq = 0;
    try {
      ctx.log(
        "Navigate to the auto-lock / lock-timeout setting in a wallet (unlock it first if needed), then " +
          "type a note + Enter. Both wallet tabs are snapshotted each time (whichever you edited is " +
          "captured either way — alt-tabbing to this terminal backgrounds the browser, so 'which tab is " +
          "frontmost' is unreliable). The note is saved verbatim to notes.md. Type 'done' to finish.",
      );
      for (;;) {
        const note = (await rl.question("\nnote (or 'done'): ")).trim();
        if (note.toLowerCase() === "done") break;
        for (const t of tabs) {
          if (t.tab.isClosed()) continue; // don't write phantom snapshots for a tab you've closed
          seq += 1;
          // Append the wallet id AFTER the slug so it survives the 40-char truncation (a long note
          // would otherwise swallow it, leaving unisat/metamask indistinguishable by filename).
          const name = `${snapshotName(seq, note)}-${t.id}`;
          await captureSnapshot(t.tab, dir, name, ctx.log);
          appendNote(dir, name, `[${t.id}] ${note}`, ctx.log);
        }
      }
    } finally {
      rl.close();
      for (const { tab } of tabs) await tab.close().catch(() => {});
    }
    ctx.log(`Wallet-config snapshots saved under ${dir}`);
  },
};
