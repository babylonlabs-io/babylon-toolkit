import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadContract = vi.fn();
const mockGetChainId = vi.fn();
const mockMulticall = vi.fn();

vi.mock("@/clients/eth-contract/client", () => ({
  ethClient: {
    getPublicClient: () => ({
      readContract: mockReadContract,
      getChainId: mockGetChainId,
      multicall: mockMulticall,
    }),
  },
}));

vi.mock("@/config/contracts", () => ({
  CONTRACTS: {
    BTC_VAULT_REGISTRY: "0xBTCVaultRegistry" as `0x${string}`,
  },
}));

const mockLoggerWarn = vi.fn();
vi.mock("@/infrastructure", () => ({
  logger: {
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
  },
}));

const PROTOCOL_PARAMS_ADDRESS = "0xProtocolParams" as `0x${string}`;

const VALID_TBV_PARAMS = {
  minimumPegInAmount: 100_000n,
  maxPegInAmount: 10_000_000n,
  pegInAckTimeout: 100n,
  pegInActivationTimeout: 200n,
  maxHtlcOutputCount: 5,
};

const VALID_OFFCHAIN_PARAMS = {
  timelockAssert: 150n,
  timelockChallengeAssert: 300n,
  securityCouncilKeys: ["0xaa", "0xbb", "0xcc"],
  councilQuorum: 2,
  feeRate: 1000n,
  babeTotalInstances: 3,
  babeInstancesToFinalize: 2,
  minVpCommissionBps: 500,
  tRefund: 144,
  tStale: 288,
  minPeginFeeRate: 1n,
  proverProgramVersion: 1,
  minPrepeginDepth: 6,
};

type QueryModule = typeof import("../query");
let query: QueryModule;

beforeEach(async () => {
  mockReadContract.mockReset();
  mockGetChainId.mockReset();
  mockMulticall.mockReset();
  mockLoggerWarn.mockReset();
  vi.resetModules();
  query = await import("../query");
});

describe("getProtocolParamsAddress cache TTL", () => {
  it("caches the protocol params address for subsequent calls", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract.mockResolvedValue(PROTOCOL_PARAMS_ADDRESS);
    mockMulticall.mockResolvedValue([VALID_TBV_PARAMS, VALID_OFFCHAIN_PARAMS]);

    await query.getPegInConfiguration();
    await query.getPegInConfiguration();

    const registryCalls = mockReadContract.mock.calls.filter(
      (c) => c[0].functionName === "protocolParams",
    );
    expect(registryCalls).toHaveLength(1);
  });

  it("refetches the protocol params address after the cache TTL expires", async () => {
    vi.useFakeTimers();
    try {
      mockGetChainId.mockResolvedValue(11155111);
      mockReadContract.mockResolvedValue(PROTOCOL_PARAMS_ADDRESS);
      mockMulticall.mockResolvedValue([
        VALID_TBV_PARAMS,
        VALID_OFFCHAIN_PARAMS,
      ]);

      await query.getPegInConfiguration();

      // TTL is 5 minutes; advance past it
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      await query.getPegInConfiguration();

      const registryCalls = mockReadContract.mock.calls.filter(
        (c) => c[0].functionName === "protocolParams",
      );
      expect(registryCalls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("getProtocolParamsAddress stale cache fallback", () => {
  it("returns stale cached address when RPC refresh fails", async () => {
    vi.useFakeTimers();
    try {
      mockGetChainId.mockResolvedValue(11155111);
      mockReadContract.mockResolvedValue(PROTOCOL_PARAMS_ADDRESS);
      mockMulticall.mockResolvedValue([
        VALID_TBV_PARAMS,
        VALID_OFFCHAIN_PARAMS,
      ]);

      // First call succeeds and populates the cache
      await query.getPegInConfiguration();

      // Advance past TTL
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Registry read fails, but multicall still works (different contract)
      mockReadContract.mockRejectedValueOnce(new Error("rpc unavailable"));
      mockMulticall.mockResolvedValue([
        VALID_TBV_PARAMS,
        VALID_OFFCHAIN_PARAMS,
      ]);

      // Should succeed using stale cached address
      const config = await query.getPegInConfiguration();
      expect(config.minimumPegInAmount).toBe(100_000n);
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws when RPC fails and there is no cached address", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract.mockRejectedValue(new Error("rpc unavailable"));

    await expect(query.getPegInConfiguration()).rejects.toThrow(
      "rpc unavailable",
    );
  });
});

describe("fetchAllOffchainParams historical validation", () => {
  it("omits invalid historical versions and keeps valid ones", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract
      .mockResolvedValueOnce(PROTOCOL_PARAMS_ADDRESS) // registry lookup
      .mockResolvedValueOnce(2n); // latestVersion

    const invalidParams = { ...VALID_OFFCHAIN_PARAMS, councilQuorum: 0 };
    mockMulticall.mockResolvedValue([invalidParams, VALID_OFFCHAIN_PARAMS]);

    const result = await query.fetchAllOffchainParams();

    expect(result.latestVersion).toBe(2);
    expect(result.byVersion.has(1)).toBe(false);
    expect(result.byVersion.has(2)).toBe(true);
    expect(result.byVersion.get(2)).toEqual(VALID_OFFCHAIN_PARAMS);
  });

  it("logs a warning for invalid historical versions", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract
      .mockResolvedValueOnce(PROTOCOL_PARAMS_ADDRESS)
      .mockResolvedValueOnce(1n);

    const invalidParams = { ...VALID_OFFCHAIN_PARAMS, feeRate: 0n };
    mockMulticall.mockResolvedValue([invalidParams]);

    const result = await query.fetchAllOffchainParams();

    expect(result.byVersion.size).toBe(0);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining("Offchain params v1 failed validation"),
      expect.objectContaining({ category: "protocol-params" }),
    );
  });
});

describe("getPegInConfiguration validation", () => {
  it("throws when contract returns invalid offchain params", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract.mockResolvedValue(PROTOCOL_PARAMS_ADDRESS);
    mockMulticall.mockResolvedValue([
      VALID_TBV_PARAMS,
      { ...VALID_OFFCHAIN_PARAMS, councilQuorum: 0 },
    ]);

    await expect(query.getPegInConfiguration()).rejects.toThrow(
      /councilQuorum must be positive/,
    );
  });

  it("throws when minimumPegInAmount exceeds maxPegInAmount", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract.mockResolvedValue(PROTOCOL_PARAMS_ADDRESS);
    mockMulticall.mockResolvedValue([
      { ...VALID_TBV_PARAMS, minimumPegInAmount: 10n, maxPegInAmount: 5n },
      VALID_OFFCHAIN_PARAMS,
    ]);

    await expect(query.getPegInConfiguration()).rejects.toThrow(
      /maxPegInAmount.*must be >= minimumPegInAmount/,
    );
  });

  it("forwards maxHtlcOutputCount from TBV params", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract.mockReset();
    mockReadContract
      .mockResolvedValueOnce(PROTOCOL_PARAMS_ADDRESS)
      .mockResolvedValueOnce({ ...VALID_TBV_PARAMS, maxHtlcOutputCount: 7 });

    const params = await query.getTBVProtocolParams();
    expect(params.maxHtlcOutputCount).toBe(7);
  });

  it("forwards proverProgramVersion and minPrepeginDepth from offchain params", async () => {
    mockGetChainId.mockResolvedValue(11155111);
    mockReadContract.mockResolvedValue(PROTOCOL_PARAMS_ADDRESS);
    mockMulticall.mockResolvedValue([
      VALID_TBV_PARAMS,
      {
        ...VALID_OFFCHAIN_PARAMS,
        proverProgramVersion: 3,
        minPrepeginDepth: 12,
      },
    ]);

    const config = await query.getPegInConfiguration();
    expect(config.maxHtlcOutputCount).toBe(VALID_TBV_PARAMS.maxHtlcOutputCount);
    expect(config.offchainParams.proverProgramVersion).toBe(3);
    expect(config.offchainParams.minPrepeginDepth).toBe(12);
  });
});
