/**
 * Page object for the withdraw / redemption flow. Renders as a
 * `<FullScreenDialog>` triggered from the dashboard collateral row.
 *
 * The flow opens on the vault-selection step (the row's Withdraw pre-checks
 * that vault) and continues to Review.
 *
 * The two health-factor warning surfaces already have stable testids
 * in source (`withdraw-hf-block-warning`, `withdraw-hf-at-risk-warning`)
 * and are surfaced here because per-flow tests assert against them
 * directly. Everything else lands with the per-flow withdraw ticket.
 */

import type { Locator, Page } from "@playwright/test";

export class WithdrawModal {
  constructor(public readonly page: Page) {}

  get dialog(): Locator {
    return this.page.getByRole("dialog");
  }

  /** The selection step's checkbox for one vault, keyed by on-chain vaultId. */
  selectRowCheckbox(vaultId: string): Locator {
    return this.page.getByTestId(`withdraw-select-row-${vaultId}`);
  }

  get selectContinueButton(): Locator {
    return this.page.getByTestId("withdraw-select-continue");
  }

  /**
   * The at-risk acknowledgement, shown only when the projected health factor
   * lands in the at-risk band. It gates the submit while unchecked.
   */
  get selectAcknowledgeCheckbox(): Locator {
    return this.page.getByTestId("withdraw-select-acknowledge");
  }

  /**
   * Confirm the clicked row arrived pre-checked, accept the at-risk warning
   * when the screen shows one, then continue to Review.
   */
  async continueFromSelect(vaultId: string): Promise<void> {
    await this.selectRowCheckbox(vaultId).waitFor({ state: "attached" });
    if (!(await this.selectRowCheckbox(vaultId).isChecked()))
      throw new Error(
        `The withdraw selection step did not pre-check vault ${vaultId}.`,
      );
    if (await this.selectAcknowledgeCheckbox.isVisible())
      await this.selectAcknowledgeCheckbox.check();
    await this.selectContinueButton.click();
  }

  get healthFactorBlockWarning(): Locator {
    return this.page.getByTestId("withdraw-hf-block-warning");
  }

  get healthFactorAtRiskWarning(): Locator {
    return this.page.getByTestId("withdraw-hf-at-risk-warning");
  }
}
