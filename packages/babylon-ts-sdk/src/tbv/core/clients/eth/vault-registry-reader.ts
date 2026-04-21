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
    })) as readonly [Address, Hex, bigint, Address, number, Address, bigint];

    return {
      depositor: result[0],
      depositorBtcPubKey: result[1],
      amount: result[2],
      vaultProvider: result[3],
      status: result[4],
      applicationEntryPoint: result[5],
      createdAt: result[6],
    };
  }

  async getVaultProtocolInfo(vaultId: Hex): Promise<VaultProtocolInfo> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getBtcVaultProtocolInfo",
      args: [vaultId],
    })) as readonly [
      Hex,
      number,
      number,
      number,
      bigint,
      Hex,
      Hex,
      number,
      Hex,
      Hex,
      number,
    ];

    return {
      depositorSignedPeginTx: result[0],
      universalChallengersVersion: result[1],
      appVaultKeepersVersion: result[2],
      offchainParamsVersion: result[3],
      verifiedAt: result[4],
      depositorWotsPkHash: result[5],
      hashlock: result[6],
      htlcVout: result[7],
      depositorPopSignature: result[8],
      prePeginTxHash: result[9],
      vaultProviderCommissionBps: result[10],
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
