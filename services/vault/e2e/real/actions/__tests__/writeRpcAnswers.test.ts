import { describe, expect, it } from "vitest";

import { answerWriteRpcCall, createWriteRpcState } from "../writeRpcAnswers";

const ACCOUNT = "0xdbA3377f3505E1e34b01B40F6385649B5cA4055D";
const ADAPTER = "0xcCFC000000000000000000000000000000000001";
const TOKEN = "0x7000000000000000000000000000000000000007";
const WRITE_HASH = `0x${"aa".repeat(32)}`;
const BLOCK_HASH = `0x${"10".repeat(32)}`;

/** The receipt of the account's call to the adapter, mined in block 0x10 (16). */
const writeReceipt = {
  transactionHash: WRITE_HASH,
  blockNumber: "0x10",
  blockHash: BLOCK_HASH,
  from: ACCOUNT.toLowerCase(),
  to: ADAPTER.toLowerCase(),
  status: "0x1",
};

const block = (number: string) => ({
  number,
  hash: `0x${"cc".repeat(32)}`,
  parentHash: `0x${"bb".repeat(32)}`,
});

describe("answerWriteRpcCall", () => {
  it("lets the first receipt of the account's call to the adapter through and takes it as the write", () => {
    const state = createWriteRpcState(ACCOUNT, ADAPTER, "dropped");

    const answer = answerWriteRpcCall(
      state,
      "eth_getTransactionReceipt",
      [WRITE_HASH],
      writeReceipt,
    );

    expect(answer).toBe(writeReceipt);
    expect(state.write).toEqual({
      hash: WRITE_HASH,
      blockNumber: 16n,
      blockHash: BLOCK_HASH,
    });
  });

  it("does not take the receipt of a call to another contract, such as a repay's approve, as the write", () => {
    const state = createWriteRpcState(ACCOUNT, ADAPTER, "dropped");

    answerWriteRpcCall(state, "eth_getTransactionReceipt", [WRITE_HASH], {
      ...writeReceipt,
      to: TOKEN,
    });

    expect(state.write).toBeNull();
  });

  it("dropped: answers null for every later read of the write's receipt while it holds", () => {
    const state = createWriteRpcState(ACCOUNT, ADAPTER, "dropped");
    answerWriteRpcCall(state, "eth_getTransactionReceipt", [], writeReceipt);

    const answer = answerWriteRpcCall(
      state,
      "eth_getTransactionReceipt",
      [WRITE_HASH],
      writeReceipt,
    );

    expect(answer).toBeNull();
    expect(state.tampered).toBe(1);
  });

  it("dropped: serves the write's receipt again once released", () => {
    const state = createWriteRpcState(ACCOUNT, ADAPTER, "dropped");
    answerWriteRpcCall(state, "eth_getTransactionReceipt", [], writeReceipt);
    state.holding = false;

    const answer = answerWriteRpcCall(
      state,
      "eth_getTransactionReceipt",
      [WRITE_HASH],
      writeReceipt,
    );

    expect(answer).toBe(writeReceipt);
  });

  it("orphaned: gives every block above the write's, read by number, a parent no block has", () => {
    const state = createWriteRpcState(ACCOUNT, ADAPTER, "orphaned");
    answerWriteRpcCall(state, "eth_getTransactionReceipt", [], writeReceipt);

    const answer = answerWriteRpcCall(
      state,
      "eth_getBlockByNumber",
      ["0x12", false],
      block("0x12"),
    ) as { parentHash: string };

    expect(answer.parentHash).toBe(`0x${"ba".repeat(32)}`);
    expect(state.tampered).toBe(1);
  });

  it("orphaned: keeps serving the write's receipt, and leaves its own block and blocks read by tag alone", () => {
    const state = createWriteRpcState(ACCOUNT, ADAPTER, "orphaned");
    answerWriteRpcCall(state, "eth_getTransactionReceipt", [], writeReceipt);
    const own = block("0x10");
    const latest = block("0x30");

    expect(
      answerWriteRpcCall(state, "eth_getTransactionReceipt", [], writeReceipt),
    ).toBe(writeReceipt);
    expect(
      answerWriteRpcCall(state, "eth_getBlockByNumber", ["0x10", true], own),
    ).toBe(own);
    expect(
      answerWriteRpcCall(
        state,
        "eth_getBlockByNumber",
        ["latest", false],
        latest,
      ),
    ).toBe(latest);
    expect(state.tampered).toBe(0);
  });

  it("records how far above the write the app read the chain, only from blocks served unchanged", () => {
    const state = createWriteRpcState(ACCOUNT, ADAPTER, "orphaned");
    answerWriteRpcCall(state, "eth_getTransactionReceipt", [], writeReceipt);
    answerWriteRpcCall(state, "eth_getBlockByNumber", ["0x12"], block("0x12"));
    expect(state.deepestReadAbove).toBe(0n);

    state.holding = false;
    answerWriteRpcCall(state, "eth_getBlockByNumber", ["0x12"], block("0x12"));

    expect(state.deepestReadAbove).toBe(2n);
  });

  it("records that the app waited for depth when it asked for a block above the write's that the chain did not have yet", () => {
    const state = createWriteRpcState(ACCOUNT, ADAPTER, undefined);
    answerWriteRpcCall(state, "eth_getTransactionReceipt", [], writeReceipt);
    answerWriteRpcCall(state, "eth_getBlockByNumber", ["0x10"], null);
    expect(state.waitedForDepth).toBe(false);

    answerWriteRpcCall(state, "eth_getBlockByNumber", ["0x12", false], null);

    expect(state.waitedForDepth).toBe(true);
  });

  it("changes nothing without an injection", () => {
    const state = createWriteRpcState(ACCOUNT, ADAPTER, undefined);
    answerWriteRpcCall(state, "eth_getTransactionReceipt", [], writeReceipt);
    const above = block("0x12");

    expect(
      answerWriteRpcCall(state, "eth_getTransactionReceipt", [], writeReceipt),
    ).toBe(writeReceipt);
    expect(
      answerWriteRpcCall(state, "eth_getBlockByNumber", ["0x12"], above),
    ).toBe(above);
    expect(state.tampered).toBe(0);
  });
});
