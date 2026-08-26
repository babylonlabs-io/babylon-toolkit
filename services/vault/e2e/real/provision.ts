/**
 * Zero-setup bootstrap for the real-wallet E2E CLI.
 *
 * A fresh checkout has neither Playwright's Chromium browser installed nor the wallet extensions
 * downloaded, so a run would die inside `launchWalletContext` with an opaque browser-launch error, or
 * with `getExtensionPath`'s "Extensions directory … does not exist. Run 'npm run extensions:download'".
 * This module makes both self-provisioning so a single `pnpm --filter vault run e2e:cli` works on a
 * clean machine — no separate `playwright install` / `extensions:download` steps for engineers to run.
 *
 * Both checks are idempotent and fast when already provisioned, so they run on every invocation. The
 * extension check also picks up a newer published version (the downloader skips a version already on
 * disk) and degrades gracefully to the on-disk copy when the update check can't reach the network.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import {
  downloadExtension,
  EXTENSION_CHROME_STORE_IDS,
  EXTENSIONS,
  getExtensionPath,
  type SupportedWallet,
} from "./connector";

/** True when the given wallet extension is already downloaded + unpacked on disk. */
function hasExtension(storeId: string): boolean {
  try {
    getExtensionPath(storeId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Install Playwright's Chromium build if it isn't already present. `launchWalletContext` launches with
 * `channel: "chromium"`, which needs the browser that `playwright install chromium` provides — absent
 * it, the launch fails with a raw "Executable doesn't exist" error pointing engineers at a bare
 * `playwright install`. We probe the expected executable path (Playwright returns it whether or not the
 * binary is present) and install only when it's missing, so provisioned machines pay nothing.
 */
function ensurePlaywrightChromium(log: (m: string) => void): void {
  if (existsSync(chromium.executablePath())) return;
  log(
    "Playwright Chromium not found — installing it (one-time, a few minutes)…",
  );
  execFileSync("pnpm", ["exec", "playwright", "install", "chromium"], {
    stdio: "inherit",
  });
  log("Playwright Chromium installed.");
}

/**
 * Ensure each wallet extension this run uses is downloaded + unpacked, checking for a newer published
 * version each run (the downloader is a no-op when that exact version is already on disk). When the
 * update check can't reach the Chrome Web Store, fall back to the on-disk copy if we have one, and only
 * fail hard when the extension is genuinely missing and can't be fetched.
 */
async function ensureExtensions(
  wallets: SupportedWallet[],
  log: (m: string) => void,
): Promise<void> {
  for (const wallet of wallets) {
    const storeId = EXTENSION_CHROME_STORE_IDS[wallet];
    const config = EXTENSIONS.find((extension) => extension.id === storeId);
    if (!config)
      throw new Error(
        `No extension is configured for wallet "${wallet}" (store id ${storeId}).`,
      );
    const present = hasExtension(storeId);
    try {
      await downloadExtension(config);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (present) {
        log(
          `⚠️ Could not check the ${config.name} extension for updates (${reason}); using the copy on disk.`,
        );
      } else {
        throw new Error(
          `Failed to download the ${config.name} wallet extension (${reason}). ` +
            "Check your network connection and re-run.",
        );
      }
    }
  }
}

/**
 * Provision the two runtime prerequisites (Playwright Chromium + the wallet extensions this run needs)
 * so a clean checkout can run the CLI with one command. Call once before launching the browser context.
 */
export async function provisionRuntime(
  wallets: SupportedWallet[],
  log: (m: string) => void,
): Promise<void> {
  ensurePlaywrightChromium(log);
  await ensureExtensions(wallets, log);
}
