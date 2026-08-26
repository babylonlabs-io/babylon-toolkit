import { expect, test } from "@playwright/test";

import { launchWalletContext } from "../../fixtures/launch";
import { setupMetaMaskWallet } from "../../fixtures/wallets/metamask";
import { deriveEthAddress } from "../../setup/eth";
import { addrMatches } from "../../utils/walletUi";

const MNEMONIC = process.env.E2E_WALLET_MNEMONIC!;
const PASSWORD = process.env.E2E_WALLET_PASSWORD!;

test("MetaMask imports the mnemonic and derives the correct Ethereum address", async () => {
  const context = await launchWalletContext(["METAMASK"]);
  try {
    const address = await setupMetaMaskWallet(context, MNEMONIC, PASSWORD);
    // MetaMask only surfaces a truncated pill; assert prefix+suffix against the computed address.
    expect(addrMatches(address, deriveEthAddress(MNEMONIC))).toBe(true);
  } finally {
    await context.close();
  }
});
