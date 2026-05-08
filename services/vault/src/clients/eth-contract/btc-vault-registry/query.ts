/**
 * BTCVaultRegistry On-Chain Query Client
 *
 * Thin app-side wrappers around the SDK's `ViemVaultRegistryReader` that
 * preserve vault's existing flat / 0x-prefixed result shapes for callers.
 * The actual contract reads, validations, and multicalls live in the SDK.
 */

import type { Address, Hex } from "viem";

import { getVaultRegistryReader } from "../sdk-readers";

/**
 * Signing-critical fields read directly from the BTCVaultRegistry contract.
 * Flat shape merged from the SDK's `{basic, protocol}` payload.
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
}

/**
 * Read signing-critical vault fields from the BTCVaultRegistry contract.
 *
 * @param vaultId - Vault ID: keccak256(abi.encode(peginTxHash, depositor)), bytes32
 * @throws if the vault does not exist on-chain (empty depositorSignedPeginTx).
 */
export async function getVaultFromChain(
  vaultId: Hex,
): Promise<OnChainVaultData> {
  const { basic, protocol } =
    await getVaultRegistryReader().getVaultData(vaultId);

  return {
    depositorSignedPeginTx: protocol.depositorSignedPeginTx,
    applicationEntryPoint: basic.applicationEntryPoint,
    vaultProvider: basic.vaultProvider,
    universalChallengersVersion: Number(protocol.universalChallengersVersion),
    appVaultKeepersVersion: Number(protocol.appVaultKeepersVersion),
    offchainParamsVersion: Number(protocol.offchainParamsVersion),
    hashlock: protocol.hashlock,
    htlcVout: Number(protocol.htlcVout),
    amount: basic.amount,
    prePeginTxHash: protocol.prePeginTxHash,
  };
}

/**
 * Read a vault provider's registered BTC public key from BTCVaultRegistry,
 * returning a 0x-prefixed `Hex` string for compatibility with existing
 * callers (the SDK reader returns the 64-char lowercase form without the
 * prefix; this wrapper re-attaches `0x`).
 */
export async function getVaultProviderBtcPubkeyFromChain(
  vaultProvider: Address,
): Promise<Hex> {
  const xOnly =
    await getVaultRegistryReader().getVaultProviderBtcPubKey(vaultProvider);
  return `0x${xOnly}` as Hex;
}

/**
 * Read `offchainParamsVersion` for many vaults in a single multicall.
 *
 * @param vaultIds - Vault IDs in the order versions should be returned.
 */
export async function getOffchainParamsVersionsFromChain(
  vaultIds: readonly Hex[],
): Promise<number[]> {
  return getVaultRegistryReader().getOffchainParamsVersionsByVaultIds(vaultIds);
}
