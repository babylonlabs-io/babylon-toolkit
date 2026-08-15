/**
 * Photographs the deposit flow.
 *
 * Everything the route manifest cannot reach. The deposit form is a dialog
 * behind a connected wallet, opened from a button, and its split selector
 * starts collapsed - so `components/simple/` had no visual coverage at all,
 * and a change to it reported "no visual changes" the same way an untouched
 * file would.
 *
 * Like the route capture, this asserts nothing about how the screens look.
 * The judgement belongs to the diff step. What it guarantees is that each
 * stop is reached, that the app behind it is populated rather than erroring,
 * and that the same stop is photographed on both sides of the comparison.
 */

import { test } from "../fixtures";
import { connectInjectedWallets, injectPageWallets } from "../fixtures/pageWallets";
import { RECORDED_DEPOSITOR } from "../fixtures/replay/contracts";

import {
  assertAppRendered,
  capture,
  ensureOutputDir,
  preparePage,
} from "./capture";
import {
  DEPOSIT_FLOW_STOPS,
  flowScreenshotFileName,
  VISUAL_VIEWPORTS,
} from "./targets";

import { MOCK_ENV_VARS } from "../../playwright.config";

/**
 * Sepolia, as a hex quantity. Matches the chain the recording was made on and
 * the chain id the capture pins - a wallet reporting anything else puts a
 * "wrong network" banner across every screen below.
 */
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/**
 * The amount typed into the form.
 *
 * Chosen to sit in a specific window, not picked for looking realistic: below
 * the recorded wallet's ~0.0249 sBTC balance so the form accepts it, and
 * below the ~0.0384 sBTC two-vault minimum so the "increase your deposit"
 * hint renders. That hint is the reason this stop exists - it is the piece of
 * the split panel most likely to move, and it only appears in this window.
 */
const AMOUNT_BELOW_SPLIT_MINIMUM_BTC = "0.005";

for (const viewport of VISUAL_VIEWPORTS) {
  test(`capture the deposit flow at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });

    const backend = await preparePage(page);
    await injectPageWallets(page, {
      btcAddress: RECORDED_DEPOSITOR.BTC_ADDRESS,
      // Compressed form of the address's x-only key. The wallet-connector
      // adapters expect a 33-byte key; the recording holds no internal key,
      // and nothing in a capture signs, so the output key stands in for it.
      btcPublicKeyHex: `02${RECORDED_DEPOSITOR.BTC_X_ONLY_PUBLIC_KEY}`,
      ethAddress: RECORDED_DEPOSITOR.ETH_ADDRESS,
      ethChainIdHex: SEPOLIA_CHAIN_ID_HEX,
      ethRpcUrl: MOCK_ENV_VARS.NEXT_PUBLIC_ETH_RPC_URL,
    });

    await page.goto("/vaults", { waitUntil: "domcontentloaded" });
    await connectInjectedWallets(page);
    await capture(page, flowScreenshotFileName(DEPOSIT_FLOW_STOPS.connected, viewport));

    // Same testid the real-wallet CLI drives (`e2e/real/actions/selectors.ts`),
    // so this capture and that runner cannot disagree about which control
    // opens a deposit.
    await page.getByTestId("deposit-button").first().click();

    const dialog = page.locator(".portal-root");
    const amountInput = dialog.locator("input").first();
    await amountInput.waitFor();
    await capture(page, flowScreenshotFileName(DEPOSIT_FLOW_STOPS.form, viewport));

    await amountInput.fill(AMOUNT_BELOW_SPLIT_MINIMUM_BTC);
    await capture(
      page,
      flowScreenshotFileName(DEPOSIT_FLOW_STOPS.amountEntered, viewport),
    );

    // The collapsed selector's header carries the current choice as its label.
    // `.first()` is safe HERE and only here: the panel is still collapsed, so
    // the option row with the same words has not been rendered yet.
    await dialog.getByRole("button", { name: /do not split/i }).first().click();
    await capture(
      page,
      flowScreenshotFileName(DEPOSIT_FLOW_STOPS.splitOptions, viewport),
    );

    // Asserted once at the end rather than per stop: the misses accumulate
    // across the whole walk, so one check at the end covers every stop and
    // names them together.
    //
    // All four boundaries are named because this walk genuinely needs all
    // four - the chain for borrow power and the split minimum, the indexer
    // for the vault list, the VP proxy for the provider, mempool for the
    // balance. A screen missing any of them still renders, just emptier, and
    // that is precisely the failure a screenshot cannot be trusted to show.
    await assertAppRendered(page, backend, `deposit flow at ${viewport.name}`, [
      "eth-rpc",
      "graphql",
      "vp-health",
      "mempool",
    ]);
  });
}

test.beforeAll(ensureOutputDir);
