import { expect, test } from "@playwright/test";

import { launchWalletContext } from "../../fixtures/launch";
import { setupOneKeyWallet } from "../../fixtures/wallets/onekey";
import { deriveSignetTaproot } from "../../setup/taproot";
import { addrMatches } from "../../utils/walletUi";

const MNEMONIC = process.env.E2E_WALLET_MNEMONIC!;
const PASSWORD = process.env.E2E_WALLET_PASSWORD!;

test("OneKey imports the mnemonic and derives the correct signet taproot address", async () => {
  const context = await launchWalletContext(["ONEKEY"]);
  try {
    const address = await setupOneKeyWallet(context, MNEMONIC, PASSWORD);
    // Ground truth is computed from the env mnemonic — the test is mnemonic-agnostic.
    expect(addrMatches(address, deriveSignetTaproot(MNEMONIC))).toBe(true);
  } finally {
    await context.close();
  }
});
