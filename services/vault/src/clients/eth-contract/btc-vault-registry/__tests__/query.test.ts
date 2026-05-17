/**
 * Tests for getBtcVaultBasicInfoFromChain — the per-vault basic info
 * lookup used by the reorder integrity guard.
 */

import type { Address, Hex } from "viem";
import { zeroAddress } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/config/env", () => ({
  ENV: {
    BTC_VAULT_REGISTRY: "0x1234567890123456789012345678901234567890",
    AAVE_ADAPTER: "0x1234567890123456789012345678901234567890",
    GRAPHQL_ENDPOINT: "https://test.example.com/graphql",
  },
}));

const mockGetVaultBasicInfo = vi.fn();
vi.mock("../../sdk-readers", () => ({
  getVaultRegistryReader: () => ({
    getVaultBasicInfo: mockGetVaultBasicInfo,
  }),
}));

import { getBtcVaultBasicInfoFromChain } from "../query";

const VAULT_A =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001" as Hex;
const VAULT_B =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002" as Hex;
const DEPOSITOR = "0x000000000000000000000000000000000000beef" as Address;
const AAVE_ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;

function basicInfo(amount: bigint) {
  return {
    depositor: DEPOSITOR,
    depositorBtcPubKey: ("0x" + "0".repeat(64)) as Hex,
    amount,
    vaultProvider: ("0x" + "1".repeat(40)) as Address,
    status: 2,
    applicationEntryPoint: AAVE_ADAPTER,
    createdAt: 0n,
  };
}

describe("getBtcVaultBasicInfoFromChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns amount, status, and applicationEntryPoint keyed by lowercased vault ID", async () => {
    mockGetVaultBasicInfo.mockImplementation(async (vaultId: Hex) => {
      if (vaultId === VAULT_A) return basicInfo(60_000_000n);
      if (vaultId === VAULT_B) return basicInfo(10_000_000n);
      throw new Error(`unexpected vault ${vaultId}`);
    });

    const result = await getBtcVaultBasicInfoFromChain([VAULT_A, VAULT_B]);

    expect(result.get(VAULT_A.toLowerCase() as Hex)).toEqual({
      amount: 60_000_000n,
      status: 2,
      applicationEntryPoint: AAVE_ADAPTER,
    });
    expect(result.get(VAULT_B.toLowerCase() as Hex)).toEqual({
      amount: 10_000_000n,
      status: 2,
      applicationEntryPoint: AAVE_ADAPTER,
    });
    expect(mockGetVaultBasicInfo).toHaveBeenCalledTimes(2);
    expect(mockGetVaultBasicInfo).toHaveBeenNthCalledWith(1, VAULT_A);
    expect(mockGetVaultBasicInfo).toHaveBeenNthCalledWith(2, VAULT_B);
  });

  it("returns an empty map and skips RPC when no vault IDs are supplied", async () => {
    const result = await getBtcVaultBasicInfoFromChain([]);

    expect(result.size).toBe(0);
    expect(mockGetVaultBasicInfo).not.toHaveBeenCalled();
  });

  it("throws when any returned vault has a zero depositor (unregistered)", async () => {
    mockGetVaultBasicInfo.mockImplementation(async (vaultId: Hex) => {
      if (vaultId === VAULT_A) return basicInfo(60_000_000n);
      if (vaultId === VAULT_B) {
        return {
          ...basicInfo(0n),
          depositor: zeroAddress,
          applicationEntryPoint: zeroAddress,
          status: 0,
        };
      }
      throw new Error(`unexpected vault ${vaultId}`);
    });

    await expect(
      getBtcVaultBasicInfoFromChain([VAULT_A, VAULT_B]),
    ).rejects.toThrow(/not registered on-chain/);
  });
});
