import { expect, test } from "@playwright/test";

import {
  PageNavigationActions,
  WalletBalanceActions,
  WalletConnectActions,
} from "../fixtures";

test.describe("Balance and address checks after connection", () => {
  let connectActions: WalletConnectActions;
  let balanceActions: WalletBalanceActions;
  let navigationActions: PageNavigationActions;

  test.beforeEach(async ({ page }) => {
    connectActions = new WalletConnectActions(page);
    balanceActions = new WalletBalanceActions(page);
    navigationActions = new PageNavigationActions(page);

    await navigationActions.navigateToHomePage(page);
    await connectActions.setupWalletConnection();
  });

  test("balance is correct", async () => {
    await balanceActions.waitForBalanceLoadingComplete();

    const stakedBalanceText = await balanceActions.getStakedBalance();
    const stakableBalance = await balanceActions.getStakableBalance();
    const babylonBalance = await balanceActions.getBabylonBalance();

    expect(stakedBalanceText).toContain("0.09876543 sBTC");
    expect(stakableBalance).toContain("0.00074175 sBTC");
    expect(babylonBalance).toContain("1 tBABY");
  });
});
