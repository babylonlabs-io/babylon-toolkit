import {
  getContractError,
  HttpRequestError,
  RawContractError,
  RpcRequestError,
} from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();
const mockMulticall = vi.fn();

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      readContract: mockReadContract,
      multicall: mockMulticall,
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
const USER = "0xuser" as `0x${string}`;
const REGISTRY_CAP_POLICY = "0xCapPolicyFromRegistry" as `0x${string}`;
const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000" as `0x${string}`;

type QueryModule = typeof import("../query");
let query: QueryModule;

beforeEach(async () => {
  mockReadContract.mockReset();
  mockMulticall.mockReset();
  // Reset module registry so the internal CapPolicy address cache starts
  // empty for each test without exposing a test-only reset helper.
  vi.resetModules();
  query = await import("../query");
});

describe("getApplicationCap", () => {
  it("resolves CapPolicy via BTCVaultRegistry.capPolicy()", async () => {
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
    mockReadContract.mockResolvedValueOnce(ZERO_ADDRESS);

    await expect(query.getApplicationCap(APP)).rejects.toThrow(
      /not configured in BTCVaultRegistry/i,
    );
  });

  it("clears the cached address when the registry read errors so the next call retries", async () => {
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

  it("returns total and user BTC via a single multicall when a user address is supplied", async () => {
    mockReadContract.mockResolvedValueOnce(REGISTRY_CAP_POLICY);
    mockMulticall.mockResolvedValueOnce([50n, 3n]);

    const usage = await query.getApplicationUsage(APP, USER);

    expect(usage).toEqual({ totalBTC: 50n, userBTC: 3n });
    expect(mockMulticall).toHaveBeenCalledTimes(1);
    expect(mockMulticall).toHaveBeenCalledWith(
      expect.objectContaining({
        allowFailure: false,
        contracts: [
          expect.objectContaining({
            address: REGISTRY_CAP_POLICY,
            functionName: "getApplicationTotalBTC",
            args: [APP],
          }),
          expect.objectContaining({
            address: REGISTRY_CAP_POLICY,
            functionName: "getApplicationUserBTC",
            args: [APP, USER],
          }),
        ],
      }),
    );
    // No per-read readContract calls for the usage path when user is set.
    const usageReadContractCalls = mockReadContract.mock.calls.filter(
      (c) =>
        c[0].functionName === "getApplicationTotalBTC" ||
        c[0].functionName === "getApplicationUserBTC",
    );
    expect(usageReadContractCalls).toHaveLength(0);
  });

  it("propagates the multicall error so callers cannot treat a revert as success", async () => {
    mockReadContract.mockResolvedValueOnce(REGISTRY_CAP_POLICY);
    const multicallError = new Error("multicall reverted");
    mockMulticall.mockRejectedValueOnce(multicallError);

    await expect(query.getApplicationUsage(APP, USER)).rejects.toThrow(
      multicallError,
    );
  });
});

describe("getAvailableLiveVaultSlots", () => {
  it("mirrors a two-BTCVault registration: release one matured slot, read, twice, in one multicall", async () => {
    // Each reservation processes one matured release before it checks the
    // cap, and all four calls share one eth_call, so each read sees the
    // releases before it.
    mockReadContract.mockResolvedValueOnce(REGISTRY_CAP_POLICY);
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: undefined },
      { status: "success", result: 1n },
      { status: "success", result: undefined },
      { status: "success", result: 2n },
    ]);

    await query.getAvailableLiveVaultSlots();

    const release = expect.objectContaining({
      address: REGISTRY_CAP_POLICY,
      functionName: "releaseSettledVaults",
      args: [1n],
    });
    const read = expect.objectContaining({
      address: REGISTRY_CAP_POLICY,
      functionName: "getAvailableLiveVaultCapacity",
    });
    expect(mockMulticall).toHaveBeenCalledWith(
      expect.objectContaining({
        allowFailure: true,
        contracts: [release, read, release, read],
      }),
    );
  });

  it("returns the second read when one BTCVault fits", async () => {
    mockReadContract.mockResolvedValueOnce(REGISTRY_CAP_POLICY);
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: undefined },
      { status: "success", result: 1n },
      { status: "success", result: undefined },
      { status: "success", result: 2n },
    ]);

    await expect(query.getAvailableLiveVaultSlots()).resolves.toBe(2n);
  });

  it("returns zero when not even one BTCVault fits, though the second release would free a slot", async () => {
    // A single-vault registration processes only one release, so the slot
    // the second release frees is not one it can take.
    mockReadContract.mockResolvedValueOnce(REGISTRY_CAP_POLICY);
    mockMulticall.mockResolvedValueOnce([
      { status: "success", result: undefined },
      { status: "success", result: 0n },
      { status: "success", result: undefined },
      { status: "success", result: 1n },
    ]);

    await expect(query.getAvailableLiveVaultSlots()).resolves.toBe(0n);
  });

  it("returns null instead of throwing when CapPolicy predates the live-vault cap and every call reverts", async () => {
    mockReadContract.mockResolvedValueOnce(REGISTRY_CAP_POLICY);
    // How viem reports a call that reverts inside the multicall.
    const reverted = getContractError(new RawContractError({ data: "0x" }), {
      abi: [],
      args: [],
      functionName: "getAvailableLiveVaultCapacity",
    });
    mockMulticall.mockResolvedValueOnce([
      { status: "failure", error: reverted, result: undefined },
      { status: "failure", error: reverted, result: undefined },
      { status: "failure", error: reverted, result: undefined },
      { status: "failure", error: reverted, result: undefined },
    ]);

    await expect(query.getAvailableLiveVaultSlots()).resolves.toBeNull();
  });

  it("throws a transport failure instead of returning null", async () => {
    mockReadContract.mockResolvedValueOnce(REGISTRY_CAP_POLICY);
    // With allowFailure, viem reports a failed eth_call as a failure on every
    // call, carrying the transport error.
    const transportError = getContractError(
      new HttpRequestError({ url: "https://rpc.example", status: 503 }),
      { abi: [], args: [], functionName: "aggregate3" },
    );
    mockMulticall.mockResolvedValueOnce([
      { status: "failure", error: transportError, result: undefined },
      { status: "failure", error: transportError, result: undefined },
      { status: "failure", error: transportError, result: undefined },
      { status: "failure", error: transportError, result: undefined },
    ]);

    await expect(query.getAvailableLiveVaultSlots()).rejects.toBe(
      transportError,
    );
  });

  it("throws an RPC internal error on the multicall instead of returning null", async () => {
    mockReadContract.mockResolvedValueOnce(REGISTRY_CAP_POLICY);
    // viem maps a JSON-RPC -32603 reply to the multicall's eth_call to a
    // revert, under the multicall's own name.
    const rpcError = getContractError(
      new RpcRequestError({
        body: {},
        error: { code: -32603, message: "Internal error" },
        url: "https://rpc.example",
      }),
      { abi: [], args: [], functionName: "aggregate3" },
    );
    mockMulticall.mockResolvedValueOnce([
      { status: "failure", error: rpcError, result: undefined },
      { status: "failure", error: rpcError, result: undefined },
      { status: "failure", error: rpcError, result: undefined },
      { status: "failure", error: rpcError, result: undefined },
    ]);

    await expect(query.getAvailableLiveVaultSlots()).rejects.toBe(rpcError);
  });
});
