import { expect, test } from "@playwright/test";

import { launchWalletContext } from "../../fixtures/launch";
import { setupUnisatWallet } from "../../fixtures/wallets/unisat";
import { deriveSignetTaproot } from "../../setup/taproot";

const MNEMONIC = process.env.E2E_WALLET_MNEMONIC!;
const PASSWORD = process.env.E2E_WALLET_PASSWORD!;

test("UniSat imports the mnemonic and derives the correct signet taproot address", async () => {
  const context = await launchWalletContext(["UNISAT"]);
  try {
    const address = await setupUnisatWallet(context, MNEMONIC, PASSWORD);
    // Ground truth is computed from the env mnemonic — the test is mnemonic-agnostic.
    expect(address.toLowerCase()).toBe(deriveSignetTaproot(MNEMONIC).toLowerCase());
  } finally {
    await context.close();
  }
});
