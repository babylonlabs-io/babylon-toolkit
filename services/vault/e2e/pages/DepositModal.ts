/**
 * Page object for the deposit flow. The flow renders as a
 * `<FullScreenDialog>` from core-ui and walks through:
 *
 *   1. DepositForm   - amount + vault provider selection
 *   2. SignContent   - PSBT signing with the connected BTC wallet
 *   3. ProgressView  - broadcast + activation polling
 *
 * Per the per-flow tickets (#1592, #1593, #1594) each phase will
 * acquire dedicated assertion helpers; this object exposes the minimum
 * locators a happy-path test needs to drive each step.
 */

import type { Locator, Page } from "@playwright/test";

export class DepositModal {
  constructor(public readonly page: Page) {}

  get dialog(): Locator {
    // FullScreenDialog renders the Radix dialog primitive with
    // role="dialog" + aria-modal. Scoping all subsequent locators to
    // the dialog avoids accidental matches against shell-level CTAs
    // of the same name.
    return this.page.getByRole("dialog");
  }

  get amountInput(): Locator {
    // AmountSlider renders a numeric `<input>`; spinbutton covers both
    // the input and stepper UI.
    return this.dialog.getByRole("spinbutton").first();
  }

  get maxButton(): Locator {
    return this.dialog.getByRole("button", { name: /^Max$/i });
  }

  get vaultProviderSelect(): Locator {
    // Falls back to the placeholder text when the combobox role isn't
    // exposed by the underlying core-ui Select.
    return this.dialog
      .getByRole("combobox")
      .or(this.dialog.getByPlaceholder(/Select Vault Provider/i));
  }

  get submitButton(): Locator {
    return this.dialog.getByRole("button", { name: /^(Deposit|Next)$/i });
  }

  get signButton(): Locator {
    return this.dialog.getByRole("button", { name: /^Sign/i });
  }

  get closeButton(): Locator {
    return this.dialog.getByRole("button", {
      name: /Close|Done|Continue later/i,
    });
  }

  async fillAmount(btc: number | string): Promise<void> {
    await this.amountInput.fill(String(btc));
  }

  async pickVaultProvider(name: string | RegExp): Promise<void> {
    await this.vaultProviderSelect.click();
    await this.page.getByRole("option", { name }).click();
  }
}
