import {
  decodeFunctionResult,
  encodeFunctionData,
  encodeFunctionResult,
  multicall3Abi,
  type Hex,
} from "viem";
import { describe, expect, it } from "vitest";

import { CHECK_ALLOWED_ABI } from "../allowListRpcAnswers";
import {
  ALLOWED_TO_DEPOSIT_ABI,
  answerEthCall,
  assertCheckedBeforeBroadcast,
  assertCheckedBeforeRegistration,
  assertRefusedBeforeRegistration,
  assertRefusedNotAllowListed,
  createCapacityRpcState,
  GET_DEPOSITOR_VAULT_IDS_ABI,
  noteEstimateGas,
  noteReceipt,
} from "../positionCapacityRpcAnswers";

const DEPOSITOR = "0xdba3377f3505e1e34b01b40f6385649b5ca4055d";
const OTHER_ACCOUNT = "0x00000000000000000000000000000000000000b2";
const ADAPTER = "0xccfc000000000000000000000000000000000001";
const REGISTRY = "0x3408000000000000000000000000000000000002";
const PRICE_FEED = "0xa5c0000000000000000000000000000000000003";
const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
const START_BLOCK = 100n;

function state(injection?: "before-registration" | "before-broadcast") {
  return createCapacityRpcState({
    depositor: DEPOSITOR,
    adapter: ADAPTER,
    registry: REGISTRY,
    multicall3: MULTICALL3,
    injection,
    startBlock: START_BLOCK,
  });
}

function askAllowed(receiver: string, nVaults: bigint, amount: bigint): Hex {
  return encodeFunctionData({
    abi: ALLOWED_TO_DEPOSIT_ABI,
    functionName: "allowedToDeposit",
    args: [receiver as Hex, nVaults, amount],
  });
}

function allowedAnswer(allowed: boolean): Hex {
  return encodeFunctionResult({
    abi: ALLOWED_TO_DEPOSIT_ABI,
    functionName: "allowedToDeposit",
    result: allowed,
  });
}

const ASK_VAULT_IDS = encodeFunctionData({
  abi: GET_DEPOSITOR_VAULT_IDS_ABI,
  functionName: "getDepositorVaultIds",
  args: [DEPOSITOR],
});
const UNRELATED_CALL: Hex = "0xfeaf968c";
const UNRELATED_RESULT: Hex = `0x${"00".repeat(31)}2a`;

/** An `eth_call` to Multicall3 carrying `calls`, and the RPC's `aggregate3` result for `outcomes`. */
function batch(
  calls: readonly { target: string; callData: Hex }[],
  outcomes: readonly { success: boolean; returnData: Hex }[],
): { call: { to: string; data: Hex }; result: Hex } {
  return {
    call: {
      to: MULTICALL3,
      data: encodeFunctionData({
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [
          calls.map((inner) => ({
            target: inner.target as Hex,
            allowFailure: true,
            callData: inner.callData,
          })),
        ],
      }),
    },
    result: encodeFunctionResult({
      abi: multicall3Abi,
      functionName: "aggregate3",
      result: outcomes,
    }),
  };
}

function outcomesOf(result: Hex) {
  return decodeFunctionResult({
    abi: multicall3Abi,
    functionName: "aggregate3",
    data: result,
  });
}

const REGISTRATION_RECEIPT = {
  transactionHash: `0x${"aa".repeat(32)}`,
  blockNumber: "0x70",
  from: DEPOSITOR.toLowerCase(),
  to: REGISTRY.toLowerCase(),
  status: "0x1",
};

describe("answerEthCall", () => {
  it("records the depositor's allowedToDeposit question and the chain's answer from inside a batch", () => {
    const watch = state();
    watch.signClickSeq = 1;
    const { call, result } = batch(
      [
        { target: PRICE_FEED, callData: UNRELATED_CALL },
        { target: ADAPTER, callData: askAllowed(DEPOSITOR, 3n, 150_000n) },
      ],
      [
        { success: true, returnData: UNRELATED_RESULT },
        { success: true, returnData: allowedAnswer(true) },
      ],
    );

    expect(answerEthCall(watch, 2, call, result)).toBe(result);
    expect(watch.capacityReads).toEqual([
      {
        seq: 2,
        nVaults: 3n,
        amount: 150_000n,
        realAnswer: true,
        servedAnswer: true,
      },
    ]);
  });

  it("rewrites only the depositor's allowedToDeposit to false under the injection", () => {
    const watch = state("before-registration");
    watch.signClickSeq = 1;
    const { call, result } = batch(
      [
        { target: PRICE_FEED, callData: UNRELATED_CALL },
        { target: ADAPTER, callData: askAllowed(DEPOSITOR, 1n, 100_000n) },
      ],
      [
        { success: true, returnData: UNRELATED_RESULT },
        { success: true, returnData: allowedAnswer(true) },
      ],
    );

    const served = outcomesOf(answerEthCall(watch, 2, call, result));

    expect(served[0]).toEqual({ success: true, returnData: UNRELATED_RESULT });
    expect(served[1]).toEqual({
      success: true,
      returnData: allowedAnswer(false),
    });
    expect(watch.tampered).toBe(1);
    expect(watch.capacityReads[0]).toMatchObject({
      realAnswer: true,
      servedAnswer: false,
    });
  });

  it("answers truthfully before the Sign click", () => {
    const watch = state("before-registration");
    const { call, result } = batch(
      [{ target: ADAPTER, callData: askAllowed(DEPOSITOR, 1n, 100_000n) }],
      [{ success: true, returnData: allowedAnswer(true) }],
    );

    expect(answerEthCall(watch, 1, call, result)).toBe(result);
    expect(watch.tampered).toBe(0);
  });

  it("answers truthfully before the registration is mined under before-broadcast, then refuses", () => {
    const watch = state("before-broadcast");
    watch.signClickSeq = 1;
    const ask = () =>
      batch(
        [{ target: ADAPTER, callData: askAllowed(DEPOSITOR, 1n, 100_000n) }],
        [{ success: true, returnData: allowedAnswer(true) }],
      );

    const beforeRegistration = ask();
    expect(
      answerEthCall(
        watch,
        2,
        beforeRegistration.call,
        beforeRegistration.result,
      ),
    ).toBe(beforeRegistration.result);

    noteReceipt(watch, 3, REGISTRATION_RECEIPT);
    const beforeBroadcast = ask();
    const served = outcomesOf(
      answerEthCall(watch, 4, beforeBroadcast.call, beforeBroadcast.result),
    );

    expect(served[0].returnData).toBe(allowedAnswer(false));
    expect(watch.tampered).toBe(1);
  });

  it("answers truthfully once released", () => {
    const watch = state("before-registration");
    watch.signClickSeq = 1;
    watch.holding = false;
    const { call, result } = batch(
      [{ target: ADAPTER, callData: askAllowed(DEPOSITOR, 1n, 100_000n) }],
      [{ success: true, returnData: allowedAnswer(true) }],
    );

    expect(answerEthCall(watch, 2, call, result)).toBe(result);
  });

  it("leaves a failed read failed rather than inventing a verdict", () => {
    const watch = state("before-registration");
    watch.signClickSeq = 1;
    const { call, result } = batch(
      [{ target: ADAPTER, callData: askAllowed(DEPOSITOR, 1n, 100_000n) }],
      [{ success: false, returnData: "0x" }],
    );

    expect(answerEthCall(watch, 2, call, result)).toBe(result);
    expect(watch.capacityReads[0]).toMatchObject({
      realAnswer: null,
      servedAnswer: null,
    });
    expect(watch.tampered).toBe(0);
  });

  it("does not touch a capacity read for another account's position", () => {
    const watch = state("before-registration");
    watch.signClickSeq = 1;
    const { call, result } = batch(
      [{ target: ADAPTER, callData: askAllowed(OTHER_ACCOUNT, 1n, 100_000n) }],
      [{ success: true, returnData: allowedAnswer(true) }],
    );

    expect(answerEthCall(watch, 2, call, result)).toBe(result);
    expect(watch.capacityReads).toEqual([]);
  });

  it("handles a lone eth_call to the application as well as a batch", () => {
    const watch = state("before-registration");
    watch.signClickSeq = 1;

    const served = answerEthCall(
      watch,
      2,
      { to: ADAPTER, data: askAllowed(DEPOSITOR, 1n, 100_000n) },
      allowedAnswer(true),
    );

    expect(served).toBe(allowedAnswer(false));
  });

  it("records the depositor's getDepositorVaultIds read", () => {
    const watch = state();
    const { call, result } = batch(
      [{ target: REGISTRY, callData: ASK_VAULT_IDS }],
      [
        {
          success: true,
          returnData: encodeFunctionResult({
            abi: GET_DEPOSITOR_VAULT_IDS_ABI,
            functionName: "getDepositorVaultIds",
            result: [],
          }),
        },
      ],
    );

    answerEthCall(watch, 5, call, result);

    expect(watch.vaultIdsReadSeqs).toEqual([5]);
  });
});

describe("noteEstimateGas", () => {
  const registrationEstimate = [{ from: DEPOSITOR, to: REGISTRY }];

  it("refuses the registration estimate when no capacity read came since Sign", () => {
    const watch = state();
    watch.signClickSeq = 1;

    expect(noteEstimateGas(watch, 2, registrationEstimate)).toBe(false);
    expect(watch.registrationPreparedSeq).toBe(2);
    expect(watch.violation).toMatch(/without asking the application/);
  });

  it("lets the registration estimate through after a capacity read", () => {
    const watch = state();
    watch.signClickSeq = 1;
    answerEthCall(
      watch,
      2,
      { to: ADAPTER, data: askAllowed(DEPOSITOR, 1n, 100_000n) },
      allowedAnswer(true),
    );

    expect(noteEstimateGas(watch, 3, registrationEstimate)).toBe(true);
    expect(watch.violation).toBeNull();
  });

  it("ignores an estimate for another contract", () => {
    const watch = state();
    watch.signClickSeq = 1;

    expect(noteEstimateGas(watch, 2, [{ from: DEPOSITOR, to: ADAPTER }])).toBe(
      true,
    );
    expect(watch.registrationPreparedSeq).toBeNull();
  });
});

describe("noteReceipt", () => {
  it("takes the depositor's successful registry receipt as the registration", () => {
    const watch = state();

    expect(noteReceipt(watch, 4, REGISTRATION_RECEIPT)).toEqual({
      seq: 4,
      txHash: REGISTRATION_RECEIPT.transactionHash,
      blockNumber: 0x70n,
    });
  });

  it("ignores a registration mined at or before the run started", () => {
    const watch = state();

    expect(
      noteReceipt(watch, 4, { ...REGISTRATION_RECEIPT, blockNumber: "0x64" }),
    ).toBeNull();
    expect(watch.registrationMined).toBeNull();
  });

  it("ignores a receipt for another contract or a reverted one", () => {
    const watch = state();

    noteReceipt(watch, 4, { ...REGISTRATION_RECEIPT, to: ADAPTER });
    noteReceipt(watch, 5, { ...REGISTRATION_RECEIPT, status: "0x0" });

    expect(watch.registrationMined).toBeNull();
  });
});

describe("verdicts", () => {
  /** A watch that saw Sign, the vault list, a "yes" for (n, amount), the registration and a broadcast. */
  function happyWatch(beforeBroadcast: { nVaults: bigint; amount: bigint }) {
    const watch = state();
    watch.signClickSeq = 1;
    watch.vaultIdsReadSeqs.push(2);
    answerEthCall(
      watch,
      3,
      { to: ADAPTER, data: askAllowed(DEPOSITOR, 1n, 100_000n) },
      allowedAnswer(true),
    );
    noteEstimateGas(watch, 4, [{ from: DEPOSITOR, to: REGISTRY }]);
    noteReceipt(watch, 5, REGISTRATION_RECEIPT);
    watch.vaultIdsReadSeqs.push(6);
    answerEthCall(
      watch,
      7,
      {
        to: ADAPTER,
        data: askAllowed(
          DEPOSITOR,
          beforeBroadcast.nVaults,
          beforeBroadcast.amount,
        ),
      },
      allowedAnswer(true),
    );
    watch.broadcastSeqs.push(8);
    return watch;
  }

  it("accepts a check before registration and before the broadcast about the same deposit", () => {
    const watch = happyWatch({ nVaults: 1n, amount: 100_000n });
    const expected = [{ nVaults: 1n, amount: 100_000n }];

    expect(assertCheckedBeforeRegistration(watch, expected).seq).toBe(3);
    expect(
      assertCheckedBeforeBroadcast(watch, "broadcast", 5, expected).seq,
    ).toBe(7);
  });

  it("rejects a check before the broadcast that counted the deposit's own vaults again", () => {
    const watch = happyWatch({ nVaults: 2n, amount: 200_000n });

    expect(() =>
      assertCheckedBeforeBroadcast(watch, "broadcast", 5, [
        { nVaults: 1n, amount: 100_000n },
      ]),
    ).toThrow(/counted wrong/);
  });

  it("rejects a check asked without reading the depositor's vault list first", () => {
    const watch = happyWatch({ nVaults: 1n, amount: 100_000n });
    watch.vaultIdsReadSeqs.length = 0;

    expect(() =>
      assertCheckedBeforeRegistration(watch, [
        { nVaults: 1n, amount: 100_000n },
      ]),
    ).toThrow(/getDepositorVaultIds/);
  });

  it("calls a refusal run that injected nothing a run that tested nothing", () => {
    const watch = state("before-registration");
    watch.signClickSeq = 1;

    expect(() =>
      assertRefusedBeforeRegistration(watch, [
        { nVaults: 1n, amount: 100_000n },
      ]),
    ).toThrow(/tested nothing/);
  });

  it("blames the chain, not the app, for a refusal the chain itself answered after Sign", () => {
    const watch = state("before-registration");
    watch.signClickSeq = 1;
    watch.vaultIdsReadSeqs.push(2);
    answerEthCall(
      watch,
      3,
      { to: ADAPTER, data: askAllowed(DEPOSITOR, 1n, 100_000n) },
      allowedAnswer(false),
    );

    expect(() =>
      assertRefusedBeforeRegistration(watch, [
        { nVaults: 1n, amount: 100_000n },
      ]),
    ).toThrow(/chain itself answered/);
  });

  it("fails a refusal before registration when a wallet window opened after Sign", () => {
    const watch = state("before-registration");
    watch.signClickSeq = 1;
    watch.vaultIdsReadSeqs.push(2);
    answerEthCall(
      watch,
      3,
      { to: ADAPTER, data: askAllowed(DEPOSITOR, 1n, 100_000n) },
      allowedAnswer(true),
    );
    watch.popups.push({
      seq: 4,
      url: "chrome-extension://unisat/notification.html",
    });

    expect(() =>
      assertRefusedBeforeRegistration(watch, [
        { nVaults: 1n, amount: 100_000n },
      ]),
    ).toThrow(/wallet window opened/);
  });
});

describe("allow-list injection", () => {
  // Any address: the watch matches the allow-list read by selector, not by the policy the app resolved.
  const POLICY = "0x02a49a92b93fbc60321df5b9dde7c9f8189b2e39";

  function notAllowListedWatch() {
    return createCapacityRpcState({
      depositor: DEPOSITOR,
      adapter: ADAPTER,
      registry: REGISTRY,
      multicall3: MULTICALL3,
      injection: undefined,
      notAllowListed: true,
      startBlock: START_BLOCK,
    });
  }

  function askListed(depositor: string): Hex {
    return encodeFunctionData({
      abi: CHECK_ALLOWED_ABI,
      functionName: "checkAllowed",
      args: [ADAPTER, depositor as Hex],
    });
  }

  function listedAnswer(allowed: boolean): Hex {
    return encodeFunctionResult({
      abi: CHECK_ALLOWED_ABI,
      functionName: "checkAllowed",
      result: allowed,
    });
  }

  it("answers the depositor's allow-list read 'not allowed' from the Sign click, whatever policy is asked", () => {
    const watch = notAllowListedWatch();
    watch.signClickSeq = 1;
    const { call, result } = batch(
      [
        { target: PRICE_FEED, callData: UNRELATED_CALL },
        { target: POLICY, callData: askListed(DEPOSITOR) },
      ],
      [
        { success: true, returnData: UNRELATED_RESULT },
        { success: true, returnData: listedAnswer(true) },
      ],
    );

    const served = outcomesOf(answerEthCall(watch, 2, call, result));

    expect(served[0]).toEqual({ success: true, returnData: UNRELATED_RESULT });
    expect(served[1]).toEqual({
      success: true,
      returnData: listedAnswer(false),
    });
    expect(watch.allowListReads).toEqual([
      { seq: 2, realAnswer: true, servedAnswer: false },
    ]);
  });

  it("answers the deposit form's allow-list read truthfully before the Sign click", () => {
    const watch = notAllowListedWatch();
    const { call, result } = batch(
      [{ target: POLICY, callData: askListed(DEPOSITOR) }],
      [{ success: true, returnData: listedAnswer(true) }],
    );

    expect(answerEthCall(watch, 1, call, result)).toBe(result);
    expect(watch.tampered).toBe(0);
  });

  it("leaves another account's allow-list read alone", () => {
    const watch = notAllowListedWatch();
    watch.signClickSeq = 1;
    const { call, result } = batch(
      [{ target: POLICY, callData: askListed(OTHER_ACCOUNT) }],
      [{ success: true, returnData: listedAnswer(true) }],
    );

    expect(answerEthCall(watch, 2, call, result)).toBe(result);
    expect(watch.allowListReads).toEqual([]);
  });

  it("records the allow-list read without rewriting it when the injection is off", () => {
    const watch = state();
    watch.signClickSeq = 1;
    const { call, result } = batch(
      [{ target: POLICY, callData: askListed(DEPOSITOR) }],
      [{ success: true, returnData: listedAnswer(true) }],
    );

    expect(answerEthCall(watch, 2, call, result)).toBe(result);
    expect(watch.allowListReads).toEqual([
      { seq: 2, realAnswer: true, servedAnswer: true },
    ]);
  });

  it("passes the refusal verdict when the injected read stopped the deposit before anything else", () => {
    const watch = notAllowListedWatch();
    watch.signClickSeq = 1;
    watch.allowListReads.push({
      seq: 2,
      realAnswer: true,
      servedAnswer: false,
    });

    expect(assertRefusedNotAllowListed(watch)).toMatchObject({ seq: 2 });
  });

  it("refuses the verdict when the chain itself said 'not allowed'", () => {
    const watch = notAllowListedWatch();
    watch.signClickSeq = 1;
    watch.allowListReads.push({
      seq: 2,
      realAnswer: false,
      servedAnswer: false,
    });

    expect(() => assertRefusedNotAllowListed(watch)).toThrow(
      /chain itself answered/,
    );
  });

  it("does not blame the chain for an allow-list read after Sign that went unanswered", () => {
    // The app fails open on a failed read, so it cannot be what stopped the deposit: the injected
    // read is, and the verdict must still pass.
    const watch = notAllowListedWatch();
    watch.signClickSeq = 1;
    watch.allowListReads.push({
      seq: 2,
      realAnswer: true,
      servedAnswer: false,
    });
    watch.allowListReads.push({ seq: 3, realAnswer: null, servedAnswer: null });

    expect(assertRefusedNotAllowListed(watch)).toMatchObject({ seq: 2 });
  });

  it("refuses the verdict when no allow-list read followed the Sign click", () => {
    const watch = notAllowListedWatch();
    watch.signClickSeq = 1;

    expect(() => assertRefusedNotAllowListed(watch)).toThrow(/tested nothing/);
  });

  it("refuses the verdict when the app asked the position for room after the refusal", () => {
    const watch = notAllowListedWatch();
    watch.signClickSeq = 1;
    watch.allowListReads.push({
      seq: 2,
      realAnswer: true,
      servedAnswer: false,
    });
    watch.capacityReads.push({
      seq: 3,
      nVaults: 1n,
      amount: 100_000n,
      realAnswer: true,
      servedAnswer: true,
    });

    expect(() => assertRefusedNotAllowListed(watch)).toThrow(
      /asked the position for room/,
    );
  });

  it("refuses the verdict when a wallet window opened after the Sign click", () => {
    const watch = notAllowListedWatch();
    watch.signClickSeq = 1;
    watch.allowListReads.push({
      seq: 2,
      realAnswer: true,
      servedAnswer: false,
    });
    watch.popups.push({
      seq: 3,
      url: "chrome-extension://unisat/notification.html",
    });

    expect(() => assertRefusedNotAllowListed(watch)).toThrow(
      /wallet window opened/,
    );
  });
});
