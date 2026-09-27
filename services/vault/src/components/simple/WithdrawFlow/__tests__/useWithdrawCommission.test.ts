/**
 * Issue #2546: the withdraw review must show the commission the payout
 * deducts — each vault's own frozen rate, read from the registry — and never
 * the protocol-wide minimum.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBtcVaultBasicInfoFromChain } from "@/clients/eth-contract/btc-vault-registry/query";
import { getVaultRegistryReader } from "@/clients/eth-contract/sdk-readers";

import { readWithdrawCommissionSats } from "../useWithdrawCommission";

vi.mock("@/clients/eth-contract/sdk-readers", () => ({
  getVaultRegistryReader: vi.fn(),
}));

vi.mock("@/clients/eth-contract/btc-vault-registry/query", () => ({
  getBtcVaultBasicInfoFromChain: vi.fn(),
}));

const FIRST_VAULT = "0xAAA1";
const SECOND_VAULT = "0xbbb2";

const getProtocolInfoBatch = vi.fn();

beforeEach(() => {
  vi.mocked(getVaultRegistryReader).mockReturnValue({
    getProtocolInfoBatch,
  } as unknown as ReturnType<typeof getVaultRegistryReader>);
});

function mockAmounts(amounts: Record<string, bigint>) {
  vi.mocked(getBtcVaultBasicInfoFromChain).mockResolvedValue(
    new Map(
      Object.entries(amounts).map(([vaultId, amount]) => [
        vaultId.toLowerCase() as `0x${string}`,
        { amount, status: 2, applicationEntryPoint: "0xapp" as `0x${string}` },
      ]),
    ),
  );
}

describe("readWithdrawCommissionSats", () => {
  it("sums the payout commission at each vault's own rate, rounded down per vault", async () => {
    getProtocolInfoBatch.mockResolvedValue([
      { vaultProviderCommissionBps: 500, offchainParamsVersion: 2 },
      { vaultProviderCommissionBps: 300, offchainParamsVersion: 2 },
    ]);
    mockAmounts({ [FIRST_VAULT]: 1_000_000n, [SECOND_VAULT]: 333_333n });

    // 5% of 1_000_000 = 50_000; 3% of 333_333 = 9_999.99 → 9_999.
    await expect(
      readWithdrawCommissionSats([FIRST_VAULT, SECOND_VAULT]),
    ).resolves.toBe(59_999n);
    expect(getProtocolInfoBatch).toHaveBeenCalledWith([
      FIRST_VAULT,
      SECOND_VAULT,
    ]);
  });

  it("fails closed when a registry read fails", async () => {
    getProtocolInfoBatch.mockRejectedValue(new Error("multicall reverted"));
    mockAmounts({ [FIRST_VAULT]: 1_000_000n });

    await expect(readWithdrawCommissionSats([FIRST_VAULT])).rejects.toThrow(
      "multicall reverted",
    );
  });

  it("rejects a rate the payout could never carry", async () => {
    getProtocolInfoBatch.mockResolvedValue([
      { vaultProviderCommissionBps: 10_000, offchainParamsVersion: 2 },
    ]);
    mockAmounts({ [FIRST_VAULT]: 1_000_000n });

    await expect(readWithdrawCommissionSats([FIRST_VAULT])).rejects.toThrow(
      "out of protocol range",
    );
  });
});
