/**
 * Concrete ProtocolParams reader using viem's readContract and multicall.
 *
 * This is an optional utility — callers can use their own implementation
 * of the ProtocolParamsReader interface.
 */

import type { Abi, Address, Hex, PublicClient } from "viem";

import { ProtocolParamsABI } from "../../contracts/abis/ProtocolParams.abi";
import {
  assertValidOffchainParamsVersion,
  validateOffchainParams,
  validatePegInConfiguration,
  validateTBVProtocolParams,
} from "./protocol-params-validation";
import type {
  AllOffchainParamsData,
  OnSkippedOffchainParamsVersion,
  PegInConfiguration,
  ProtocolParamsReader,
  TBVProtocolParams,
  VersionedOffchainParams,
} from "./types";

/**
 * Maximum value for a Solidity uint16.
 * PeginLogic.sol casts timelockAssert to uint16, so values above this are invalid.
 */
const UINT16_MAX = 65535;


/**
 * Raw shape viem returns for VersionedOffchainParams struct.
 * viem resolves ABI struct outputs to named objects (not tuples).
 */
interface RawOffchainParams {
  timelockAssert: bigint;
  timelockChallengeAssert: bigint;
  securityCouncilKeys: readonly Hex[];
  councilQuorum: number;
  feeRate: bigint;
  babeTotalInstances: number;
  babeInstancesToFinalize: number;
  minVpCommissionBps: number;
  tRefund: number;
  tStale: number;
  minPeginFeeRate: bigint;
  proverProgramVersion: number;
  minPrepeginDepth: number;
}

/** Raw shape viem returns for TBVProtocolParams struct. */
interface RawTBVParams {
  minimumPegInAmount: bigint;
  maxPegInAmount: bigint;
  pegInAckTimeout: bigint;
  pegInActivationTimeout: bigint;
  maxHtlcOutputCount: number;
}

/** Map viem struct result to VersionedOffchainParams. */
function mapOffchainParams(result: RawOffchainParams): VersionedOffchainParams {
  return {
    timelockAssert: result.timelockAssert,
    timelockChallengeAssert: result.timelockChallengeAssert,
    securityCouncilKeys: [...result.securityCouncilKeys],
    councilQuorum: result.councilQuorum,
    feeRate: result.feeRate,
    babeTotalInstances: result.babeTotalInstances,
    babeInstancesToFinalize: result.babeInstancesToFinalize,
    minVpCommissionBps: result.minVpCommissionBps,
    tRefund: result.tRefund,
    tStale: result.tStale,
    minPeginFeeRate: result.minPeginFeeRate,
    proverProgramVersion: result.proverProgramVersion,
    minPrepeginDepth: result.minPrepeginDepth,
  };
}

/** Map viem struct result to TBVProtocolParams. */
function mapTBVParams(result: RawTBVParams): TBVProtocolParams {
  return {
    minimumPegInAmount: result.minimumPegInAmount,
    maxPegInAmount: result.maxPegInAmount,
    pegInAckTimeout: result.pegInAckTimeout,
    pegInActivationTimeout: result.pegInActivationTimeout,
    maxHtlcOutputCount: result.maxHtlcOutputCount,
  };
}

/**
 * Derive timelockPegin from timelockAssert.
 *
 * Matches PeginLogic.sol: `uint16(timelockAssert)`.
 * The contract validates `timelockAssert <= type(uint16).max` on write,
 * but we enforce the same bound here to reject invalid values early
 * rather than silently truncating.
 *
 * @throws if timelockAssert exceeds uint16 max (65535)
 */
function deriveTimelockPegin(timelockAssert: bigint): number {
  if (timelockAssert > BigInt(UINT16_MAX)) {
    throw new Error(
      `timelockAssert value ${timelockAssert} exceeds uint16 max (${UINT16_MAX})`,
    );
  }
  return Number(timelockAssert);
}

/**
 * Concrete protocol params reader using viem.
 *
 * Every read method runs the matching validator from
 * `protocol-params-validation` before returning, so callers don't have to
 * remember to validate.
 *
 * Usage:
 * ```ts
 * const reader = new ViemProtocolParamsReader(publicClient, protocolParamsAddress);
 * const config = await reader.getPegInConfiguration();
 * ```
 */
export class ViemProtocolParamsReader implements ProtocolParamsReader {
  constructor(
    private publicClient: PublicClient,
    private contractAddress: Address,
  ) {}

  async getTBVProtocolParams(): Promise<TBVProtocolParams> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "getTBVProtocolParams",
    })) as RawTBVParams;

    const params = mapTBVParams(result);
    validateTBVProtocolParams(params);
    return params;
  }

  async getLatestOffchainParams(): Promise<VersionedOffchainParams> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "getLatestOffchainParams",
    })) as RawOffchainParams;

    const params = mapOffchainParams(result);
    validateOffchainParams(params);
    return params;
  }

  async getOffchainParamsByVersion(
    version: number,
  ): Promise<VersionedOffchainParams> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "getOffchainParamsByVersion",
      args: [version],
    })) as RawOffchainParams;

    const params = mapOffchainParams(result);
    validateOffchainParams(params);
    return params;
  }

  async getLatestOffchainParamsVersion(): Promise<number> {
    const raw = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "latestOffchainParamsVersion",
    });
    const version = Number(raw);
    assertValidOffchainParamsVersion(version);
    return version;
  }

  async getTimelockPeginByVersion(version: number): Promise<number> {
    const params = await this.getOffchainParamsByVersion(version);
    return deriveTimelockPegin(params.timelockAssert);
  }

  /**
   * Read TBV protocol params, latest offchain params, and the latest version
   * label atomically via multicall. The version is paired with the params so
   * that a governance update between separate reads cannot let JS build BTC
   * scripts with version N params while the contract registers the vault
   * under version N+1.
   */
  async getPegInConfiguration(): Promise<PegInConfiguration> {
    const results = await this.publicClient.multicall({
      contracts: [
        {
          address: this.contractAddress,
          abi: ProtocolParamsABI,
          functionName: "getTBVProtocolParams",
        },
        {
          address: this.contractAddress,
          abi: ProtocolParamsABI,
          functionName: "getLatestOffchainParams",
        },
        {
          address: this.contractAddress,
          abi: ProtocolParamsABI,
          functionName: "latestOffchainParamsVersion",
        },
      ],
      allowFailure: false,
    });

    const tbvParams = mapTBVParams(results[0] as RawTBVParams);
    const offchainParams = mapOffchainParams(results[1] as RawOffchainParams);
    const offchainParamsVersion = Number(results[2]);

    const config: PegInConfiguration = {
      minimumPegInAmount: tbvParams.minimumPegInAmount,
      maxPegInAmount: tbvParams.maxPegInAmount,
      pegInAckTimeout: tbvParams.pegInAckTimeout,
      pegInActivationTimeout: tbvParams.pegInActivationTimeout,
      maxHtlcOutputCount: tbvParams.maxHtlcOutputCount,
      timelockPegin: deriveTimelockPegin(offchainParams.timelockAssert),
      timelockRefund: offchainParams.tRefund,
      minVpCommissionBps: offchainParams.minVpCommissionBps,
      offchainParams,
      offchainParamsVersion,
    };

    validatePegInConfiguration(config);
    return config;
  }

  /**
   * Fetch every historical offchain params version in a single multicall.
   * Iterates 1..latestVersion and calls `getOffchainParamsByVersion` for each.
   * Versions whose payload fails validation are skipped (not included in the
   * returned map) so a single bad historical version doesn't block the
   * lookup of the rest.
   *
   * @param onSkippedVersion - optional observer invoked once per skipped
   *   version. Use to log/telemeter without coupling the SDK to a logger.
   */
  async fetchAllOffchainParams(
    onSkippedVersion?: OnSkippedOffchainParamsVersion,
  ): Promise<AllOffchainParamsData> {
    const latestVersion = await this.getLatestOffchainParamsVersion();
    if (latestVersion === 0) {
      return { byVersion: new Map(), latestVersion: 0 };
    }

    const versions = Array.from({ length: latestVersion }, (_, i) => i + 1);
    const contracts = versions.map((v) => ({
      address: this.contractAddress,
      abi: ProtocolParamsABI as Abi,
      functionName: "getOffchainParamsByVersion" as const,
      args: [v] as const,
    }));

    const results = await this.publicClient.multicall({
      contracts,
      allowFailure: false,
    });

    const byVersion = new Map<number, VersionedOffchainParams>();
    for (let i = 0; i < versions.length; i++) {
      const params = mapOffchainParams(results[i] as RawOffchainParams);
      try {
        validateOffchainParams(params);
        byVersion.set(versions[i], params);
      } catch (error) {
        // A malformed historical version mustn't block lookup of the rest.
        // Surface the skip to the caller's observer if one was supplied.
        onSkippedVersion?.(
          versions[i],
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }

    return { byVersion, latestVersion };
  }
}
