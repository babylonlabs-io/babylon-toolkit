/**
 * Import phase: given the selected BTC + ETH wallets, run the connector's real-extension importers so
 * both wallets are onboarded (on signet) and their providers are ready to inject into the vault page.
 * The actual app-side "Connect" click + per-wallet approval popup live in `actions/connect.ts`.
 */
import type { BrowserContext } from "@playwright/test";

import type { BtcWalletId, EthWalletId } from "./config";
import {
  setupMetaMaskWallet,
  setupOKXWallet,
  setupOneKeyWallet,
  setupUnisatWallet,
} from "./connector";
import type { WalletSecrets } from "./secrets";

type Importer = (
  context: BrowserContext,
  mnemonic: string,
  password: string,
) => Promise<string>;

const BTC_IMPORTERS: Record<BtcWalletId, Importer> = {
  unisat: setupUnisatWallet,
  okx: setupOKXWallet,
  onekey: setupOneKeyWallet,
};

const ETH_IMPORTERS: Record<EthWalletId, Importer> = {
  metamask: setupMetaMaskWallet,
};

export interface ImportedWallets {
  btcAddress: string;
  ethAddress: string;
}

export async function importWallets(
  context: BrowserContext,
  btc: BtcWalletId,
  eth: EthWalletId,
  secrets: WalletSecrets,
  log: (m: string) => void,
): Promise<ImportedWallets> {
  log(`Importing BTC wallet: ${btc}`);
  const btcAddress = await BTC_IMPORTERS[btc](
    context,
    secrets.mnemonic,
    secrets.password,
  );
  log(`  ${btc} signet taproot: ${btcAddress}`);

  log(`Importing ETH wallet: ${eth}`);
  const ethAddress = await ETH_IMPORTERS[eth](
    context,
    secrets.mnemonic,
    secrets.password,
  );
  log(`  ${eth} address: ${ethAddress}`);

  await closeLeftoverWalletTabs(context, log);
  return { btcAddress, ethAddress };
}

/**
 * Close every wallet tab still open once both wallets are imported. `launchWalletContext` closes the
 * tabs extensions open on install after a fixed wait, but one opened later survives it: UniSat's own
 * welcome tab, whose primary control is "Create new wallet", which the pop-up approver would then walk
 * into a second wallet's creation. Each importer closes its own page and no wallet prompt is open yet,
 * so every extension page here is such a leftover.
 */
async function closeLeftoverWalletTabs(
  context: BrowserContext,
  log: (m: string) => void,
): Promise<void> {
  const leftovers = context
    .pages()
    .filter((page) => page.url().startsWith("chrome-extension://"));
  for (const page of leftovers) {
    log(`Closing leftover wallet tab ${page.url()}`);
    await page
      .close()
      .catch((error: unknown) =>
        log(
          `⚠️ Could not close leftover wallet tab ${page.url()}: ${error instanceof Error ? error.message : error}`,
        ),
      );
  }
}
