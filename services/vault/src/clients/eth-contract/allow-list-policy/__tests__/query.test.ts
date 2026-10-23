import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      readContract: mockReadContract,
      chain: { id: 11155111 },
    }),
  },
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xBTCVaultRegistry" as `0x${string}`,
  },
}));

const APP = "0xaaveadapter" as `0x${string}`;
const DEPOSITOR = "0xdepositor" as `0x${string}`;
const REGISTRY_ALLOW_LIST_POLICY =
  "0xAllowListPolicyFromRegistry" as `0x${string}`;
const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;

type QueryModule = typeof import("../query");
let query: QueryModule;

beforeEach(async () => {
  mockReadContract.mockReset();
  // Reset module registry so the internal AllowListPolicy address cache
  // starts empty for each test without exposing a test-only reset helper.
  vi.resetModules();
  query = await import("../query");
});

const registryCalls = () =>
  mockReadContract.mock.calls.filter(
    (c) => c[0].functionName === "allowListPolicy",
  );

describe("readDepositorAllowed", () => {
  it("asks the registry's AllowListPolicy whether the depositor may deposit into the application", async () => {
    mockReadContract
      .mockResolvedValueOnce(REGISTRY_ALLOW_LIST_POLICY)
      .mockResolvedValueOnce(false);

    const allowed = await query.readDepositorAllowed({
      applicationEntryPoint: APP,
      depositor: DEPOSITOR,
    });

    expect(allowed).toBe(false);
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: "0xBTCVaultRegistry",
        functionName: "allowListPolicy",
      }),
    );
    expect(mockReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: REGISTRY_ALLOW_LIST_POLICY,
        functionName: "checkAllowed",
        args: [APP, DEPOSITOR],
      }),
    );
  });

  it("caches the resolved AllowListPolicy address so repeat reads skip the registry", async () => {
    mockReadContract
      .mockResolvedValueOnce(REGISTRY_ALLOW_LIST_POLICY)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await query.readDepositorAllowed({
      applicationEntryPoint: APP,
      depositor: DEPOSITOR,
    });
    await query.readDepositorAllowed({
      applicationEntryPoint: APP,
      depositor: DEPOSITOR,
    });

    expect(registryCalls()).toHaveLength(1);
  });

  it("re-reads the AllowListPolicy address after the cache TTL expires", async () => {
    vi.useFakeTimers();
    try {
      mockReadContract
        .mockResolvedValueOnce(REGISTRY_ALLOW_LIST_POLICY)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(REGISTRY_ALLOW_LIST_POLICY)
        .mockResolvedValueOnce(true);

      await query.readDepositorAllowed({
        applicationEntryPoint: APP,
        depositor: DEPOSITOR,
      });
      // TTL is 60s; advance well past it to force a re-fetch.
      vi.advanceTimersByTime(61_000);
      await query.readDepositorAllowed({
        applicationEntryPoint: APP,
        depositor: DEPOSITOR,
      });

      expect(registryCalls()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws a descriptive error when the registry returns the zero address", async () => {
    mockReadContract.mockResolvedValueOnce(ZERO_ADDRESS);

    await expect(
      query.readDepositorAllowed({
        applicationEntryPoint: APP,
        depositor: DEPOSITOR,
      }),
    ).rejects.toThrow(/not configured in BTCVaultRegistry/i);
  });

  it("clears the cached address when the registry read errors so the next call retries", async () => {
    const registryError = new Error("rpc unavailable");
    mockReadContract
      .mockRejectedValueOnce(registryError)
      .mockResolvedValueOnce(REGISTRY_ALLOW_LIST_POLICY)
      .mockResolvedValueOnce(true);

    await expect(
      query.readDepositorAllowed({
        applicationEntryPoint: APP,
        depositor: DEPOSITOR,
      }),
    ).rejects.toThrow(registryError);
    const allowed = await query.readDepositorAllowed({
      applicationEntryPoint: APP,
      depositor: DEPOSITOR,
    });

    expect(allowed).toBe(true);
    expect(registryCalls()).toHaveLength(2);
  });

  it("propagates a failed allow-list read so the caller decides how to fail", async () => {
    const readError = new Error("checkAllowed reverted");
    mockReadContract
      .mockResolvedValueOnce(REGISTRY_ALLOW_LIST_POLICY)
      .mockRejectedValueOnce(readError);

    await expect(
      query.readDepositorAllowed({
        applicationEntryPoint: APP,
        depositor: DEPOSITOR,
      }),
    ).rejects.toThrow(readError);
  });
});
