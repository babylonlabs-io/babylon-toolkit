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
  ],
  councilQuorum: 3,
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
}) {
  return {
    readContract: vi.fn(
      async ({
        functionName,
      }: {
        functionName: string;
        args?: unknown[];
      }) => {
        if (functionName === "getTBVProtocolParams") {
          return overrides?.tbvParams ?? MOCK_TBV_PARAMS;
        }
        if (
          functionName === "getLatestOffchainParams" ||
          functionName === "getOffchainParamsByVersion"
        ) {
          return overrides?.offchainParams ?? MOCK_OFFCHAIN_PARAMS;
        }
        if (functionName === "latestOffchainParamsVersion") {
          return overrides?.version ?? 3;
        }
        throw new Error(`Unknown function: ${functionName}`);
      },
    ),
    multicall: vi.fn(async () => [
      overrides?.tbvParams ?? MOCK_TBV_PARAMS,
      overrides?.offchainParams ?? MOCK_OFFCHAIN_PARAMS,
    ]),
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
    expect(params.securityCouncilKeys).toHaveLength(1);
    expect(params.councilQuorum).toBe(3);
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

    // Verify multicall was used (single call, not two separate readContract calls)
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
