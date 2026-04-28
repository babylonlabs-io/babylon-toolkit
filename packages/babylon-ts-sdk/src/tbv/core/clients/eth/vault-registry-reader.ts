/**
 * Concrete BTCVaultRegistry reader using viem's readContract.
 *
 * This is an optional utility — callers can use their own implementation
 * of the VaultRegistryReader interface.
 */

import type { Address, Hex, PublicClient } from "viem";

import { BTCVaultRegistryABI } from "../../contracts/abis/BTCVaultRegistry.abi";
import type {
  VaultBasicInfo,
  VaultData,
  VaultProtocolInfo,
  VaultRegistryReader,
} from "./types";

/**
 * Concrete vault registry reader using viem.
 *
 * Usage:
 * ```ts
 * const reader = new ViemVaultRegistryReader(publicClient, registryAddress);
 * const data = await reader.getVaultData(vaultId);
 * ```
 */
export class ViemVaultRegistryReader implements VaultRegistryReader {
  constructor(
    private publicClient: PublicClient,
    private contractAddress: Address,
  ) {}

  async getVaultBasicInfo(vaultId: Hex): Promise<VaultBasicInfo> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultBasicInfo",
      args: [vaultId],
    })) as {
      depositor: Address;
      depositorBtcPubKey: Hex;
      amount: bigint;
      vaultProvider: Address;
      status: number;
      applicationEntryPoint: Address;
      createdAt: bigint;
    };

    return {
      depositor: result.depositor,
      depositorBtcPubKey: result.depositorBtcPubKey,
      amount: result.amount,
      vaultProvider: result.vaultProvider,
      status: result.status,
      applicationEntryPoint: result.applicationEntryPoint,
      createdAt: result.createdAt,
    };
  }

  async getVaultProtocolInfo(vaultId: Hex): Promise<VaultProtocolInfo> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultProtocolInfo",
      args: [vaultId],
    })) as {
      depositorSignedPeginTx: Hex;
      universalChallengersVersion: number;
      appVaultKeepersVersion: number;
      offchainParamsVersion: number;
      verifiedAt: bigint;
      depositorWotsPkHash: Hex;
      hashlock: Hex;
      htlcVout: number;
      depositorPopSignature: Hex;
      prePeginTxHash: Hex;
      vaultProviderCommissionBps: number;
    };

    return {
      depositorSignedPeginTx: result.depositorSignedPeginTx,
      universalChallengersVersion: result.universalChallengersVersion,
      appVaultKeepersVersion: result.appVaultKeepersVersion,
      offchainParamsVersion: result.offchainParamsVersion,
      verifiedAt: result.verifiedAt,
      depositorWotsPkHash: result.depositorWotsPkHash,
      hashlock: result.hashlock,
      htlcVout: result.htlcVout,
      depositorPopSignature: result.depositorPopSignature,
      prePeginTxHash: result.prePeginTxHash,
      vaultProviderCommissionBps: result.vaultProviderCommissionBps,
    };
  }

  async getVaultData(vaultId: Hex): Promise<VaultData> {
    const [basic, protocol] = await Promise.all([
      this.getVaultBasicInfo(vaultId),
      this.getVaultProtocolInfo(vaultId),
    ]);

    if (
      !protocol.depositorSignedPeginTx ||
      protocol.depositorSignedPeginTx === "0x"
    ) {
      throw new Error(
        `Vault ${vaultId} not found on-chain or has no pegin transaction`,
      );
    }

    return { basic, protocol };
  }
}
