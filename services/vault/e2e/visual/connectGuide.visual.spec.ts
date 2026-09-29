/**
 * Photographs the wallet dialog's "Before you connect" guide.
 *
 * The deposit walk picks UniSat and photographs the dialog only on its chain
 * list, so a screen behind a wallet pick had no coverage. This walk picks
 * Ledger Vault, the one wallet with a guide, and photographs the guide it
 * opens. It never presses the guide's Connect: that is where the device
 * connection starts, and the capture has no device.
 */

import { expect, test } from "../fixtures";

import {
  assertRecordingCovered,
  capture,
  ensureOutputDir,
  preparePage,
  writeCaptures,
} from "./capture";
import {
  CONNECT_GUIDE_STOP,
  flowScreenshotFileName,
  HAS_CONNECT_GUIDE,
  VISUAL_VIEWPORTS,
} from "./targets";

test.beforeAll(ensureOutputDir);

for (const viewport of VISUAL_VIEWPORTS) {
  test(`capture the Ledger Vault connect guide at ${viewport.name}`, async ({
    page,
  }) => {
    test.skip(
      !HAS_CONNECT_GUIDE,
      "The checked-out source has no connect guide.",
    );
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const backend = await preparePage(page);

    await page.goto("/vaults", { waitUntil: "domcontentloaded" });
    // The same testids `connectInjectedWallets` drives, so this walk and the
    // deposit walk cannot disagree about which controls open the dialog.
    await page.getByTestId("connect-wallet-button").first().click();
    const dialog = page.locator(".portal-root");
    await dialog.getByTestId("select-bitcoin-wallet-button").click();

    // Asserted before the click so a hidden row fails here, by name, rather
    // than as a timeout on the guide: the row needs the Ledger Vault flag
    // (`playwright.visual.config.ts`) and WebHID.
    const ledgerVault = dialog.getByTestId("wallet-option-ledger-vault");
    await expect(ledgerVault).toBeVisible();
    await ledgerVault.click();
    await expect(
      dialog.getByTestId("connect-guide-connect-button"),
    ).toBeVisible();

    const shots = [
      await capture(
        page,
        flowScreenshotFileName(CONNECT_GUIDE_STOP, viewport),
        {
          fullPage: false,
        },
      ),
    ];

    assertRecordingCovered(backend, `connect guide at ${viewport.name}`, [
      "eth-rpc",
      "graphql",
      "vp-health",
      "mempool",
    ]);
    await writeCaptures(shots);
  });
}
