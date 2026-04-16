/**
 * Concrete ProtocolParams reader using viem's readContract and multicall.
 *
 * This is an optional utility — callers can use their own implementation
 * of the ProtocolParamsReader interface.
 */

import type { Address, Hex, PublicClient } from "viem";

import { ProtocolParamsABI } from "../../contracts/abis/ProtocolParams.abi";
import type {
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

    return mapTBVParams(result);
  }

  async getLatestOffchainParams(): Promise<VersionedOffchainParams> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "getLatestOffchainParams",
    })) as RawOffchainParams;

    return mapOffchainParams(result);
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

    return mapOffchainParams(result);
  }

  async getLatestOffchainParamsVersion(): Promise<number> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "latestOffchainParamsVersion",
    })) as number;

    return result;
  }

  async getTimelockPeginByVersion(version: number): Promise<number> {
    const params = await this.getOffchainParamsByVersion(version);
    return deriveTimelockPegin(params.timelockAssert);
  }

  /**
   * Read TBV protocol params and latest offchain params atomically via multicall.
   * Prevents TOCTOU inconsistency if governance updates params between reads.
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
      ],
      allowFailure: false,
    });

    const tbvParams = mapTBVParams(results[0] as RawTBVParams);
    const offchainParams = mapOffchainParams(results[1] as RawOffchainParams);

    return {
      minimumPegInAmount: tbvParams.minimumPegInAmount,
      maxPegInAmount: tbvParams.maxPegInAmount,
      pegInAckTimeout: tbvParams.pegInAckTimeout,
      pegInActivationTimeout: tbvParams.pegInActivationTimeout,
      maxHtlcOutputCount: tbvParams.maxHtlcOutputCount,
      timelockPegin: deriveTimelockPegin(offchainParams.timelockAssert),
      timelockRefund: offchainParams.tRefund,
      minVpCommissionBps: offchainParams.minVpCommissionBps,
      offchainParams,
    };
  }
}
