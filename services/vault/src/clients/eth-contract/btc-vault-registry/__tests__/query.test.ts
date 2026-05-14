/**
 * Tests for getBtcVaultBasicInfoFromChain — the on-chain per-vault basic
 * info multicall used by the reorder integrity guard.
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

const mockMulticall = vi.fn();
vi.mock("../../client", () => ({
  ethClient: {
    getPublicClient: () => ({ multicall: mockMulticall }),
  },
}));

import { getBtcVaultBasicInfoFromChain } from "../query";

const VAULT_A =
  "0xaaaa000000000000000000000000000000000000000000000000000000000001" as Hex;
const VAULT_B =
  "0xbbbb000000000000000000000000000000000000000000000000000000000002" as Hex;
const DEPOSITOR = "0x000000000000000000000000000000000000beef" as Address;
const AAVE_ADAPTER = "0x000000000000000000000000000000000000ada9" as Address;

describe("getBtcVaultBasicInfoFromChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns amount, status, and applicationEntryPoint keyed by lowercased vault ID", async () => {
    mockMulticall.mockResolvedValue([
      {
        depositor: DEPOSITOR,
        amount: 60_000_000n,
        status: 2,
        applicationEntryPoint: AAVE_ADAPTER,
      },
      {
        depositor: DEPOSITOR,
        amount: 10_000_000n,
        status: 2,
        applicationEntryPoint: AAVE_ADAPTER,
      },
    ]);

    const result = await getBtcVaultBasicInfoFromChain([VAULT_A, VAULT_B]);

    const a = result.get(VAULT_A.toLowerCase() as Hex);
    expect(a).toEqual({
      amount: 60_000_000n,
      status: 2,
      applicationEntryPoint: AAVE_ADAPTER,
    });
    const b = result.get(VAULT_B.toLowerCase() as Hex);
    expect(b).toEqual({
      amount: 10_000_000n,
      status: 2,
      applicationEntryPoint: AAVE_ADAPTER,
    });
    expect(mockMulticall).toHaveBeenCalledTimes(1);
    const call = mockMulticall.mock.calls[0][0] as {
      contracts: Array<{ functionName: string; args: readonly Hex[] }>;
      allowFailure: boolean;
    };
    expect(call.allowFailure).toBe(false);
    expect(call.contracts).toHaveLength(2);
    expect(call.contracts[0].functionName).toBe("getBtcVaultBasicInfo");
    expect(call.contracts[0].args).toEqual([VAULT_A]);
  });

  it("returns an empty map and skips RPC when no vault IDs are supplied", async () => {
    const result = await getBtcVaultBasicInfoFromChain([]);

    expect(result.size).toBe(0);
    expect(mockMulticall).not.toHaveBeenCalled();
  });

  it("throws when any returned vault has a zero depositor (unregistered)", async () => {
    mockMulticall.mockResolvedValue([
      {
        depositor: DEPOSITOR,
        amount: 60_000_000n,
        status: 2,
        applicationEntryPoint: AAVE_ADAPTER,
      },
      {
        depositor: zeroAddress,
        amount: 0n,
        status: 0,
        applicationEntryPoint: zeroAddress,
      },
    ]);

    await expect(
      getBtcVaultBasicInfoFromChain([VAULT_A, VAULT_B]),
    ).rejects.toThrow(/not registered on-chain/);
  });
});
