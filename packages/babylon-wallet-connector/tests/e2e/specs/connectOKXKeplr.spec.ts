import { BrowserContext, expect, Locator, Page } from "@playwright/test";

import { test } from "../fixtures/setupExtensions";

test("Connect OKX and Keplr wallets and verify addresses", async ({ setupExtensions, baseURL }) => {
  // Setup and initial navigation
  const { context } = await setupExtensions(["OKX", "KEPLR"]);
  const storybook = await context.newPage();
  await storybook.goto(
    new URL(
      "/iframe.html?id=components-walletprovider--with-connected-data&viewMode=story&args=requiredChains[0]:BTC;requiredChains[1]:BBN",
      baseURL,
    ).href,
  );

  await storybook.getByRole("button", { name: "Connect Wallet" }).click();

  // Connect Bitcoin wallet (OKX)
  await connectBitcoinWallet(storybook, context);

  // Connect Babylon wallet (Keplr)
  await connectBabylonWallet(storybook, context);

  await verifyWalletSection(storybook, "btc");
  await verifyWalletSection(storybook, "bbn");
});

async function connectBitcoinWallet(storybook: Page, context: BrowserContext) {
  await storybook.getByRole("button", { name: "Bitcoin" }).click();
  await connectWalletViaPopup(context, storybook.getByTestId("wallet-option-okx"), "Connect");
}

async function connectBabylonWallet(storybook: Page, context: BrowserContext) {
  await storybook.getByRole("button", { name: "Babylon" }).click();
  await connectWalletViaPopup(context, storybook.getByTestId("wallet-option-keplr"), "Approve");

  const walletButton = storybook.getByRole("button", { name: "Connect Wallet", exact: true });
  await expect(walletButton).toHaveAttribute("data-confirmed", "false");
  await expect(storybook.getByTestId("chains-connect-button")).toBeEnabled();
  await storybook.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(walletButton).toHaveAttribute("data-confirmed", "true");
  await expect(storybook.locator(".bbn-dialog-fullscreen")).toBeHidden();
}

async function connectWalletViaPopup(context: BrowserContext, walletButton: Locator, buttonName: string) {
  const [popup] = await Promise.all([context.waitForEvent("page"), walletButton.click()]);
  await popup.waitForLoadState("domcontentloaded");
  await popup.bringToFront();

  const button = popup.getByRole("button", { name: buttonName });
  await button.waitFor({ state: "visible" });
  await button.click();
  await popup.close();
}

async function verifyWalletSection(storybook: Page, walletType: "btc" | "bbn") {
  const section = storybook.getByTestId(`${walletType}-wallet-section`);
  await expect(section).toBeVisible();

  const addressText = await storybook.getByTestId(`${walletType}-wallet-address`).textContent();
  const pubkeyText = await storybook.getByTestId(`${walletType}-wallet-pubkey`).textContent();

  expect(addressText).toContain("Address:");
  expect(pubkeyText).toContain("Public Key:");

  const address = addressText?.split("Address: ")[1];
  const publicKey = pubkeyText?.split("Public Key: ")[1];

  if (!address || !publicKey) {
    throw new Error("Address or public key not found");
  }
}
