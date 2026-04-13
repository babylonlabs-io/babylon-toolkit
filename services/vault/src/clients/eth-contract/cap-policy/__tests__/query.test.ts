import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();
const mockGetChainId = vi.fn();

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      readContract: mockReadContract,
      getChainId: mockGetChainId,
    }),
  },
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xBTCVaultRegistry" as `0x${string}`,
  },
}));

import {
  __resetCapPolicyAddressCacheForTests,
  getApplicationCap,
  getApplicationUsage,
} from "../query";

const APP = "0xaaveadapter" as `0x${string}`;
const USER = "0xuser" as `0x${string}`;
const REGISTRY_CAP_POLICY = "0xCapPolicyFromRegistry" as `0x${string}`;

beforeEach(() => {
  mockReadContract.mockReset();
  mockGetChainId.mockReset();
  __resetCapPolicyAddressCacheForTests();
});

describe("getApplicationCap", () => {
  it("resolves CapPolicy via BTCVaultRegistry.capPolicy()", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract
      .mockResolvedValueOnce(REGISTRY_CAP_POLICY)
      .mockResolvedValueOnce({ totalCapBTC: 100n, perAddressCapBTC: 10n });

    const caps = await getApplicationCap(APP);

    expect(caps).toEqual({ totalCapBTC: 100n, perAddressCapBTC: 10n });
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xBTCVaultRegistry",
        functionName: "capPolicy",
      }),
    );
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: REGISTRY_CAP_POLICY,
        functionName: "getApplicationCaps",
        args: [APP],
      }),
    );
  });

  it("caches the resolved CapPolicy address per chain so repeat calls skip registry reads", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract
      .mockResolvedValueOnce(REGISTRY_CAP_POLICY)
      .mockResolvedValueOnce({ totalCapBTC: 100n, perAddressCapBTC: 10n })
      .mockResolvedValueOnce({ totalCapBTC: 100n, perAddressCapBTC: 10n });

    await getApplicationCap(APP);
    await getApplicationCap(APP);

    const registryCalls = mockReadContract.mock.calls.filter(
      (c) => c[0].functionName === "capPolicy",
    );
    expect(registryCalls).toHaveLength(1);
  });
});

describe("getApplicationUsage", () => {
  it("returns total BTC only when no user address is supplied", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract
      .mockResolvedValueOnce(REGISTRY_CAP_POLICY)
      .mockResolvedValueOnce(77n);

    const usage = await getApplicationUsage(APP);

    expect(usage).toEqual({ totalBTC: 77n, userBTC: null });
    const userCalls = mockReadContract.mock.calls.filter(
      (c) => c[0].functionName === "getApplicationUserBTC",
    );
    expect(userCalls).toHaveLength(0);
  });

  it("returns total and user BTC when a user address is supplied", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract
      .mockResolvedValueOnce(REGISTRY_CAP_POLICY)
      .mockResolvedValueOnce(50n)
      .mockResolvedValueOnce(3n);

    const usage = await getApplicationUsage(APP, USER);

    expect(usage).toEqual({ totalBTC: 50n, userBTC: 3n });
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: REGISTRY_CAP_POLICY,
        functionName: "getApplicationUserBTC",
        args: [APP, USER],
      }),
    );
  });
});
