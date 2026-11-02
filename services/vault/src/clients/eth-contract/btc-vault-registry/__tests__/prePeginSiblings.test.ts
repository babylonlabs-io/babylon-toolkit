import type { Address, Hex } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { isVaultRecordEmptyError } from "@/utils/errors/vaultRecordEmpty";

import { getPrePeginSiblingIdsFromChain } from "../prePeginSiblings";

const { mockGetDepositorVaultIds, mockGetProtocolInfoBatch, mockResolveBlock } =
  vi.hoisted(() => ({
    mockGetDepositorVaultIds: vi.fn(),
    mockGetProtocolInfoBatch: vi.fn(),
    mockResolveBlock: vi.fn(),
  }));

vi.mock("../depositorVaultIds", () => ({
  getDepositorVaultIdsFromChain: mockGetDepositorVaultIds,
}));
vi.mock("../../pinnedReadBlock", () => ({
  resolvePinnedReadBlock: mockResolveBlock,
}));
vi.mock("../../sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getProtocolInfoBatch: mockGetProtocolInfoBatch,
  }),
}));

const PINNED_BLOCK = 1_000n;
const DEPOSITOR = `0x${"ab".repeat(20)}` as Address;
const PRE_PEGIN_TX_HASH = `0x${"12".repeat(32)}` as Hex;
const OTHER_PRE_PEGIN_TX_HASH = `0x${"34".repeat(32)}` as Hex;
const TARGET_ID = `0x${"aa".repeat(32)}` as Hex;
const SIBLING_ID = `0x${"bb".repeat(32)}` as Hex;
const UNRELATED_ID = `0x${"cc".repeat(32)}` as Hex;
const TARGET = { depositor: DEPOSITOR, prePeginTxHash: PRE_PEGIN_TX_HASH };

describe("getPrePeginSiblingIdsFromChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveBlock.mockResolvedValue(PINNED_BLOCK);
  });

  it("reads the depositor's vault list and the candidates' protocol info at one pinned block", async () => {
    mockGetDepositorVaultIds.mockResolvedValue([TARGET_ID, SIBLING_ID]);
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: PRE_PEGIN_TX_HASH },
    ]);

    await getPrePeginSiblingIdsFromChain(TARGET_ID, TARGET);

    expect(mockResolveBlock).toHaveBeenCalledOnce();
    expect(mockGetDepositorVaultIds).toHaveBeenCalledWith(
      DEPOSITOR,
      PINNED_BLOCK,
    );
    expect(mockGetProtocolInfoBatch).toHaveBeenCalledWith(
      [SIBLING_ID],
      PINNED_BLOCK,
    );
  });

  it("returns only registered vaults sharing the target's Pre-PegIn, excluding the target whatever its case", async () => {
    mockGetDepositorVaultIds.mockResolvedValue([
      TARGET_ID.toUpperCase().replace("0X", "0x"),
      SIBLING_ID,
      UNRELATED_ID,
    ]);
    mockGetProtocolInfoBatch.mockResolvedValue([
      { prePeginTxHash: PRE_PEGIN_TX_HASH },
      { prePeginTxHash: OTHER_PRE_PEGIN_TX_HASH },
    ]);

    await expect(
      getPrePeginSiblingIdsFromChain(TARGET_ID, TARGET),
    ).resolves.toEqual([SIBLING_ID]);
  });

  it("refuses as still-confirming when the pinned list does not include the target", async () => {
    mockGetDepositorVaultIds.mockResolvedValue([SIBLING_ID]);

    const refusal = await getPrePeginSiblingIdsFromChain(
      TARGET_ID,
      TARGET,
    ).catch((err: unknown) => err);

    expect(isVaultRecordEmptyError(refusal)).toBe(true);
    expect(mockGetProtocolInfoBatch).not.toHaveBeenCalled();
  });

  it("rejects when a listed vault's protocol info cannot be read, rather than dropping it", async () => {
    mockGetDepositorVaultIds.mockResolvedValue([TARGET_ID, SIBLING_ID]);
    mockGetProtocolInfoBatch.mockRejectedValue(new Error("rpc unavailable"));

    await expect(
      getPrePeginSiblingIdsFromChain(TARGET_ID, TARGET),
    ).rejects.toThrow("rpc unavailable");
  });
});
