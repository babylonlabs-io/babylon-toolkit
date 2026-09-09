import { expect, test } from "@playwright/test";
import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import { payments, Transaction } from "bitcoinjs-lib";
import { tapleafHash } from "bitcoinjs-lib/src/payments/bip341.js";

import { DelegationState } from "@/ui/common/types/delegations";

import { WalletConnectActions } from "./fixtures/wallet_connect";
import { interceptRequest } from "./helper/interceptRequest";
import {
  unbondedTX,
  unbondingTransaction,
  withdrawalDestination,
  withdrawalFee,
  withdrawalPrivateKeyHex,
} from "./mock/tx/withdrawing";
import { injectBBNQueries } from "./mocks/blockchain";
import mockData from "./mocks/blockchain/constants";

test.describe("Create withdrawing transaction", () => {
  let actions: WalletConnectActions;

  test.beforeEach(({ page }) => injectBBNQueries(page));

  test("prepare the withdrawing", async ({ page }) => {
    await interceptRequest(
      page,
      "**/fees/recommended",
      200,
      mockData.btcWallet.networkFees,
    );
    await interceptRequest(page, "**/v1/staker/delegations**", 200, unbondedTX);
    let submissions = 0;
    await page.route("**/api/tx", async (route) => {
      expect(route.request().method()).toBe("POST");
      const tx = Transaction.fromHex(route.request().postData()!);
      expect(tx.ins).toHaveLength(1);
      expect(tx.ins[0]).toMatchObject({
        hash: unbondingTransaction.getHash(),
        index: 0,
        sequence: unbondedTX.data[0].unbonding_tx.timelock,
      });
      expect(tx.outs).toEqual([
        {
          script: withdrawalDestination.output,
          value: unbondingTransaction.outs[0].value - withdrawalFee,
        },
      ]);
      expect(tx.ins[0].witness).toHaveLength(3);
      expect(() =>
        payments.p2tr({
          output: unbondingTransaction.outs[0].script,
          witness: tx.ins[0].witness,
        }),
      ).not.toThrow();
      const [signature, script, controlBlock] = tx.ins[0].witness;
      const hash = tx.hashForWitnessV1(
        0,
        [unbondingTransaction.outs[0].script],
        [unbondingTransaction.outs[0].value],
        Transaction.SIGHASH_DEFAULT,
        tapleafHash({ output: script, version: controlBlock[0] & 0xfe }),
      );
      expect(
        ecc.verifySchnorr(
          hash,
          Buffer.from(unbondedTX.data[0].staker_pk_hex, "hex"),
          signature,
        ),
      ).toBe(true);
      submissions++;
      await route.fulfill({
        status: 200,
        contentType: "text/plain",
        body: tx.getId(),
      });
    });
    await page.goto("/");
    actions = new WalletConnectActions(page);
    await actions.setupWalletConnection({
      privateKeyHex: withdrawalPrivateKeyHex,
    });

    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await page.getByRole("button", { name: "Withdraw" }).click();
    await page.getByRole("button", { name: "Proceed" }).click();

    // expect the withdrawal state text instead of a button
    await expect(page.getByText("Withdrawal Submitted")).toBeVisible();
    expect(submissions).toBe(1);

    // check for local storage
    const item = await page.evaluate(
      (pk) =>
        localStorage.getItem(`bbn-staking-intermediate-delegations-${pk}`),
      unbondedTX.data[0].staker_pk_hex,
    );
    expect(item).not.toBeNull();
    const parsed = JSON.parse(item as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].state).toBe(DelegationState.INTERMEDIATE_WITHDRAWAL);
  });

  test("withdrawn", async ({ page }) => {
    // Modify the activeTX to reflect "withdrawn"
    const updatedTX = {
      ...unbondedTX,
      data: unbondedTX.data.map((tx) => ({
        ...tx,
        state: DelegationState.WITHDRAWN,
      })),
    };

    // Intercept the GET request for updated delegation
    await interceptRequest(page, "**/v1/staker/delegations**", 200, updatedTX);
    await page.goto("/");
    actions = new WalletConnectActions(page);
    await actions.setupWalletConnection({
      privateKeyHex: withdrawalPrivateKeyHex,
    });
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(page.getByText("Withdrawn")).toBeVisible();

    // check for local storage
    const item = await page.evaluate(
      (pk) =>
        localStorage.getItem(`bbn-staking-intermediate-delegations-${pk}`),
      unbondedTX.data[0].staker_pk_hex,
    );
    expect(item).toBe("[]");
    const parsed = JSON.parse(item as string);
    expect(parsed).toHaveLength(0);
  });
});
