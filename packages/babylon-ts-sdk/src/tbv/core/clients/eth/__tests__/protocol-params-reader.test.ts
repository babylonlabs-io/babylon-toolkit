import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

import { ViemProtocolParamsReader } from "../protocol-params-reader";

const MOCK_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;

const MOCK_TBV_PARAMS = {
  minimumPegInAmount: 100000n,
  maxPegInAmount: 10000000n,
  pegInAckTimeout: 7200n,
  pegInActivationTimeout: 14400n,
  maxHtlcOutputCount: 5,
};

const MOCK_OFFCHAIN_PARAMS = {
  timelockAssert: 150n,
  timelockChallengeAssert: 300n,
  securityCouncilKeys: [
    "0xaaaa000000000000000000000000000000000000000000000000000000000000" as Hex,
    "0xbbbb000000000000000000000000000000000000000000000000000000000000" as Hex,
    "0xcccc000000000000000000000000000000000000000000000000000000000000" as Hex,
  ],
  councilQuorum: 2,
  feeRate: 2n,
  babeTotalInstances: 128,
  babeInstancesToFinalize: 64,
  minVpCommissionBps: 500,
  tRefund: 1008,
  tStale: 288,
  minPeginFeeRate: 1n,
  proverProgramVersion: 1,
  minPrepeginDepth: 6,
};

function createMockPublicClient(overrides?: {
  tbvParams?: unknown;
  offchainParams?: unknown;
  version?: unknown;
  perVersionOffchainParams?: Map<number, unknown>;
}) {
  return {
    readContract: vi.fn(
      async ({
        functionName,
        args,
      }: {
        functionName: string;
        args?: unknown[];
      }) => {
        if (functionName === "getTBVProtocolParams") {
          return overrides?.tbvParams ?? MOCK_TBV_PARAMS;
        }
        if (functionName === "getLatestOffchainParams") {
          return overrides?.offchainParams ?? MOCK_OFFCHAIN_PARAMS;
        }
        if (functionName === "getOffchainParamsByVersion") {
          const v = (args?.[0] as number) ?? 0;
          return (
            overrides?.perVersionOffchainParams?.get(v) ??
            overrides?.offchainParams ??
            MOCK_OFFCHAIN_PARAMS
          );
        }
        if (functionName === "latestOffchainParamsVersion") {
          return overrides?.version ?? 3;
        }
        throw new Error(`Unknown function: ${functionName}`);
      },
    ),
    multicall: vi.fn(
      async ({
        contracts,
      }: {
        contracts: Array<{
          functionName: string;
          args?: readonly unknown[];
        }>;
      }) => {
        return contracts.map((c) => {
          if (c.functionName === "getTBVProtocolParams") {
            return overrides?.tbvParams ?? MOCK_TBV_PARAMS;
          }
          if (c.functionName === "getLatestOffchainParams") {
            return overrides?.offchainParams ?? MOCK_OFFCHAIN_PARAMS;
          }
          if (c.functionName === "latestOffchainParamsVersion") {
            return overrides?.version ?? 3;
          }
          if (c.functionName === "getOffchainParamsByVersion") {
            const v = (c.args?.[0] as number) ?? 0;
            return (
              overrides?.perVersionOffchainParams?.get(v) ??
              overrides?.offchainParams ??
              MOCK_OFFCHAIN_PARAMS
            );
          }
          throw new Error(`Unknown function in multicall: ${c.functionName}`);
        });
      },
    ),
  };
}

describe("ViemProtocolParamsReader", () => {
  it("returns TBV protocol params with correct field mapping", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const params = await reader.getTBVProtocolParams();

    expect(params.minimumPegInAmount).toBe(100000n);
    expect(params.maxPegInAmount).toBe(10000000n);
    expect(params.pegInAckTimeout).toBe(7200n);
    expect(params.pegInActivationTimeout).toBe(14400n);
    expect(params.maxHtlcOutputCount).toBe(5);
  });

  it("returns offchain params with all 13 fields", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const params = await reader.getLatestOffchainParams();

    expect(params.timelockAssert).toBe(150n);
    expect(params.timelockChallengeAssert).toBe(300n);
    expect(params.securityCouncilKeys).toHaveLength(3);
    expect(params.councilQuorum).toBe(2);
    expect(params.feeRate).toBe(2n);
    expect(params.babeTotalInstances).toBe(128);
    expect(params.babeInstancesToFinalize).toBe(64);
    expect(params.minVpCommissionBps).toBe(500);
    expect(params.tRefund).toBe(1008);
    expect(params.tStale).toBe(288);
    expect(params.minPeginFeeRate).toBe(1n);
    expect(params.proverProgramVersion).toBe(1);
    expect(params.minPrepeginDepth).toBe(6);
  });

  it("passes version to getOffchainParamsByVersion", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await reader.getOffchainParamsByVersion(5);

    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "getOffchainParamsByVersion",
        args: [5],
      }),
    );
  });

  it("returns latest offchain params version", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const version = await reader.getLatestOffchainParamsVersion();

    expect(version).toBe(3);
  });

  it("derives timelockPegin from timelockAssert", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const timelockPegin = await reader.getTimelockPeginByVersion(1);

    // timelockAssert = 150n → timelockPegin = 150
    expect(timelockPegin).toBe(150);
  });

  it("getPegInConfiguration uses multicall for atomic reads", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const config = await reader.getPegInConfiguration();

    // Verify multicall was used (single call, not separate readContract calls)
    expect(publicClient.multicall).toHaveBeenCalledTimes(1);
    expect(publicClient.readContract).not.toHaveBeenCalled();

    // Verify combined fields
    expect(config.minimumPegInAmount).toBe(100000n);
    expect(config.maxHtlcOutputCount).toBe(5);
    expect(config.timelockPegin).toBe(150);
    expect(config.timelockRefund).toBe(1008);
    expect(config.minVpCommissionBps).toBe(500);
    expect(config.offchainParams.proverProgramVersion).toBe(1);
    expect(config.offchainParams.minPrepeginDepth).toBe(6);
    // offchainParamsVersion is paired atomically with offchainParams.
    expect(config.offchainParamsVersion).toBe(3);
  });

  it("getLatestOffchainParamsVersion throws on a malformed (non-uint32) payload", async () => {
    // Same hardening as `getPegInConfiguration`, but for the standalone
    // version reader — `fetchAllOffchainParams` consumes this to size its
    // multicall, so a NaN here would silently produce an empty result.
    const publicClient = createMockPublicClient({ version: NaN });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getLatestOffchainParamsVersion()).rejects.toThrow(
      /Invalid offchainParamsVersion from contract/,
    );
  });

  it("getPegInConfiguration throws when the version is not a valid uint32", async () => {
    // The reader produces `offchainParamsVersion` via `Number(results[2])`.
    // If multicall yields a non-integer (e.g. NaN from a malformed
    // payload), the validator must reject it rather than letting NaN
    // propagate into downstream consumers.
    const publicClient = createMockPublicClient({ version: NaN });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getPegInConfiguration()).rejects.toThrow(
      /offchainParamsVersion must be a uint32/,
    );
  });

  it("getPegInConfiguration multicalls TBV params + offchain params + version atomically", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await reader.getPegInConfiguration();

    const callArgs = publicClient.multicall.mock.calls[0][0] as {
      contracts: Array<{ functionName: string }>;
    };
    expect(callArgs.contracts.map((c) => c.functionName)).toEqual([
      "getTBVProtocolParams",
      "getLatestOffchainParams",
      "latestOffchainParamsVersion",
    ]);
  });

  it("getTBVProtocolParams throws on invalid params via the auto-validator", async () => {
    const publicClient = createMockPublicClient({
      tbvParams: { ...MOCK_TBV_PARAMS, minimumPegInAmount: 0n },
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getTBVProtocolParams()).rejects.toThrow(
      /minimumPegInAmount must be positive/,
    );
  });

  it("getLatestOffchainParams throws on invalid params via the auto-validator", async () => {
    const publicClient = createMockPublicClient({
      offchainParams: { ...MOCK_OFFCHAIN_PARAMS, councilQuorum: 0 },
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getLatestOffchainParams()).rejects.toThrow(
      /councilQuorum must be positive/,
    );
  });

  it("fetchAllOffchainParams returns one snapshot per version", async () => {
    const v1 = { ...MOCK_OFFCHAIN_PARAMS, timelockAssert: 100n };
    const v2 = { ...MOCK_OFFCHAIN_PARAMS, timelockAssert: 200n };
    const v3 = { ...MOCK_OFFCHAIN_PARAMS, timelockAssert: 300n };
    const publicClient = createMockPublicClient({
      version: 3,
      perVersionOffchainParams: new Map([
        [1, v1],
        [2, v2],
        [3, v3],
      ]),
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const result = await reader.fetchAllOffchainParams();

    expect(result.latestVersion).toBe(3);
    expect(result.byVersion.size).toBe(3);
    expect(result.byVersion.get(1)?.timelockAssert).toBe(100n);
    expect(result.byVersion.get(2)?.timelockAssert).toBe(200n);
    expect(result.byVersion.get(3)?.timelockAssert).toBe(300n);
  });

  it("fetchAllOffchainParams returns an empty map when latestVersion is 0", async () => {
    const publicClient = createMockPublicClient({ version: 0 });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const result = await reader.fetchAllOffchainParams();

    expect(result.latestVersion).toBe(0);
    expect(result.byVersion.size).toBe(0);
  });

  it("fetchAllOffchainParams skips historical versions that fail validation", async () => {
    const v1 = { ...MOCK_OFFCHAIN_PARAMS, timelockAssert: 100n };
    const v2_bad = { ...MOCK_OFFCHAIN_PARAMS, councilQuorum: 0 };
    const v3 = { ...MOCK_OFFCHAIN_PARAMS, timelockAssert: 300n };
    const publicClient = createMockPublicClient({
      version: 3,
      perVersionOffchainParams: new Map([
        [1, v1],
        [2, v2_bad],
        [3, v3],
      ]),
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const result = await reader.fetchAllOffchainParams();

    expect(result.latestVersion).toBe(3);
    expect(result.byVersion.has(1)).toBe(true);
    expect(result.byVersion.has(2)).toBe(false);
    expect(result.byVersion.has(3)).toBe(true);
  });

  it("fetchAllOffchainParams notifies the optional onSkippedVersion observer", async () => {
    const v1 = { ...MOCK_OFFCHAIN_PARAMS, timelockAssert: 100n };
    const v2_bad = { ...MOCK_OFFCHAIN_PARAMS, councilQuorum: 0 };
    const publicClient = createMockPublicClient({
      version: 2,
      perVersionOffchainParams: new Map([
        [1, v1],
        [2, v2_bad],
      ]),
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const onSkippedVersion = vi.fn();
    await reader.fetchAllOffchainParams(onSkippedVersion);

    expect(onSkippedVersion).toHaveBeenCalledTimes(1);
    expect(onSkippedVersion).toHaveBeenCalledWith(2, expect.any(Error));
    expect(onSkippedVersion.mock.calls[0][1].message).toMatch(
      /councilQuorum must be positive/,
    );
  });

  it("throws when timelockAssert exceeds uint16 max (65535)", async () => {
    const publicClient = createMockPublicClient({
      offchainParams: {
        ...MOCK_OFFCHAIN_PARAMS,
        timelockAssert: 70000n,
      },
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getTimelockPeginByVersion(1)).rejects.toThrow(
      "exceeds uint16 max",
    );
  });

  it("accepts timelockAssert at uint16 max boundary (65535)", async () => {
    const publicClient = createMockPublicClient({
      offchainParams: {
        ...MOCK_OFFCHAIN_PARAMS,
        timelockAssert: 65535n,
      },
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const timelockPegin = await reader.getTimelockPeginByVersion(1);
    expect(timelockPegin).toBe(65535);
  });

  it("passes correct contract address to readContract", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await reader.getTBVProtocolParams();

    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: MOCK_ADDRESS,
        functionName: "getTBVProtocolParams",
      }),
    );
  });
});
