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
  ): Promise<AddressBTCKeyPair[]> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ApplicationRegistryABI,
      functionName: "getVaultKeepersByVersion",
      args: [appEntryPoint, version],
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
  ): Promise<number> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ApplicationRegistryABI,
      functionName: "getCurrentVaultKeepersVersion",
      args: [appEntryPoint],
    })) as number;

    return result;
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
  ): Promise<AddressBTCKeyPair[]> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "getUniversalChallengersByVersion",
      args: [version],
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

  async getLatestUniversalChallengersVersion(): Promise<number> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: ProtocolParamsABI,
      functionName: "latestUniversalChallengersVersion",
    })) as number;

    return result;
  }
}
