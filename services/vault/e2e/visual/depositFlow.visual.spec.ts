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
  assertRecordingCovered,
  capture,
  ensureOutputDir,
  preparePage,
  type StagedShot,
  writeCaptures,
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
      btcPublicKeyHex: RECORDED_DEPOSITOR.BTC_PUBLIC_KEY,
      ethAddress: RECORDED_DEPOSITOR.ETH_ADDRESS,
      ethChainIdHex: SEPOLIA_CHAIN_ID_HEX,
      ethRpcUrl: MOCK_ENV_VARS.NEXT_PUBLIC_ETH_RPC_URL,
    });

    const shots: StagedShot[] = [];

    await page.goto("/vaults", { waitUntil: "domcontentloaded" });
    await connectInjectedWallets(page);
    shots.push(
      await capture(
        page,
        flowScreenshotFileName(DEPOSIT_FLOW_STOPS.connected, viewport),
      ),
    );

    // Same testid the real-wallet CLI drives (`e2e/real/actions/selectors.ts`),
    // so this capture and that runner cannot disagree about which control
    // opens a deposit.
    await page.getByTestId("deposit-button").first().click();

    const dialog = page.locator(".portal-root");
    const amountInput = dialog.locator("input").first();
    await amountInput.waitFor();
    shots.push(
      await capture(
        page,
        flowScreenshotFileName(DEPOSIT_FLOW_STOPS.form, viewport),
      ),
    );

    await amountInput.fill(AMOUNT_BELOW_SPLIT_MINIMUM_BTC);
    shots.push(
      await capture(
        page,
        flowScreenshotFileName(DEPOSIT_FLOW_STOPS.amountEntered, viewport),
      ),
    );

    // By testid, not by the header's label. The label IS the current choice,
    // so a text match breaks twice over: on a copy edit, and on any state
    // where a split is pre-selected and the words are no longer there at all.
    // The collapsed option row below carries the same words - core-ui's
    // AccordionDetails keeps its children mounted and hides them with
    // `visibility: hidden` - so a role query was relying on Playwright's
    // accessibility-hidden filter to tell the two apart.
    await dialog.getByTestId("split-selector-toggle").click();
    shots.push(
      await capture(
        page,
        flowScreenshotFileName(DEPOSIT_FLOW_STOPS.splitOptions, viewport),
      ),
    );

    // Deferred to the end because these two accumulate across the walk, where
    // the error-surface gates cannot and so run inside `capture()` per stop.
    // Nothing has reached disk yet, so a failure here withholds all four
    // stops - which is what makes the capture step's `continue-on-error` safe.
    //
    // All four boundaries are named because this walk genuinely needs all
    // four - the chain for borrow power and the split minimum, the indexer
    // for the vault list, the VP proxy for the provider, mempool for the
    // balance. A screen missing any of them still renders, just emptier, and
    // that is precisely the failure a screenshot cannot be trusted to show.
    assertRecordingCovered(backend, `deposit flow at ${viewport.name}`, [
      "eth-rpc",
      "graphql",
      "vp-health",
      "mempool",
    ]);
    await writeCaptures(shots);
  });
}

test.beforeAll(ensureOutputDir);
