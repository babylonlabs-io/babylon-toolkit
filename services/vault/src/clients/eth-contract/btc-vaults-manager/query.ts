/**
 * BTCVaultsManager On-Chain Query Client
 *
 * Reads vault state directly from the BTCVaultsManager contract.
 * Use this for signing-critical data that must not be sourced from the indexer.
 */

import type { Address, Hex } from "viem";

import { CONTRACTS } from "@/config/contracts";

import { ethClient } from "../client";

import BTCVaultsManagerAbi from "./abis/BTCVaultsManager.abi.json";

/**
 * Signing-critical fields read directly from the BTCVaultsManager contract.
 * These are used to build the payout signing context and must not come from GraphQL.
 */
export interface OnChainVaultData {
  depositorSignedPeginTx: Hex;
  applicationController: Address;
  vaultProvider: Address;
  universalChallengersVersion: number;
  appVaultKeepersVersion: number;
}

/**
 * Read signing-critical vault fields from the BTCVaultsManager contract.
 *
 * Throws if the vault does not exist on-chain (empty depositorSignedPeginTx).
 *
 * @param vaultId - Vault ID (pegin tx hash, bytes32)
 */
export async function getVaultFromChain(
  vaultId: Hex,
): Promise<OnChainVaultData> {
  const publicClient = ethClient.getPublicClient();

  const vault = await publicClient.readContract({
    address: CONTRACTS.BTC_VAULTS_MANAGER,
    abi: BTCVaultsManagerAbi as const,
    functionName: "getBTCVault",
    args: [vaultId],
  });

  if (!vault.depositorSignedPeginTx || vault.depositorSignedPeginTx === "0x") {
    throw new Error(
      `Vault ${vaultId} not found on-chain or has no pegin transaction`,
    );
  }

  return {
    depositorSignedPeginTx: vault.depositorSignedPeginTx,
    applicationController: vault.applicationController,
    vaultProvider: vault.vaultProvider,
    universalChallengersVersion: vault.universalChallengersVersion,
    appVaultKeepersVersion: vault.appVaultKeepersVersion,
  };
}
