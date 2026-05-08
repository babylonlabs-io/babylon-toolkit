/**
 * Concrete BTCVaultRegistry reader using viem's readContract.
 *
 * This is an optional utility — callers can use their own implementation
 * of the VaultRegistryReader interface.
 */

import * as ecc from "@bitcoin-js/tiny-secp256k1-asmjs";
import type { Abi, Address, Hex, PublicClient } from "viem";

import { hexToUint8Array } from "../../primitives/utils/bitcoin";
import { BTCVaultRegistryABI } from "../../contracts/abis/BTCVaultRegistry.abi";
import { assertValidOffchainParamsVersion } from "./protocol-params-validation";
import type {
  OnChainBtcPubkey,
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

  /**
   * Read the VP's persistent x-only BTC pubkey from the on-chain
   * registry. Validates length, hex form, and secp256k1 curve
   * membership before minting the brand. Returns 64-char lowercase
   * hex without the `0x` prefix.
   */
  async getVaultProviderBtcPubKey(
    vpAddress: Address,
  ): Promise<OnChainBtcPubkey> {
    const result = (await this.publicClient.readContract({
      address: this.contractAddress,
      abi: BTCVaultRegistryABI,
      functionName: "getVaultProviderBTCKey",
      args: [vpAddress],
    })) as Hex;
    const lowered = result.toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(lowered)) {
      throw new Error(
        `getVaultProviderBTCKey returned an unexpected value (vp=${vpAddress}, length ${lowered.length}, prefix "${lowered.slice(0, 2)}")`,
      );
    }
    const stripped = lowered.slice(2);
    if (!ecc.isXOnlyPoint(hexToUint8Array(stripped))) {
      throw new Error(
        `getVaultProviderBTCKey returned a value that is not on the secp256k1 curve (vp=${vpAddress})`,
      );
    }
    return stripped as OnChainBtcPubkey;
  }

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

    const offchainParamsVersion = Number(result.offchainParamsVersion);
    assertValidOffchainParamsVersion(offchainParamsVersion);

    return {
      depositorSignedPeginTx: result.depositorSignedPeginTx,
      universalChallengersVersion: result.universalChallengersVersion,
      appVaultKeepersVersion: result.appVaultKeepersVersion,
      offchainParamsVersion,
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

  /**
   * Read `offchainParamsVersion` for many vaults in a single multicall.
   * Reads only `getBtcVaultProtocolInfo` (one read per vault), so an N-vault
   * batch costs one RPC round-trip instead of 2N parallel `eth_call`s.
   */
  async getOffchainParamsVersionsByVaultIds(
    vaultIds: readonly Hex[],
  ): Promise<number[]> {
    if (vaultIds.length === 0) return [];

    const results = await this.publicClient.multicall({
      contracts: vaultIds.map((vaultId) => ({
        address: this.contractAddress,
        abi: BTCVaultRegistryABI as Abi,
        functionName: "getBtcVaultProtocolInfo" as const,
        args: [vaultId] as const,
      })),
      allowFailure: false,
    });

    return results.map((info) => {
      const protocolInfo = info as unknown as VaultProtocolInfo;
      if (
        !protocolInfo.depositorSignedPeginTx ||
        protocolInfo.depositorSignedPeginTx === "0x"
      ) {
        throw new Error(
          "Vault not found on-chain or has no pegin transaction while reading offchain params version",
        );
      }
      const version = Number(protocolInfo.offchainParamsVersion);
      assertValidOffchainParamsVersion(version);
      return version;
    });
  }
}
