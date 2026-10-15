import { toEventSelector, type TransactionReceipt } from "viem";
import { describe, expect, it } from "vitest";

import { isProposalExecution, readSafeExecution } from "../safeExecution";

const SAFE = "0xAbCdEf0000000000000000000000000000000002";
const OTHER_CONTRACT = "0x3000000000000000000000000000000000000003";
/** The account that sent the transaction executing the Safe's proposal. */
const EXECUTOR = "0x4000000000000000000000000000000000000004";
const EXECUTION_TX =
  "0x7777777777777777777777777777777777777777777777777777777777777777";
const PROPOSAL =
  "0x5555555555555555555555555555555555555555555555555555555555555555";
const OTHER_PROPOSAL =
  "0x6666666666666666666666666666666666666666666666666666666666666666";
const PAYMENT_WORD = "00".repeat(32);
const SUCCESS = toEventSelector("ExecutionSuccess(bytes32,uint256)");
const FAILURE = toEventSelector("ExecutionFailure(bytes32,uint256)");
const LEGACY_FAILURE = toEventSelector("ExecutionFailed(bytes32)");

/** The executor's transaction that executed a proposal, with these logs. */
function receiptWith(
  logs: { address: string; topics: string[]; data: string }[],
): TransactionReceipt {
  return {
    logs,
    transactionHash: EXECUTION_TX,
    from: EXECUTOR,
  } as unknown as TransactionReceipt;
}

describe("readSafeExecution", () => {
  it("reads a success for the proposal named in an indexed topic", () => {
    const receipt = receiptWith([
      { address: SAFE, topics: [SUCCESS, PROPOSAL], data: `0x${PAYMENT_WORD}` },
    ]);

    expect(readSafeExecution(receipt, SAFE, PROPOSAL)).toBe("succeeded");
  });

  it("reads a failure for the proposal named in the first data word, as older Safes log it", () => {
    const receipt = receiptWith([
      {
        address: SAFE.toLowerCase(),
        topics: [FAILURE],
        data: `${PROPOSAL}${PAYMENT_WORD}`,
      },
    ]);

    expect(readSafeExecution(receipt, SAFE, PROPOSAL)).toBe("failed");
  });

  it("reads a failure from Safe v1.0.0's ExecutionFailed log, the proposal in its data", () => {
    const receipt = receiptWith([
      { address: SAFE, topics: [LEGACY_FAILURE], data: PROPOSAL },
    ]);

    expect(readSafeExecution(receipt, SAFE, PROPOSAL)).toBe("failed");
  });

  it("reads none when the receipt holds no execution log from the Safe", () => {
    const receipt = receiptWith([
      { address: OTHER_CONTRACT, topics: [FAILURE, PROPOSAL], data: "0x" },
    ]);

    expect(readSafeExecution(receipt, SAFE, PROPOSAL)).toBe("none");
  });

  it("reads unknown when the Safe's execution log names another proposal", () => {
    const receipt = receiptWith([
      {
        address: SAFE,
        topics: [SUCCESS, OTHER_PROPOSAL],
        data: `0x${PAYMENT_WORD}`,
      },
    ]);

    expect(readSafeExecution(receipt, SAFE, PROPOSAL)).toBe("unknown");
  });

  it("reads the Safe's execution log in the wallet's own transaction, though it names a proposal hash the wallet never returned", () => {
    const receipt = receiptWith([
      {
        address: SAFE,
        topics: [FAILURE, OTHER_PROPOSAL],
        data: `0x${PAYMENT_WORD}`,
      },
    ]);

    expect(readSafeExecution(receipt, SAFE, EXECUTION_TX)).toBe("failed");
  });
});

describe("isProposalExecution", () => {
  it("counts a transaction another account sent, reached from the proposal hash, as a proposal's execution", () => {
    const receipt = receiptWith([]);

    expect(isProposalExecution(receipt, SAFE, PROPOSAL)).toBe(true);
  });

  it("does not count the transaction whose hash the wallet returned", () => {
    const receipt = receiptWith([]);

    expect(isProposalExecution(receipt, SAFE, EXECUTION_TX)).toBe(false);
  });

  it("does not count a speed-up the account sent itself under another hash", () => {
    const receipt: TransactionReceipt = { ...receiptWith([]), from: SAFE };

    expect(isProposalExecution(receipt, SAFE, PROPOSAL)).toBe(false);
  });
});
