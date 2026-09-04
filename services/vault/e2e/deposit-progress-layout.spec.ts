/**
 * Browser-level layout check for the split-deposit progress card.
 *
 * A two-vault deposit renders one lane per vault under the shared trunk. The
 * lanes used to be side-by-side columns, and at phone widths the group step
 * counters spilled out of the card. jsdom cannot see that: DOM order and text
 * are identical either way, so the only difference vitest can assert is a
 * class name. This spec opens the real card in Chromium at every supported
 * width and measures it instead.
 *
 * The card is reached through the dev-only god-mode panel: two batched demo
 * deposits share a Pre-PegIn, so their pending row opens the continuation
 * view with two lanes. The panel is 420px wide, so it is driven at a desktop
 * size and the viewport is narrowed only once the demo is injected.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend } from "./fixtures/replay";
import { RECORDED_DEPOSITOR } from "./fixtures/replay/contracts";
import { VISUAL_VIEWPORTS } from "./visual/targets";

import { MOCK_ENV_VARS } from "../playwright.config";

/** Sepolia, as a hex quantity - the chain the recording was made on. */
const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

/** Wide enough for the 420px god-mode panel and the wallet connect dialog. */
const PANEL_VIEWPORT = { width: 1280, height: 900 };

/**
 * Slider position of the "Awaiting payout transactions" scenario in the
 * panel's Normal segment (one position per DepositFlowStep, in enum order).
 * The first per-vault wait: both lanes open a group and render a detail
 * panel, and unlike the activation scenarios nothing auto-advances under the
 * assertions.
 */
const AWAITING_PAYOUT_SCENARIO_INDEX = 7;

/** Sub-pixel rounding is the only slack a child may have past the card. */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * A lane narrower than this share of the card is a column, not a stacked
 * lane: two side-by-side columns each take well under half the width.
 */
const MIN_LANE_WIDTH_SHARE = 0.6;

/** Lane label, from `COPY.deposit.progress.splitVaultLabel`. */
function laneLabel(vaultNumber: number): string {
  return `BTCVault ${vaultNumber}`;
}

/** The lane is the label's parent: label row, then that vault's groups. */
function lane(page: Page, vaultNumber: number): Locator {
  return page
    .getByText(laneLabel(vaultNumber), { exact: true })
    .locator("xpath=..");
}

/**
 * Inject two batched demo deposits through the god-mode panel and collapse
 * it again. Controls are addressed the way a person finds them - by label -
 * because the panel carries no testids; only the visible tab's controls are
 * targeted, since every tab stays mounted behind `hidden`.
 */
async function injectTwoVaultDemoDeposit(page: Page): Promise<void> {
  await page.getByRole("button", { name: "God mode", exact: true }).click();
  await page.getByRole("button", { name: "Deposit & Vaults" }).click();

  const visible = { visible: true };
  await page.getByLabel("Inject demo").filter(visible).check();
  await page.getByLabel("Hide real items").filter(visible).check();
  // The panel starts with one deposit mock; a second one makes the pair.
  await page.getByRole("button", { name: "+ Add mock" }).click();

  for (const position of [1, 2]) {
    await page
      .getByLabel(`Mock ${position} step`)
      .fill(String(AWAITING_PAYOUT_SCENARIO_INDEX));
  }
  const batched = page
    .getByLabel("Batched (group with other batched deposits)")
    .filter(visible);
  await expect(batched).toHaveCount(2);
  for (const checkbox of await batched.all()) {
    await checkbox.check();
  }

  await page.getByRole("button", { name: "Hide", exact: true }).click();
}

/** Open the demo pair's pending row; the wait scenario offers details only. */
async function openPendingDepositDetails(page: Page): Promise<void> {
  await page
    .getByTestId("pending-deposit-row")
    .first()
    .getByRole("button", { name: "View Details" })
    .click();
  await expect(page.getByText(laneLabel(1), { exact: true })).toBeVisible();
  await expect(page.getByText(laneLabel(2), { exact: true })).toBeVisible();
}

/** The progress card shell: the nearest clipping ancestor of the lanes. */
function progressCard(page: Page): Locator {
  return lane(page, 1).locator(
    "xpath=ancestor::div[contains(@class, 'overflow-hidden')][1]",
  );
}

for (const viewport of VISUAL_VIEWPORTS) {
  test(`stacks the vault lanes inside the progress card at ${viewport.name}`, async ({
    page,
  }) => {
    await installRecordedBackend(page);
    await injectPageWallets(page, {
      btcAddress: RECORDED_DEPOSITOR.BTC_ADDRESS,
      btcPublicKeyHex: RECORDED_DEPOSITOR.BTC_PUBLIC_KEY,
      ethAddress: RECORDED_DEPOSITOR.ETH_ADDRESS,
      ethChainIdHex: SEPOLIA_CHAIN_ID_HEX,
      ethRpcUrl: MOCK_ENV_VARS.NEXT_PUBLIC_ETH_RPC_URL,
    });
    await page.setViewportSize(PANEL_VIEWPORT);
    await page.goto("/vaults", { waitUntil: "domcontentloaded" });
    await connectInjectedWallets(page);
    await injectTwoVaultDemoDeposit(page);

    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    await openPendingDepositDetails(page);

    // Both lanes sit on the same wait, so each opens exactly one group.
    await expect(lane(page, 1).getByLabel("In progress")).toHaveCount(1);
    await expect(lane(page, 2).getByLabel("In progress")).toHaveCount(1);

    const card = progressCard(page);
    const [cardBox, firstLane, secondLane] = await Promise.all([
      card.boundingBox(),
      lane(page, 1).boundingBox(),
      lane(page, 2).boundingBox(),
    ]);
    if (!cardBox || !firstLane || !secondLane) {
      throw new Error("progress card or a vault lane has no layout box");
    }

    // Stacked: the second lane starts below the first and shares its left
    // edge; each lane spans the card rather than half of it.
    expect(secondLane.y).toBeGreaterThanOrEqual(firstLane.y + firstLane.height);
    expect(Math.abs(secondLane.x - firstLane.x)).toBeLessThan(1);
    expect(firstLane.width).toBeGreaterThan(
      cardBox.width * MIN_LANE_WIDTH_SHARE,
    );
    expect(secondLane.width).toBeGreaterThan(
      cardBox.width * MIN_LANE_WIDTH_SHARE,
    );

    // Nothing in the card reaches past its right edge, and the page itself
    // has not grown a horizontal scrollbar to hide it.
    const overflow = await card.evaluate((element) => {
      const cardRight = element.getBoundingClientRect().right;
      let widest = 0;
      for (const child of element.querySelectorAll("*")) {
        const box = child.getBoundingClientRect();
        if (box.width > 0) widest = Math.max(widest, box.right - cardRight);
      }
      const root = document.documentElement;
      return { widest, page: root.scrollWidth - root.clientWidth };
    });
    expect(overflow.widest).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
    expect(overflow.page).toBeLessThanOrEqual(0);
  });
}
