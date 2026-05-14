/**
 * BTCVaultRegistry On-Chain Query Client
 *
 * Thin app-side wrappers around the SDK's `ViemVaultRegistryReader` that
 * preserve vault's existing flat / 0x-prefixed result shapes for callers.
 * The actual contract reads, validations, and multicalls live in the SDK.
 */

import { type Address, type Hex, zeroAddress } from "viem";

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

/**
 * Signing-critical subset of `getBtcVaultBasicInfo` used by the reorder
 * integrity guard. Returned by `getBtcVaultBasicInfoFromChain` in a map
 * keyed by lowercased vault ID.
 */
export interface OnChainVaultBasicInfo {
  /** Vault deposit amount in satoshis. */
  amount: bigint;
  /** Numeric `BTCVaultStatus` (see `ContractStatus`). 2 = ACTIVE. */
  status: number;
  /** Application controller bound at vault creation. */
  applicationEntryPoint: Address;
}

/**
 * Read per-vault signing-critical fields for many vaults in parallel
 * via the SDK's strongly-typed `ViemVaultRegistryReader.getVaultBasicInfo`.
 *
 * Returned map keys are lowercased vault IDs (case-insensitive lookup);
 * the same key form is used by the reorder integrity guard so the caller
 * does not need to worry about checksum casing.
 *
 * Delegates to the SDK's typed reader rather than running its own
 * multicall+cast — the strongly-typed path catches ABI shape
 * regressions at compile time instead of through a late `TypeError` in
 * a downstream consumer.
 *
 * @throws if any input vault is unregistered on-chain (`depositor` is the
 * zero address). The reorder guard treats an unregistered vault as
 * untrusted membership and refuses to sign.
 */
export async function getBtcVaultBasicInfoFromChain(
  vaultIds: readonly Hex[],
): Promise<Map<Hex, OnChainVaultBasicInfo>> {
  if (vaultIds.length === 0) return new Map();

  const reader = getVaultRegistryReader();
  const results = await Promise.all(
    vaultIds.map((vaultId) => reader.getVaultBasicInfo(vaultId)),
  );

  const out = new Map<Hex, OnChainVaultBasicInfo>();
  results.forEach((info, i) => {
    if (info.depositor === zeroAddress) {
      throw new Error(
        `Vault ${vaultIds[i]} not registered on-chain — refusing to recompute reorder against unverified basic info`,
      );
    }
    out.set(vaultIds[i].toLowerCase() as Hex, {
      amount: info.amount,
      status: info.status,
      applicationEntryPoint: info.applicationEntryPoint,
    });
  });
  return out;
}
