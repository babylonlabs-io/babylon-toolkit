import { BrowserContext, expect, Locator, Page } from "@playwright/test";

import { test } from "../fixtures/setupExtensions";

for (const persistent of [false, true]) {
  test(`keeps OKX and Keplr on reopen and ${persistent ? "restores" : "clears"} them on reload`, async ({
    setupExtensions,
    baseURL,
  }) => {
    const { context } = await setupExtensions(["OKX", "KEPLR"]);
    const storybook = await context.newPage();
    await storybook.goto(
      new URL(
        `/iframe.html?id=components-walletprovider--with-connected-data&viewMode=story&args=requiredChains[0]:BTC;requiredChains[1]:BBN;persistent:${persistent}`,
        baseURL,
      ).href,
    );

    const walletButton = storybook.getByRole("button", { name: "Connect Wallet", exact: true });
    const dialog = storybook.locator(".bbn-dialog-fullscreen");
    await walletButton.click();
    await connectBitcoinWallet(storybook, context);
    await connectBabylonWallet(storybook, context);
    const btcIdentity = await verifyWalletSection(storybook, "btc");
    const bbnIdentity = await verifyWalletSection(storybook, "bbn");

    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(walletButton).toHaveAttribute("data-confirmed", "false");
    await walletButton.click();
    expect(await verifyWalletSection(storybook, "btc")).toEqual(btcIdentity);
    expect(await verifyWalletSection(storybook, "bbn")).toEqual(bbnIdentity);
    await expect(storybook.getByTestId("chains-connect-button")).toBeEnabled();
    await storybook.getByTestId("chains-connect-button").click();
    await expect(walletButton).toHaveAttribute("data-confirmed", "true");
    await expect(dialog).toBeHidden();

    if (!persistent) {
      expect(
        await storybook.evaluate(() =>
          Object.keys(JSON.parse(localStorage.getItem("baby-connected-wallet-accounts") ?? "{}")).filter(
            (key) => key !== "_timestamps",
          ),
        ),
      ).toEqual([]);
    }

    await storybook.reload();
    await expect(walletButton).toHaveAttribute("data-confirmed", String(persistent));
    if (persistent) {
      expect(await verifyWalletSection(storybook, "btc")).toEqual(btcIdentity);
      expect(await verifyWalletSection(storybook, "bbn")).toEqual(bbnIdentity);
    } else {
      await walletButton.click();
      await expect(storybook.getByRole("button", { name: "Bitcoin" })).toBeVisible();
      await expect(storybook.getByRole("button", { name: "Babylon" })).toBeVisible();
      await expect(storybook.getByTestId("chains-connect-button")).toBeDisabled();
      await expect(storybook.getByTestId("btc-wallet-section")).toBeHidden();
      await expect(storybook.getByTestId("bbn-wallet-section")).toBeHidden();
    }
  });
}

async function connectBitcoinWallet(storybook: Page, context: BrowserContext) {
  await storybook.getByRole("button", { name: "Bitcoin" }).click();
  await connectWalletViaPopup(context, storybook.getByTestId("wallet-option-okx"), "Connect");
}

async function connectBabylonWallet(storybook: Page, context: BrowserContext) {
  await storybook.getByRole("button", { name: "Babylon" }).click();
  await connectWalletViaPopup(context, storybook.getByTestId("wallet-option-keplr"), "Approve");
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
  return { address, publicKey };
}
