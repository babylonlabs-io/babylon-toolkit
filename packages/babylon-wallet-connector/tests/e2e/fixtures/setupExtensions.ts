import { test as base, type BrowserContext } from "@playwright/test";
import { english, generateMnemonic, generatePrivateKey } from "viem/accounts";

import { launchWalletContext, type SupportedWallet } from "./launch";
import { setupKeplrWallet } from "./wallets/keplr";
import { setupOKXWallet } from "./wallets/okx";

type ExtensionSetup = {
  setupExtensions: (extensions: SupportedWallet[]) => Promise<{
    context: BrowserContext;
  }>;
};

export const test = base.extend<ExtensionSetup>({
  setupExtensions: async ({}, use) => {
    const contexts: BrowserContext[] = [];
    try {
      await use(async (extensions) => {
        const context = await launchWalletContext(extensions);
        contexts.push(context);
        const mnemonic = generateMnemonic(english);
        const password = generatePrivateKey().slice(2, 34);
        for (const ext of extensions) {
          try {
            if (ext === "OKX") {
              await setupOKXWallet(context, mnemonic, password);
            } else if (ext === "KEPLR") {
              await setupKeplrWallet(context, mnemonic, password);
            }
          } catch (error) {
            const reason = [mnemonic, password].reduce(
              (message, secret) => message.replaceAll(secret, "[redacted]"),
              error instanceof Error ? error.message : "Unknown setup error",
            );
            throw new Error(`${ext} wallet setup failed: ${reason}`);
          }
        }
        return { context };
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  },
});
