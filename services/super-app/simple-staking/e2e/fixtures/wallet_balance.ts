import type { Page } from "@playwright/test";

import {
  BABYLON_BALANCE_VALUE_SELECTOR,
  SPINNER_SELECTOR,
  STAKABLE_BALANCE_VALUE_SELECTOR,
  STAKED_BALANCE_VALUE_SELECTOR,
  AVATAR_GROUP_SELECTOR,
} from "./wallet_balance.selectors";

export class WalletBalanceActions {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async waitForBalanceLoadingComplete() {
    await this.page.waitForFunction(
      (sel) => document.querySelectorAll(sel).length === 0,
      SPINNER_SELECTOR,
      { timeout: 30_000 },
    );

    await this.page.locator(AVATAR_GROUP_SELECTOR).click();

    await this.page.waitForSelector(
      `${STAKED_BALANCE_VALUE_SELECTOR}, ${STAKABLE_BALANCE_VALUE_SELECTOR}, ${BABYLON_BALANCE_VALUE_SELECTOR}`,
      { state: "attached", timeout: 30_000 },
    );
  }

  async getStakedBalance(): Promise<string | null> {
    const stakedBalance = this.page.locator(STAKED_BALANCE_VALUE_SELECTOR);
    return stakedBalance.textContent();
  }

  async getStakableBalance(): Promise<string | null> {
    return this.page.locator(STAKABLE_BALANCE_VALUE_SELECTOR).textContent();
  }

  async getBabylonBalance(): Promise<string | null> {
    return this.page.locator(BABYLON_BALANCE_VALUE_SELECTOR).textContent();
  }
}
