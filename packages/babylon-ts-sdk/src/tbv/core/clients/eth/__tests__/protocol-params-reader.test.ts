import {
  type Abi,
  type AbiFunction,
  type AbiParameter,
  type Address,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
} from "viem";
import { describe, expect, it, vi } from "vitest";

import { ProtocolParamsABI } from "../../../contracts/abis/ProtocolParams.abi";
import { ViemProtocolParamsReader } from "../protocol-params-reader";

const MOCK_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;

const MOCK_TBV_PARAMS = {
  minimumPegInAmount: 100000n,
  maxPegInAmount: 10000000n,
  pegInAckTimeout: 7200n,
  pegInActivationTimeout: 14400n,
  maxHtlcOutputCount: 5,
  expiredPegInGraceBlocks: 100n,
  maxFundingInputCount: 20,
};

const MOCK_TBV_PARAMS_9 = { ...MOCK_TBV_PARAMS, minActivationGas: 5_000_000n };

const MOCK_TBV_PARAMS_6 = {
  minimumPegInAmount: MOCK_TBV_PARAMS.minimumPegInAmount,
  maxPegInAmount: MOCK_TBV_PARAMS.maxPegInAmount,
  pegInAckTimeout: MOCK_TBV_PARAMS.pegInAckTimeout,
  pegInActivationTimeout: MOCK_TBV_PARAMS.pegInActivationTimeout,
  maxHtlcOutputCount: MOCK_TBV_PARAMS.maxHtlcOutputCount,
  expiredPegInGraceBlocks: MOCK_TBV_PARAMS.expiredPegInGraceBlocks,
};

// Makes the getTBVProtocolParams entry of that struct width fail to decode.
const DECODE_FAILS = Symbol("DECODE_FAILS");

class DecodeFailure {
  constructor(readonly width: number) {}
}

function tbvParamsTuple(abi: Abi): AbiParameter & {
  components: readonly AbiParameter[];
} {
  const item = abi.find(
    (i): i is AbiFunction =>
      i.type === "function" && i.name === "getTBVProtocolParams",
  );
  const output = item?.outputs[0];
  if (output === undefined || !("components" in output)) {
    throw new Error("ABI has no getTBVProtocolParams tuple output");
  }
  return output;
}

function tbvParamsWidth(abi: Abi): number {
  return tbvParamsTuple(abi).components.length;
}

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
  maxVpCommissionBps: 500,
  tRefund: 1008,
  tStale: 288,
  minPeginFeeRate: 1n,
  proverCircuitVersion: 1,
  minPrepeginDepth: 6,
};

function createMockPublicClient(overrides?: {
  tbvParams?: unknown;
  tbvParams9?: unknown;
  tbvParams8?: unknown;
  tbvParams6?: unknown;
  offchainParams?: unknown;
  version?: unknown;
  activeVaultCoreVersion?: unknown;
  perVersionOffchainParams?: Map<number, unknown>;
  peginActivationDelay?: unknown;
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
        if (functionName === "peginActivationDelay") {
          // No silent 0n/testnet-default: a deployment that predates the
          // getter must fail the same way viem does — by throwing.
          if (
            overrides === undefined ||
            !("peginActivationDelay" in overrides)
          ) {
            throw new Error(
              'Function "peginActivationDelay" not found on contract',
            );
          }
          return overrides.peginActivationDelay;
        }
        throw new Error(`Unknown function: ${functionName}`);
      },
    ),
    multicall: vi.fn(
      async ({
        contracts,
        allowFailure,
      }: {
        contracts: Array<{
          abi: Abi;
          functionName: string;
          args?: readonly unknown[];
        }>;
        allowFailure: boolean;
        blockNumber?: bigint;
      }) => {
        const results = contracts.map((c) => {
          if (c.functionName === "getTBVProtocolParams") {
            const width = tbvParamsWidth(c.abi);
            const byWidth: Record<number, unknown> = {
              9:
                overrides?.tbvParams9 ??
                overrides?.tbvParams ??
                MOCK_TBV_PARAMS_9,
              8:
                overrides?.tbvParams8 ??
                overrides?.tbvParams ??
                MOCK_TBV_PARAMS,
              6: overrides?.tbvParams6 ?? MOCK_TBV_PARAMS_6,
            };
            if (!(width in byWidth)) {
              throw new Error(`Unexpected getTBVProtocolParams width ${width}`);
            }
            return byWidth[width] === DECODE_FAILS
              ? new DecodeFailure(width)
              : byWidth[width];
          }
          if (c.functionName === "getLatestOffchainParams") {
            return overrides?.offchainParams ?? MOCK_OFFCHAIN_PARAMS;
          }
          if (c.functionName === "latestOffchainParamsVersion") {
            return overrides?.version ?? 3;
          }
          if (c.functionName === "activeVaultCoreVersion") {
            return overrides?.activeVaultCoreVersion ?? 1;
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
        return allowFailure
          ? results.map((result) =>
              result instanceof DecodeFailure
                ? {
                    status: "failure",
                    error: new Error(`decode ${result.width}`),
                  }
                : { status: "success", result },
            )
          : results;
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
    expect(params.minActivationGas).toBe(5_000_000n);
  });

  it("reads minActivationGas when the deployment serves the 9-field struct", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const params = await reader.getTBVProtocolParams();

    expect(params.minActivationGas).toBe(5_000_000n);
    expect(params.maxFundingInputCount).toBe(20);
  });

  it("returns null minActivationGas on a deployment that predates the field", async () => {
    const publicClient = createMockPublicClient({ tbvParams9: DECODE_FAILS });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const params = await reader.getTBVProtocolParams();

    expect(params.minActivationGas).toBeNull();
    expect(params.maxFundingInputCount).toBe(20);
  });

  it("falls back to the 6-field struct with both newer fields null", async () => {
    const publicClient = createMockPublicClient({
      tbvParams9: DECODE_FAILS,
      tbvParams8: DECODE_FAILS,
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const params = await reader.getTBVProtocolParams();

    expect(params.minActivationGas).toBeNull();
    expect(params.maxFundingInputCount).toBeNull();
  });

  it("asks for the 9-field struct before the 8-field one, so the gate is never dropped by a lenient decode", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await reader.getTBVProtocolParams();

    const callArgs = publicClient.multicall.mock.calls[0][0] as {
      contracts: Array<{ abi: Abi; functionName: string }>;
    };
    const widths = callArgs.contracts
      .filter((c) => c.functionName === "getTBVProtocolParams")
      .map((c) => tbvParamsWidth(c.abi));
    expect(widths).toEqual([9, 8, 6]);
  });

  it("passes the block number through to the multicall", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await reader.getTBVProtocolParams(123n);

    expect(publicClient.multicall).toHaveBeenCalledWith(
      expect.objectContaining({ blockNumber: 123n }),
    );
  });

  it("carries minActivationGas into the peg-in configuration", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const config = await reader.getPegInConfiguration();

    expect(config.minActivationGas).toBe(5_000_000n);
  });

  it("reports the most permissive decode's error when every struct width fails", async () => {
    const publicClient = createMockPublicClient({
      tbvParams9: DECODE_FAILS,
      tbvParams8: DECODE_FAILS,
      tbvParams6: DECODE_FAILS,
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getTBVProtocolParams()).rejects.toThrow("decode 6");
  });

  it("viem decodes a 9-word payload under the 8- and 6-field tuples and rejects shorter payloads under wider tuples", () => {
    const tuple9 = tbvParamsTuple(ProtocolParamsABI as Abi);
    const tuple8 = { ...tuple9, components: tuple9.components.slice(0, 8) };
    const tuple6 = { ...tuple9, components: tuple9.components.slice(0, 6) };
    const values8 = { ...MOCK_TBV_PARAMS, peginActivationDelay: 150n };
    const values9 = { ...values8, minActivationGas: 5_000_000n };

    const nineWords = encodeAbiParameters([tuple9], [values9]);
    const eightWords = encodeAbiParameters([tuple8], [values8]);
    const sixWords = encodeAbiParameters([tuple6], [MOCK_TBV_PARAMS_6]);

    expect(decodeAbiParameters([tuple8], nineWords)[0]).toEqual(values8);
    expect(decodeAbiParameters([tuple6], nineWords)[0]).toEqual(
      MOCK_TBV_PARAMS_6,
    );
    expect(() => decodeAbiParameters([tuple9], eightWords)).toThrow();
    expect(() => decodeAbiParameters([tuple8], sixWords)).toThrow();
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
    expect(params.maxVpCommissionBps).toBe(500);
    expect(params.tRefund).toBe(1008);
    expect(params.tStale).toBe(288);
    expect(params.minPeginFeeRate).toBe(1n);
    expect(params.proverCircuitVersion).toBe(1);
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
    expect(config.maxVpCommissionBps).toBe(500);
    expect(config.offchainParams.proverCircuitVersion).toBe(1);
    expect(config.offchainParams.minPrepeginDepth).toBe(6);
    // offchainParamsVersion is paired atomically with offchainParams.
    expect(config.offchainParamsVersion).toBe(3);
    // activeVaultCoreVersion rides the same multicall (atomic with params).
    expect(config.activeVaultCoreVersion).toBe(1);
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
    // The reader produces `offchainParamsVersion` via `Number(results[4])`.
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

  it("getPegInConfiguration throws when activeVaultCoreVersion is 0", async () => {
    // The contract setter rejects 0, so a 0 read means a mis-decoded
    // payload or a pre-vaultCoreVersion contract. Building a graph with a
    // guessed version would strand the deposit — fail closed instead.
    const publicClient = createMockPublicClient({ activeVaultCoreVersion: 0 });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getPegInConfiguration()).rejects.toThrow(
      /Invalid vaultCoreVersion 0 from ProtocolParams.activeVaultCoreVersion/,
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
      "getTBVProtocolParams",
      "getTBVProtocolParams",
      "getLatestOffchainParams",
      "latestOffchainParamsVersion",
      "activeVaultCoreVersion",
    ]);
  });

  it("getPeginActivationDelay returns the delay as a bigint", async () => {
    const publicClient = createMockPublicClient({
      peginActivationDelay: 200n,
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getPeginActivationDelay()).resolves.toBe(200n);
  });

  it("getPeginActivationDelay returns 0 when the window is disabled", async () => {
    const publicClient = createMockPublicClient({ peginActivationDelay: 0n });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getPeginActivationDelay()).resolves.toBe(0n);
  });

  it("getPeginActivationDelay reads standalone, never through the shared multicall", async () => {
    const publicClient = createMockPublicClient({
      peginActivationDelay: 200n,
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await reader.getPeginActivationDelay();

    // getPeginActivationDelay() reads the standalone getter, not the multicall.
    expect(publicClient.multicall).not.toHaveBeenCalled();
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "peginActivationDelay" }),
    );
  });

  it("getPeginActivationDelay throws when the getter is absent, never returning 0", async () => {
    // Predating deployments revert the selector. Treating that as 0n would
    // disable the observation window (fail open) — the class of bug this
    // parameter exists to prevent.
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getPeginActivationDelay()).rejects.toThrow(
      /peginActivationDelay/,
    );
  });

  it("getPeginActivationDelay throws on a non-bigint payload instead of coercing to 0", async () => {
    const publicClient = createMockPublicClient({
      peginActivationDelay: undefined,
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getPeginActivationDelay()).rejects.toThrow(
      /Invalid peginActivationDelay from contract: must be a bigint/,
    );
  });

  it("getPeginActivationDelay throws on a number 0 payload instead of treating the window as disabled", async () => {
    const publicClient = createMockPublicClient({
      peginActivationDelay: 0,
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getPeginActivationDelay()).rejects.toThrow(
      /Invalid peginActivationDelay from contract: must be a bigint/,
    );
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

  it("rejects a maxVpCommissionBps cap of 9, below the registry's 10-bps minimum", async () => {
    const publicClient = createMockPublicClient({
      offchainParams: { ...MOCK_OFFCHAIN_PARAMS, maxVpCommissionBps: 9 },
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getLatestOffchainParams()).rejects.toThrow(
      /maxVpCommissionBps must be in \[10, 10000\), got 9/,
    );
  });

  it("accepts a maxVpCommissionBps cap of 10, the registry's minimum", async () => {
    const publicClient = createMockPublicClient({
      offchainParams: { ...MOCK_OFFCHAIN_PARAMS, maxVpCommissionBps: 10 },
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const params = await reader.getLatestOffchainParams();
    expect(params.maxVpCommissionBps).toBe(10);
  });

  it("accepts a maxVpCommissionBps cap of 9999", async () => {
    const publicClient = createMockPublicClient({
      offchainParams: { ...MOCK_OFFCHAIN_PARAMS, maxVpCommissionBps: 9999 },
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    const params = await reader.getLatestOffchainParams();
    expect(params.maxVpCommissionBps).toBe(9999);
  });

  it("rejects a maxVpCommissionBps cap of 10000", async () => {
    const publicClient = createMockPublicClient({
      offchainParams: { ...MOCK_OFFCHAIN_PARAMS, maxVpCommissionBps: 10000 },
    });
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await expect(reader.getLatestOffchainParams()).rejects.toThrow(
      /maxVpCommissionBps must be in \[10, 10000\), got 10000/,
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

  it("passes correct contract address to the TBV params multicall", async () => {
    const publicClient = createMockPublicClient();
    const reader = new ViemProtocolParamsReader(
      publicClient as never,
      MOCK_ADDRESS,
    );

    await reader.getTBVProtocolParams();

    expect(publicClient.multicall).toHaveBeenCalledWith(
      expect.objectContaining({
        contracts: expect.arrayContaining([
          expect.objectContaining({
            address: MOCK_ADDRESS,
            functionName: "getTBVProtocolParams",
          }),
        ]),
      }),
    );
  });
});
