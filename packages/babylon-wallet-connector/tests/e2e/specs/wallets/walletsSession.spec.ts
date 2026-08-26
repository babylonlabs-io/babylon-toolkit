import { expect, test } from "@playwright/test";

import { launchWalletContext } from "../../fixtures/launch";
import { setupMetaMaskWallet } from "../../fixtures/wallets/metamask";
import { setupUnisatWallet } from "../../fixtures/wallets/unisat";
import { deriveEthAddress } from "../../setup/eth";
import { deriveSignetTaproot } from "../../setup/taproot";
import { addrMatches } from "../../utils/walletUi";

const MNEMONIC = process.env.E2E_WALLET_MNEMONIC!;
const PASSWORD = process.env.E2E_WALLET_PASSWORD!;

// One Chrome session with BOTH extensions loaded: import UniSat fully (tabs closed), then MetaMask
// fully (side panel + tabs closed). End state = both wallets imported and ready for a later
// vault-app "Connect".
test("UniSat and MetaMask import together in one Chrome session", async () => {
  const context = await launchWalletContext(["UNISAT", "METAMASK"]);
  try {
    const btcAddress = await setupUnisatWallet(context, MNEMONIC, PASSWORD);
    expect(btcAddress.toLowerCase()).toBe(deriveSignetTaproot(MNEMONIC).toLowerCase());

    const ethAddress = await setupMetaMaskWallet(context, MNEMONIC, PASSWORD);
    expect(addrMatches(ethAddress, deriveEthAddress(MNEMONIC))).toBe(true);
  } finally {
    await context.close();
  }
});
