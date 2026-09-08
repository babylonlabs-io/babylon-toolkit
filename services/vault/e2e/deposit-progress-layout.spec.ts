/** Check split-deposit lane stacking and overflow at desktop and phone widths. */

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  connectInjectedWallets,
  injectPageWallets,
} from "./fixtures/pageWallets";
import { installRecordedBackend } from "./fixtures/replay";
import { recordedPageWallets } from "./visual/capture";

const LAYOUT_VIEWPORTS = [
  { name: "narrow phone", width: 360, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];

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
async function injectTwoVaultDemoDeposit(
  page: Page,
  step: number,
): Promise<void> {
  await page.getByRole("button", { name: "God mode", exact: true }).click();
  await page.getByRole("button", { name: "Deposit & Vaults" }).click();

  const visible = { visible: true };
  await page.getByLabel("Inject demo").filter(visible).check();
  await page.getByLabel("Hide real items").filter(visible).check();
  // The panel starts with one deposit mock; a second one makes the pair.
  await page.getByRole("button", { name: "+ Add mock" }).click();

  for (const position of [1, 2]) {
    await page.getByLabel(`Mock ${position} step`).fill(String(step - 1));
    await expect(page.getByLabel(`Mock ${position} state`)).toHaveText(
      new RegExp(`^Step ${step}:`),
    );
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
}

/** The progress card shell: the nearest clipping ancestor of the lanes. */
function progressCard(anchor: Locator): Locator {
  return anchor.locator(
    "xpath=ancestor::div[contains(@class, 'overflow-hidden')][1]",
  );
}

for (const step of [6, 8]) {
  for (const viewport of LAYOUT_VIEWPORTS) {
    test(`contains step ${step} inside the progress card at ${viewport.name}`, async ({
      page,
    }) => {
      await installRecordedBackend(page);
      await injectPageWallets(page, recordedPageWallets());
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto("/vaults", { waitUntil: "domcontentloaded" });
      await connectInjectedWallets(page);
      await injectTwoVaultDemoDeposit(page, step);

      await openPendingDepositDetails(page);

      // The trunk and vault lanes appear in separate flow steps.
      const anchor =
        step === 6
          ? page.getByLabel("Step 6 active", { exact: true })
          : lane(page, 1);
      await expect(anchor).toBeVisible();
      const card = progressCard(anchor);
      if (step === 8) {
        await expect(lane(page, 1).getByLabel("In progress")).toHaveCount(1);
        await expect(lane(page, 2).getByLabel("In progress")).toHaveCount(1);
        const [cardBox, firstLane, secondLane] = await Promise.all([
          card.boundingBox(),
          lane(page, 1).boundingBox(),
          lane(page, 2).boundingBox(),
        ]);
        if (!cardBox || !firstLane || !secondLane) {
          throw new Error(
            "The progress card or a vault lane has no layout box.",
          );
        }
        expect(secondLane.y).toBeGreaterThanOrEqual(
          firstLane.y + firstLane.height,
        );
        expect(Math.abs(secondLane.x - firstLane.x)).toBeLessThan(1);
        expect(firstLane.width).toBeGreaterThan(
          cardBox.width * MIN_LANE_WIDTH_SHARE,
        );
        expect(secondLane.width).toBeGreaterThan(
          cardBox.width * MIN_LANE_WIDTH_SHARE,
        );
      }

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
}
