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
  // Note: depositorPayoutBtcAddress is not in the BTCVault struct — only emitted
  // in the PegInSubmitted event. Source it from the indexer instead.
}

/**
 * Read signing-critical vault fields from the BTCVaultRegistry contract.
 *
 * Throws if the vault does not exist on-chain (empty depositorSignedPeginTx).
 *
 * @param vaultId - Vault ID (pegin tx hash, bytes32)
 */
export async function getVaultFromChain(
  vaultId: Hex,
): Promise<OnChainVaultData> {
  const publicClient = ethClient.getPublicClient();

  const vault = (await publicClient.readContract({
    address: CONTRACTS.BTC_VAULT_REGISTRY,
    abi: BTCVaultRegistryAbi,
    functionName: "getBTCVault",
    args: [vaultId],
  })) as OnChainVaultData;

  if (!vault.depositorSignedPeginTx || vault.depositorSignedPeginTx === "0x") {
    throw new Error(
      `Vault ${vaultId} not found on-chain or has no pegin transaction`,
    );
  }

  return {
    depositorSignedPeginTx: vault.depositorSignedPeginTx,
    applicationEntryPoint: vault.applicationEntryPoint,
    vaultProvider: vault.vaultProvider,
    universalChallengersVersion: Number(vault.universalChallengersVersion),
    appVaultKeepersVersion: Number(vault.appVaultKeepersVersion),
    offchainParamsVersion: Number(vault.offchainParamsVersion),
  };
}
