import { test as base, type BrowserContext, chromium } from "@playwright/test";

import { EXTENSION_CHROME_STORE_IDS, getExtensionPath } from "../setup/downloadExtensions";

import { setupKeplrWallet } from "./wallets/keplr";
import { setupOKXWallet } from "./wallets/okx";

type SupportedWallets = keyof typeof EXTENSION_CHROME_STORE_IDS;

type ExtensionSetup = {
  context: BrowserContext;
  setupExtensions: (extensions: SupportedWallets[]) => Promise<{
    context: BrowserContext;
  }>;
};

export const test = base.extend<ExtensionSetup>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      channel: "chromium",
      locale: "en-US",
      args: ["--lang=en-US", "--force-lang=en-US", "--accept-lang=en-US"],
      permissions: ["clipboard-read", "clipboard-write"],
    });
    await use(context);
    await context.close();
  },

  setupExtensions: async ({}, use) => {
    const setup = async (extensions: SupportedWallets[]) => {
      // Create new context with all extensions loaded
      const extensionPaths = extensions.map((ext) => getExtensionPath(EXTENSION_CHROME_STORE_IDS[ext]));
      const newContext = await chromium.launchPersistentContext("", {
        headless: false,
        channel: "chromium",
        locale: "en-US",
        args: [
          `--disable-extensions-except=${extensionPaths.join(",")}`,
          `--load-extension=${extensionPaths.join(",")}`,
          "--lang=en-US",
          "--force-lang=en-US",
          "--accept-lang=en-US",
        ],
        permissions: ["clipboard-read", "clipboard-write"],
      });

      // Open a blank page
      const blankPage = await newContext.newPage();
      await blankPage.goto("about:blank");

      // Wait 5 seconds
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Close all other pages
      for (const page of newContext.pages()) {
        if (page !== blankPage) {
          await page.close();
        }
      }

      // Setup wallets one at a time
      for (const ext of extensions) {
        try {
          if (ext === "OKX") {
            await setupOKXWallet(newContext, process.env.E2E_WALLET_MNEMONIC!, process.env.E2E_WALLET_PASSWORD!);
            console.log("OKX wallet setup completed");
          } else if (ext === "KEPLR") {
            await setupKeplrWallet(newContext, process.env.E2E_WALLET_MNEMONIC!, process.env.E2E_WALLET_PASSWORD!);
            console.log("Keplr wallet setup completed");
          }
        } catch (error) {
          console.error(`Failed to setup ${ext} wallet:`, error);
          await newContext.close();
          throw error;
        }
      }

      return { context: newContext };
    };

    await use(setup);
  },
});
