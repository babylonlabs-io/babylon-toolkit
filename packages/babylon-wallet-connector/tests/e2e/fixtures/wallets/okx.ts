import { BrowserContext } from "@playwright/test";

import { EXTENSION_CHROME_INNER_IDS } from "../../setup/downloadExtensions";
import { fillInputsByPlaceholder } from "../../utils/fillInputs";
import { findServiceWorkerForExtension } from "../../utils/findServiceWorkerForExtension";

export async function setupOKXWallet(context: BrowserContext, mnemonic: string, password: string) {
  if (!mnemonic) throw new Error("Missing E2E_WALLET_MNEMONIC in environment variables");
  if (!password) throw new Error("Missing E2E_WALLET_PASSWORD in environment variables");

  // Setup extension page
  const okxSW = await findServiceWorkerForExtension(context, EXTENSION_CHROME_INNER_IDS.OKX);
  const okxId = okxSW.url().split("/")[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${okxId}/popup.html`);

  // Initial setup buttons
  await page.getByText("Import Wallet").click();
  await page.getByText("Seed phrase or private key").click();

  // Fill mnemonic
  const words = mnemonic.trim().split(" ");
  await page.waitForSelector(".mnemonic-words-inputs__container");
  for (let i = 0; i < words.length; i++) {
    await page.locator(".mnemonic-words-inputs__container__input").nth(i).fill(words[i]);
  }
  await page.getByTestId("okd-button").click();

  // Setup password
  await page.getByText("Password", { exact: true }).click();
  await page.getByTestId("okd-button").click();
  await fillInputsByPlaceholder(page, {
    "Enter at least 8 characters": password,
    "Re-enter new password": password,
  });
  await page.getByTestId("okd-button").click();

  // Complete initial setup
  await page.getByLabel("Set OKX Wallet as the default").uncheck();
  await page.getByTestId("okd-button").click();

  // Add sBTC
  await page.getByTestId("okd-button").click();
  await page.getByTestId("okd-input").click();
  await page.getByTestId("okd-input").fill("sBTC");

  // Set up sBTC
  await page
    .locator("div")
    .filter({ hasText: /^sBTCBTC Signet$/ })
    .first()
    .locator(".icon")
    .click();

  // Navigate back and set default address
  await page.locator(".icon").first().click();
  await page
    .locator("div")
    .filter({ hasText: /^sBTC$/ })
    .first()
    .click();
  await page.getByTestId("okd-popup").getByText("Set default address").click();
  await page.getByText("Taproot").click();

  // Finish setup
  await page.locator("i").first().click();
  await page.close();
}
