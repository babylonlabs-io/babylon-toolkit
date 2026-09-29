/**
 * Concrete signer-set readers for vault keepers and universal challengers.
 *
 * These are optional utilities — callers can use their own implementations
 * of the VaultKeeperReader and UniversalChallengerReader interfaces.
 */

import type { Address, Hex, PublicClient } from "viem";

import { ApplicationRegistryABI } from "../../contracts/abis/ApplicationRegistry.abi";
import { ProtocolParamsABI } from "../../contracts/abis/ProtocolParams.abi";
import type {
  AddressBTCKeyPair,
  UniversalChallengerReader,
  VaultKeeperReader,
} from "./types";

/** Map viem tuple array to AddressBTCKeyPair[]. */
function mapKeyPairs(
  result: readonly { ethAddress: Address; btcPubKey: Hex }[],
): AddressBTCKeyPair[] {
  return result.map((pair) => ({
    ethAddress: pair.ethAddress,
    btcPubKey: pair.btcPubKey,
  }));
}

/**
 * Both key-epoch getters return `uint64` and feed the peg-in config
 * fingerprint, where the contract encodes them as `uint64`. A `Number`
 * narrowing would silently truncate above 2^53 and produce a fingerprint the
 * registry cannot reproduce, so the payload is asserted to be a `bigint` and
 * carried as one — never coerced, never defaulted.
 */
function assertKeyEpoch(raw: unknown, label: string): bigint {
  if (typeof raw !== "bigint") {
    throw new Error(
      `Invalid ${label} from contract: must be a bigint, got ${typeof raw}`,
    );
  }
  return raw;
}

/**
 * Reads vault keepers from the ApplicationRegistry contract.
 *
 * Usage:
 * ```ts
 * const reader = new ViemVaultKeeperReader(publicClient, applicationRegistryAddress);
 * const keepers = await reader.getCurrentVaultKeepers(appEntryPoint);
 * ```
 */
export class ViemVaultKeeperReader implements VaultKeeperReader {
  constructor(
    private publicClient: PublicClient,
    private contractAddress: Address,
  ) {}

  async getVaultKeepersByVersion(
    appEntryPoint: Address,
    version: number,
    blockNumber?: bigint,
  ): Promise<AddressBTCKeyPair[]> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ApplicationRegistryABI,
      functionName: "getVaultKeepersByVersion",
      args: [appEntryPoint, version],
      blockNumber,
    })) as readonly { ethAddress: Address; btcPubKey: Hex }[];

    return mapKeyPairs(result);
  }

  async getCurrentVaultKeepers(
    appEntryPoint: Address,
  ): Promise<AddressBTCKeyPair[]> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ApplicationRegistryABI,
      functionName: "getCurrentVaultKeepers",
      args: [appEntryPoint],
    })) as readonly { ethAddress: Address; btcPubKey: Hex }[];

    return mapKeyPairs(result);
  }

  async getCurrentVaultKeepersVersion(
    appEntryPoint: Address,
    blockNumber?: bigint,
  ): Promise<number> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ApplicationRegistryABI,
      functionName: "getCurrentVaultKeepersVersion",
      args: [appEntryPoint],
      blockNumber,
    })) as number;

    return result;
  }

  async getCurrentAppKeeperKeyEpoch(
    appEntryPoint: Address,
    blockNumber?: bigint,
  ): Promise<bigint> {
    const raw: unknown = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ApplicationRegistryABI,
      functionName: "appKeeperKeyEpochCurrent",
      args: [appEntryPoint],
      blockNumber,
    });

    return assertKeyEpoch(raw, "appKeeperKeyEpochCurrent");
  }
}

/**
 * Reads universal challengers from the ProtocolParams contract.
 *
 * Usage:
 * ```ts
 * const reader = new ViemUniversalChallengerReader(publicClient, protocolParamsAddress);
 * const challengers = await reader.getCurrentUniversalChallengers();
 * ```
 */
export class ViemUniversalChallengerReader implements UniversalChallengerReader {
  constructor(
    private publicClient: PublicClient,
    private contractAddress: Address,
  ) {}

  async getUniversalChallengersByVersion(
    version: number,
    blockNumber?: bigint,
  ): Promise<AddressBTCKeyPair[]> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "getUniversalChallengersByVersion",
      args: [version],
      blockNumber,
    })) as readonly { ethAddress: Address; btcPubKey: Hex }[];

    return mapKeyPairs(result);
  }

  async getCurrentUniversalChallengers(): Promise<AddressBTCKeyPair[]> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "getCurrentUniversalChallengers",
    })) as readonly { ethAddress: Address; btcPubKey: Hex }[];

    return mapKeyPairs(result);
  }

  async getLatestUniversalChallengersVersion(
    blockNumber?: bigint,
  ): Promise<number> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "latestUniversalChallengersVersion",
      blockNumber,
    })) as number;

    return result;
  }

  async getCurrentUcKeyEpoch(blockNumber?: bigint): Promise<bigint> {
    const raw: unknown = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "ucKeyEpochCurrent",
      blockNumber,
    });

    return assertKeyEpoch(raw, "ucKeyEpochCurrent");
  }
}
