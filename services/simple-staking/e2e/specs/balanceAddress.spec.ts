import { expect, test } from "@playwright/test";

import { WalletBalanceActions, WalletConnectActions } from "../fixtures";

import { injectBBNQueries } from "../mocks/blockchain";
import mockData from "../mocks/blockchain/constants";

test.describe("Balance and address checks after connection", () => {
  let connectActions: WalletConnectActions;
  let balanceActions: WalletBalanceActions;

  test.beforeEach(async ({ page }) => {
    connectActions = new WalletConnectActions(page);
    balanceActions = new WalletBalanceActions(page);

    const data = structuredClone(mockData);
    data.bbnQueries.stakableBtc = String(data.btcWallet.balance.confirmed);
    await injectBBNQueries(page, undefined, data);
    await page.goto("/");
    await connectActions.setupWalletConnection();
  });

  test("balance is correct", async () => {
    await balanceActions.waitForBalanceLoadingComplete();

    const stakedBalanceText = await balanceActions.getStakedBalance();
    const stakableBalance = await balanceActions.getStakableBalance();
    const babylonBalance = await balanceActions.getBabylonBalance();

    expect(stakedBalanceText).toContain("0.09876543 BTC");
    expect(stakableBalance).toContain("0.12345678 BTC");
    expect(babylonBalance).toContain("1.00 BABY");
  });
});
