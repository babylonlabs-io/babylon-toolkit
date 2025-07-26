import { BrowserContext } from "@playwright/test";

import { EXTENSION_CHROME_INNER_IDS } from "../../setup/downloadExtensions";
import { fillInputsByName } from "../../utils/fillInputs";
import { findServiceWorkerForExtension } from "../../utils/findServiceWorkerForExtension";

export async function setupKeplrWallet(context: BrowserContext, mnemonic: string, password: string) {
  if (!mnemonic) throw new Error("Missing E2E_WALLET_MNEMONIC in environment variables");
  if (!password) throw new Error("Missing E2E_WALLET_PASSWORD in environment variables");

  // Setup extension page
  const keplrSW = await findServiceWorkerForExtension(context, EXTENSION_CHROME_INNER_IDS.KEPLR);
  const keplrId = keplrSW.url().split("/")[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${keplrId}/register.html`);

  // Initial setup buttons
  await page.getByRole("button", { name: "Import an existing wallet" }).click();
  await page.getByRole("button", { name: "Use recovery phrase or" }).click();
  await page.getByRole("button", { name: "12 words" }).click();

  // Fill mnemonic
  const words = mnemonic.trim().split(" ");
  for (let i = 0; i < words.length; i++) {
    await page.getByText("1.2.3.4.5.6.7.8.9.10.11.12.").locator("input").nth(i).fill(words[i]);
  }

  // Import wallet
  await page.getByRole("button", { name: "Import", exact: true }).click();

  // Fill account details
  await fillInputsByName(page, {
    name: "Keplr BBN",
    password,
    confirmPassword: password,
  });

  await page.getByRole("button", { name: "Next" }).click();

  // Deselect all networks
  await page
    .locator("div")
    .filter({ hasText: /^Select All$/ })
    .nth(2)
    .click();

  // Complete setup
  for (const buttonName of ["Save", "Finish"]) {
    await page.getByRole("button", { name: buttonName }).click();
  }
}
