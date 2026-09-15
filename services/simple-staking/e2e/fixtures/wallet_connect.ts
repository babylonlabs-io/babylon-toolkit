import type { Page } from "@playwright/test";

import {
  injectBBNWallet,
  injectBTCWallet,
  type TestWalletOptions,
} from "../mocks/blockchain";
import { mockVerifyBTCAddress } from "../mocks/handlers";

import { PageNavigationActions } from "./page_navigation";
import {
  BUTTON_SELECTORS,
  CONNECT_BUTTON_SELECTOR,
  DIALOG_SELECTORS,
  WALLET_SELECTORS,
  createGenericWalletSelector,
} from "./wallet_connect.selectors";

export class WalletConnectActions {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async clickConnectButton() {
    await this.page.waitForSelector(CONNECT_BUTTON_SELECTOR, {
      state: "visible",
      timeout: 3000,
    });

    const connectButtons = await this.page
      .locator(CONNECT_BUTTON_SELECTOR)
      .all();

    for (const button of connectButtons) {
      const isDisabled = await button.isDisabled();
      if (!isDisabled) {
        await button.click({ force: true });
        return;
      }
    }

    if (connectButtons.length > 0) {
      await connectButtons[0].click({ force: true });
    }
  }

  async clickInjectableWalletButton() {
    const bitcoinWalletButton = this.page
      .locator(WALLET_SELECTORS.BITCOIN)
      .first();

    await bitcoinWalletButton.waitFor({ state: "visible", timeout: 10_000 });
    await bitcoinWalletButton.click();
  }

  async clickOKXWalletButton() {
    for (const selector of WALLET_SELECTORS.OKX) {
      const okxButton = this.page.locator(selector).first();
      if (await okxButton.isVisible().catch(() => false)) {
        await okxButton.click();
        break;
      }
    }

    await this.page
      .locator(WALLET_SELECTORS.BABYLON[0])
      .waitFor({ state: "visible" });
  }

  async clickBabylonChainWalletButton() {
    for (const selector of WALLET_SELECTORS.BABYLON) {
      const babylonButton = this.page.locator(selector).first();
      if (await babylonButton.isVisible().catch(() => false)) {
        await babylonButton.click();
        break;
      }
    }
  }

  async clickGenericWalletButton(walletType: string = "Leap") {
    const walletSelector = createGenericWalletSelector(walletType);
    const walletButton = this.page.locator(walletSelector);
    await walletButton.waitFor({ state: "visible", timeout: 3000 });
    await walletButton.click();
  }

  async clickDoneButton() {
    const doneButton = this.page.locator(BUTTON_SELECTORS.DONE);
    await doneButton.waitFor({ state: "visible", timeout: 3000 });
    await doneButton.click({ force: true });
  }

  async setupMocks() {
    await mockVerifyBTCAddress(this.page);
  }

  async handleVerificationErrorIfPresent() {
    const isErrorVisible = await this.page
      .locator(DIALOG_SELECTORS.ERROR_DIALOG)
      .isVisible()
      .catch(() => false);

    if (isErrorVisible) {
      const doneButton = this.page.locator(
        DIALOG_SELECTORS.ERROR_DIALOG_DONE_BUTTON,
      );

      if (await doneButton.isVisible().catch(() => false)) {
        await doneButton.click();

        await this.page
          .locator(DIALOG_SELECTORS.ERROR_DIALOG)
          .waitFor({
            state: "hidden",
            timeout: 1000,
          })
          .catch(() => {});
      }
    }
  }

  async setupWalletConnection(options?: TestWalletOptions) {
    await new PageNavigationActions(this.page).waitForPageLoad();
    await this.setupMocks();
    await injectBBNWallet(this.page, "Leap", options);
    await injectBTCWallet(this.page, "OKX", options);
    await this.clickConnectButton();
    await this.clickInjectableWalletButton();
    await this.clickOKXWalletButton();
    await this.handleVerificationErrorIfPresent();
    await this.clickBabylonChainWalletButton();
    await this.clickGenericWalletButton();
    await this.clickDoneButton();
  }
}
