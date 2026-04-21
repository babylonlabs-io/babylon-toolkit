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

const APP = "0xaaveadapter" as `0x${string}`;
const USER = "0xuser" as `0x${string}`;
const REGISTRY_CAP_POLICY = "0xCapPolicyFromRegistry" as `0x${string}`;
const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;

type QueryModule = typeof import("../query");
let query: QueryModule;

beforeEach(async () => {
  mockReadContract.mockReset();
  mockGetChainId.mockReset();
  // Reset module registry so the internal CapPolicy address cache starts
  // empty for each test without exposing a test-only reset helper.
  vi.resetModules();
  query = await import("../query");
});

describe("getApplicationCap", () => {
  it("resolves CapPolicy via BTCVaultRegistry.capPolicy()", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract
      .mockResolvedValueOnce(REGISTRY_CAP_POLICY)
      .mockResolvedValueOnce({ totalCapBTC: 100n, perAddressCapBTC: 10n });

    const caps = await query.getApplicationCap(APP);

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

    await query.getApplicationCap(APP);
    await query.getApplicationCap(APP);

    const registryCalls = mockReadContract.mock.calls.filter(
      (c) => c[0].functionName === "capPolicy",
    );
    expect(registryCalls).toHaveLength(1);
  });

  it("refetches the CapPolicy address after the cache TTL expires", async () => {
    vi.useFakeTimers();
    try {
      mockGetChainId.mockResolvedValue(11155111);
      mockReadContract
        .mockResolvedValueOnce(REGISTRY_CAP_POLICY)
        .mockResolvedValueOnce({ totalCapBTC: 100n, perAddressCapBTC: 10n })
        .mockResolvedValueOnce(REGISTRY_CAP_POLICY)
        .mockResolvedValueOnce({ totalCapBTC: 100n, perAddressCapBTC: 10n });

      await query.getApplicationCap(APP);

      // TTL is 60s; advance well past it to force a re-fetch.
      vi.advanceTimersByTime(61_000);
      await query.getApplicationCap(APP);

      const registryCalls = mockReadContract.mock.calls.filter(
        (c) => c[0].functionName === "capPolicy",
      );
      expect(registryCalls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws a descriptive error when the registry returns the zero address", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract.mockResolvedValueOnce(ZERO_ADDRESS);

    await expect(query.getApplicationCap(APP)).rejects.toThrow(
      /not configured in BTCVaultRegistry/i,
    );
  });

  it("clears the cached address when the registry read errors so the next call retries", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    const registryError = new Error("rpc unavailable");
    mockReadContract
      .mockRejectedValueOnce(registryError)
      .mockResolvedValueOnce(REGISTRY_CAP_POLICY)
      .mockResolvedValueOnce({ totalCapBTC: 100n, perAddressCapBTC: 10n });

    await expect(query.getApplicationCap(APP)).rejects.toThrow(registryError);
    const caps = await query.getApplicationCap(APP);

    expect(caps).toEqual({ totalCapBTC: 100n, perAddressCapBTC: 10n });
    const registryCalls = mockReadContract.mock.calls.filter(
      (c) => c[0].functionName === "capPolicy",
    );
    expect(registryCalls).toHaveLength(2);
  });
});

describe("getApplicationUsage", () => {
  it("returns total BTC only when no user address is supplied", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract
      .mockResolvedValueOnce(REGISTRY_CAP_POLICY)
      .mockResolvedValueOnce(77n);

    const usage = await query.getApplicationUsage(APP);

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

    const usage = await query.getApplicationUsage(APP, USER);

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
