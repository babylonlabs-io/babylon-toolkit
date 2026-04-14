/**
 * BTCVaultRegistry On-Chain Query Client
 *
 * Reads vault state directly from the BTCVaultRegistry contract.
 * Use this for signing-critical data that must not be sourced from the indexer.
 */

import type { Address, Hex } from "viem";

import { CONTRACTS } from "@/config/contracts";

import { ethClient } from "../client";

import BTCVaultRegistryAbi from "./abis/BTCVaultRegistry.abi.json";

/**
 * Signing-critical fields read directly from the BTCVaultRegistry contract.
 * These are used to build the payout signing context and must not come from GraphQL.
 */
export interface OnChainVaultData {
  depositorSignedPeginTx: Hex;
  applicationEntryPoint: Address;
  vaultProvider: Address;
  universalChallengersVersion: number;
  appVaultKeepersVersion: number;
  /** Offchain params version locked at vault creation — use for timelockPegin lookup */
  offchainParamsVersion: number;
  /** SHA-256 hash commitment for the HTLC (bytes32, 0x-prefixed) */
  hashlock: Hex;
  /** Index of the HTLC output in the Pre-PegIn transaction */
  htlcVout: number;
  // Note: depositorPayoutBtcAddress is not in the BTCVault struct — only emitted
  // in the PegInSubmitted event. Source it from the indexer instead.
}

/** Shape returned by getBtcVaultBasicInfo */
interface OnChainVaultBasicInfo {
  depositor: Address;
  depositorBtcPubKey: Hex;
  amount: bigint;
  vaultProvider: Address;
  status: number;
  applicationEntryPoint: Address;
  createdAt: bigint;
}

/** Shape returned by getBtcVaultProtocolInfo */
interface OnChainVaultProtocolInfo {
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
}

/**
 * Read signing-critical vault fields from the BTCVaultRegistry contract.
 *
 * The contract stores vault data in two separate structs (BasicInfo + ProtocolInfo).
 * Both are fetched in parallel and merged into the unified OnChainVaultData shape.
 *
 * Throws if the vault does not exist on-chain (empty depositorSignedPeginTx).
 *
 * @param vaultId - Vault ID: keccak256(abi.encode(peginTxHash, depositor)), bytes32
 */
export async function getVaultFromChain(
  vaultId: Hex,
): Promise<OnChainVaultData> {
  const publicClient = ethClient.getPublicClient();

  const [basicInfo, protocolInfo] = await Promise.all([
    publicClient.readContract({
      address: CONTRACTS.BTC_VAULT_REGISTRY,
      abi: BTCVaultRegistryAbi,
      functionName: "getBtcVaultBasicInfo",
      args: [vaultId],
    }) as Promise<OnChainVaultBasicInfo>,
    publicClient.readContract({
      address: CONTRACTS.BTC_VAULT_REGISTRY,
      abi: BTCVaultRegistryAbi,
      functionName: "getBtcVaultProtocolInfo",
      args: [vaultId],
    }) as Promise<OnChainVaultProtocolInfo>,
  ]);

  if (
    !protocolInfo.depositorSignedPeginTx ||
    protocolInfo.depositorSignedPeginTx === "0x"
  ) {
    throw new Error(
      `Vault ${vaultId} not found on-chain or has no pegin transaction`,
    );
  }

  return {
    depositorSignedPeginTx: protocolInfo.depositorSignedPeginTx,
    applicationEntryPoint: basicInfo.applicationEntryPoint,
    vaultProvider: basicInfo.vaultProvider,
    universalChallengersVersion: Number(
      protocolInfo.universalChallengersVersion,
    ),
    appVaultKeepersVersion: Number(protocolInfo.appVaultKeepersVersion),
    offchainParamsVersion: Number(protocolInfo.offchainParamsVersion),
    hashlock: protocolInfo.hashlock,
    htlcVout: Number(protocolInfo.htlcVout),
  };
}
