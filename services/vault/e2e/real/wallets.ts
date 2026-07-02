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

  return { btcAddress, ethAddress };
}
