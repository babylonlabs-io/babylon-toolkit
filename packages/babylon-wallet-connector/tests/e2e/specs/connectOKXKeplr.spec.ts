import { BrowserContext, expect, FrameLocator, Page } from "@playwright/test";

import { test } from "../fixtures/setupExtensions";

test("Connect OKX and Keplr wallets and verify addresses", async ({ setupExtensions }) => {
  // Setup and initial navigation
  const { context } = await setupExtensions(["OKX", "KEPLR"]);
  const page = await context.newPage();
  const storybook = page.locator('iframe[title="storybook-preview-iframe"]').contentFrame();
  await page.goto("/?path=/docs/components-chainbutton--docs");

  // Accept terms and conditions
  await setupStorybookEnvironment(page, storybook);

  // Connect Bitcoin wallet (OKX)
  await connectBitcoinWallet(storybook, context);

  // Connect Babylon wallet (Keplr)
  await connectBabylonWallet(storybook, context);

  // Verify wallet connections
  const btcWalletInfo = await verifyWalletSection(storybook, "btc");
  const bbnWalletInfo = await verifyWalletSection(storybook, "bbn");

  // Log wallet information
  console.log("BTC Wallet:", btcWalletInfo);
  console.log("BBN Wallet:", bbnWalletInfo);
});

async function setupStorybookEnvironment(page: Page, storybook: FrameLocator) {
  await page.getByRole("button", { name: "WalletProvider" }).click();
  await page.getByRole("link", { name: "With Connected Data" }).click();
  await page.getByRole("button", { name: "Hide addons [⌥ A]" }).click();
  await storybook.getByRole("button", { name: "Connect Wallet" }).click();

  // Accept terms
  const terms = ["I certify that I have read", "I certify that I wish to", "I acknowledge that the following are"];
  for (const term of terms) {
    await storybook.getByText(term).click();
  }
  await storybook.getByRole("button", { name: "Next" }).click();
}

async function connectBitcoinWallet(storybook: FrameLocator, context: BrowserContext) {
  await storybook.getByRole("button", { name: "Bitcoin" }).click();
  await storybook.getByRole("button", { name: "OKX" }).click();

  await connectWalletViaPopup(context, "Connect");

  await storybook.getByText("Use", { exact: true }).click();
  await storybook.getByRole("button", { name: "Save" }).click();
}

async function connectBabylonWallet(storybook: FrameLocator, context: BrowserContext) {
  await storybook.getByRole("button", { name: "Babylon" }).click();
  await storybook.getByRole("button", { name: "Keplr" }).click();

  await connectWalletViaPopup(context, "Approve");

  await storybook.getByRole("button", { name: "Done" }).click();
}

async function connectWalletViaPopup(context: BrowserContext, buttonName: string) {
  const [popup] = await Promise.all([context.waitForEvent("page")]);
  await popup.waitForLoadState("domcontentloaded");
  await popup.bringToFront();

  const button = popup.getByRole("button", { name: buttonName });
  await button.waitFor({ state: "visible" });
  await button.click();
  await popup.close();
}

async function verifyWalletSection(storybook: FrameLocator, walletType: "btc" | "bbn") {
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

  return {
    address: addressText.split("Address: ")[1],
    publicKey: pubkeyText.split("Public Key: ")[1],
  };
}
