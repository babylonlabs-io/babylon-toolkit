/**
 * BTCVaultRegistry On-Chain Query Client
 *
 * Reads vault state directly from the BTCVaultRegistry contract.
 * Use this for signing-critical data that must not be sourced from the indexer.
 */

import type { Abi, Address, Hex } from "viem";

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
  /** Vault deposit amount in satoshis */
  amount: bigint;
  /** Hash of the Pre-PegIn transaction (bytes32, 0x-prefixed) */
  prePeginTxHash: Hex;
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
    amount: basicInfo.amount,
    prePeginTxHash: protocolInfo.prePeginTxHash,
  };
}

/**
 * Read a vault provider's registered BTC public key from BTCVaultRegistry.
 *
 * The VP BTC key is signing-critical because it participates in the Taproot
 * script tree used for payout signing. Callers may use GraphQL values as hints
 * for UX, but signing must use/cross-check this contract value.
 */
export async function getVaultProviderBtcPubkeyFromChain(
  vaultProvider: Address,
): Promise<Hex> {
  const publicClient = ethClient.getPublicClient();

  const btcPubkey = (await publicClient.readContract({
    address: CONTRACTS.BTC_VAULT_REGISTRY,
    abi: BTCVaultRegistryAbi,
    functionName: "getVaultProviderBTCKey",
    args: [vaultProvider],
  })) as Hex;

  if (
    !btcPubkey ||
    btcPubkey === "0x" ||
    btcPubkey ===
      "0x0000000000000000000000000000000000000000000000000000000000000000"
  ) {
    throw new Error(
      `Vault provider ${vaultProvider} has no registered BTC pubkey on-chain`,
    );
  }

  return btcPubkey;
}

/**
 * Read `offchainParamsVersion` for many vaults in a single multicall.
 *
 * Used by the deposit flow to verify, after batch ETH registration, that every
 * registered vault was stamped under the same offchain params version the BTC
 * scripts were built against. Reads only `getBtcVaultProtocolInfo` (one read
 * per vault) and runs them through `publicClient.multicall`, so an N-vault
 * batch costs one RPC round-trip instead of 2N parallel `eth_call`s.
 *
 * @param vaultIds - Vault IDs in the order versions should be returned.
 */
export async function getOffchainParamsVersionsFromChain(
  vaultIds: readonly Hex[],
): Promise<number[]> {
  if (vaultIds.length === 0) return [];

  const publicClient = ethClient.getPublicClient();
  const results = await publicClient.multicall({
    contracts: vaultIds.map((vaultId) => ({
      address: CONTRACTS.BTC_VAULT_REGISTRY,
      abi: BTCVaultRegistryAbi as Abi,
      functionName: "getBtcVaultProtocolInfo" as const,
      args: [vaultId] as const,
    })),
    allowFailure: false,
  });

  return results.map((info) => {
    const protocolInfo = info as unknown as OnChainVaultProtocolInfo;
    if (
      !protocolInfo.depositorSignedPeginTx ||
      protocolInfo.depositorSignedPeginTx === "0x"
    ) {
      throw new Error(
        "Vault not found on-chain or has no pegin transaction while reading offchain params version",
      );
    }
    return Number(protocolInfo.offchainParamsVersion);
  });
}
