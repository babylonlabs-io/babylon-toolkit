import { expect, test } from "@playwright/test";
import { Psbt, Transaction, opcodes, script } from "bitcoinjs-lib";
import { witnessStackToScriptWitness } from "bitcoinjs-lib/src/psbt/psbtutils.js";

import { DelegationState } from "@/ui/common/types/delegations";

import { WalletConnectActions } from "./fixtures/wallet_connect";
import { interceptRequest } from "./helper/interceptRequest";
import { activeTX, unbondingPOST, unbondingTX } from "./mock/tx/unbonding";
import { injectBBNQueries } from "./mocks/blockchain";
import { mockNetworkInfo } from "./mocks/handlers/constants";

test.describe("Create unbonding transaction", () => {
  let actions: WalletConnectActions;

  test.beforeEach(({ page }) => injectBBNQueries(page));

  test("prepare the unbonding", async ({ page }) => {
    const recordedTx = Transaction.fromHex(unbondingPOST.unbonding_tx_hex);
    const witness = recordedTx.ins[0].witness;
    const chunks = script.decompile(witness[1])!;
    const unsignedTx = recordedTx.clone();
    unsignedTx.setWitness(0, []);
    await interceptRequest(page, "**/v2/network-info*", 200, {
      data: {
        params: {
          btc: [mockNetworkInfo.data.params.btc[0]],
          bbn: [
            {
              ...mockNetworkInfo.data.params.bbn[0],
              covenant_pks: chunks
                .filter(Buffer.isBuffer)
                .slice(1)
                .map((key) => key.toString("hex")),
              covenant_quorum: Number(chunks.at(-2)) - opcodes.OP_RESERVED,
              unbonding_time_blocks: unbondingTX.timelock,
              unbonding_fee_sat:
                activeTX.data[0].staking_value - recordedTx.outs[0].value,
            },
          ],
        },
      },
    });
    await page.exposeFunction("signRecordedUnbonding", (hex: string) => {
      const psbt = Psbt.fromHex(hex);
      expect(psbt.data.globalMap.unsignedTx.toBuffer().toString("hex")).toBe(
        unsignedTx.toHex(),
      );
      psbt.updateInput(0, {
        finalScriptWitness: witnessStackToScriptWitness(witness),
      });
      return psbt.toHex();
    });
    await interceptRequest(page, "**/v1/staker/delegations**", 200, activeTX);
    await interceptRequest(page, "**/v1/unbonding/eligibility**", 200);
    await interceptRequest(page, "**/v1/unbonding", 202, {
      message: "Request accepted",
    });
    await page.goto("/");
    actions = new WalletConnectActions(page);
    await actions.setupWalletConnection();
    await page.evaluate(() => {
      const injected = window as unknown as {
        okxwallet: { bitcoin: { signPsbt: (hex: string) => Promise<string> } };
        signRecordedUnbonding: (hex: string) => Promise<string>;
      };
      injected.okxwallet.bitcoin.signPsbt = injected.signRecordedUnbonding;
    });

    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await page
      .getByRole("row")
      .filter({
        has: page.getByRole("button", { name: "Register", exact: true }),
      })
      .getByRole("button", { name: "", exact: true })
      .click();
    await page.getByRole("button", { name: "Unbond" }).click();
    const submitted = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/v1/unbonding",
    );
    await page.getByRole("button", { name: "Proceed" }).click();
    expect((await submitted).postDataJSON()).toEqual(unbondingPOST);

    // expect the unbonding state text instead of a button
    await expect(page.getByText("Requesting Unbonding")).toBeVisible();

    // check for local storage
    const item = await page.evaluate(() =>
      localStorage.getItem(
        "bbn-staking-intermediate-delegations-4c6e2954c75bcb53aa13b7cd5d8bcdb4c9a4dd0784d68b115bd4408813b45608",
      ),
    );
    expect(item).not.toBeNull();
    const parsed = JSON.parse(item as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].state).toBe(DelegationState.INTERMEDIATE_UNBONDING);
  });

  test("unbonding requested", async ({ page }) => {
    // Modify the activeTX to reflect "unbonding requested"
    const updatedTX = {
      ...activeTX,
      data: activeTX.data.map((tx) => ({
        ...tx,
        state: DelegationState.UNBONDING_REQUESTED,
      })),
    };

    // Intercept the GET request for updated delegation
    await interceptRequest(page, "**/v1/staker/delegations**", 200, updatedTX);
    await page.goto("/");
    actions = new WalletConnectActions(page);
    await actions.setupWalletConnection();
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(page.getByText("Unbonding Requested")).toBeVisible();

    // check for local storage
    const item = await page.evaluate(() =>
      localStorage.getItem(
        "bbn-staking-intermediate-delegations-4c6e2954c75bcb53aa13b7cd5d8bcdb4c9a4dd0784d68b115bd4408813b45608",
      ),
    );
    expect(item).toBe("[]");
    const parsed = JSON.parse(item as string);
    expect(parsed).toHaveLength(0);
  });

  test("unbonded", async ({ page }) => {
    // Modify the activeTX to reflect "unbonding requested"
    const updatedTX = {
      ...activeTX,
      data: activeTX.data.map((tx) => ({
        ...tx,
        state: DelegationState.UNBONDED,
        unbonding_tx: unbondingTX,
      })),
    };

    // Intercept the GET request for updated delegation
    await interceptRequest(page, "**/v1/staker/delegations**", 200, updatedTX);
    await page.goto("/");
    actions = new WalletConnectActions(page);
    await actions.setupWalletConnection();
    await page.getByRole("tab", { name: "Activity", exact: true }).click();
    await expect(page.getByText("Unbonded", { exact: true })).toBeVisible();
  });
});
