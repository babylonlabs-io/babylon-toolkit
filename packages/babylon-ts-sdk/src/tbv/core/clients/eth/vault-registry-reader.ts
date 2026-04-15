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
 * ABI for getBtcVaultProtocolInfo — not in the SDK's minimal ABI since
 * it's only needed by this optional reader, not by core SDK operations.
 */
const GET_BTC_VAULT_PROTOCOL_INFO_ABI = [
  {
    type: "function" as const,
    name: "getBtcVaultProtocolInfo" as const,
    inputs: [
      {
        name: "vaultId",
        type: "bytes32" as const,
        internalType: "bytes32" as const,
      },
    ],
    outputs: [
      {
        name: "depositorSignedPeginTx",
        type: "bytes" as const,
        internalType: "bytes" as const,
      },
      {
        name: "universalChallengersVersion",
        type: "uint32" as const,
        internalType: "uint32" as const,
      },
      {
        name: "appVaultKeepersVersion",
        type: "uint32" as const,
        internalType: "uint32" as const,
      },
      {
        name: "offchainParamsVersion",
        type: "uint32" as const,
        internalType: "uint32" as const,
      },
      {
        name: "verifiedAt",
        type: "uint256" as const,
        internalType: "uint256" as const,
      },
      {
        name: "depositorWotsPkHash",
        type: "bytes32" as const,
        internalType: "bytes32" as const,
      },
      {
        name: "hashlock",
        type: "bytes32" as const,
        internalType: "bytes32" as const,
      },
      {
        name: "htlcVout",
        type: "uint8" as const,
        internalType: "uint8" as const,
      },
      {
        name: "depositorPopSignature",
        type: "bytes" as const,
        internalType: "bytes" as const,
      },
      {
        name: "prePeginTxHash",
        type: "bytes32" as const,
        internalType: "bytes32" as const,
      },
      {
        name: "vaultProviderCommissionBps",
        type: "uint16" as const,
        internalType: "uint16" as const,
      },
    ],
    stateMutability: "view" as const,
  },
] as const;

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
      abi: GET_BTC_VAULT_PROTOCOL_INFO_ABI,
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
