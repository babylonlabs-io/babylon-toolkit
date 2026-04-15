/**
 * Types and interfaces for ETH contract readers.
 *
 * These are optional utilities — callers can use them or build their own.
 * Core service functions never import from this module.
 */

import type { Address, Hex } from "viem";

/** Basic vault info from BTCVaultRegistry.getBtcVaultBasicInfo */
export interface VaultBasicInfo {
  depositor: Address;
  depositorBtcPubKey: Hex;
  amount: bigint;
  vaultProvider: Address;
  status: number;
  applicationEntryPoint: Address;
  createdAt: bigint;
}

/** Protocol info from BTCVaultRegistry.getBtcVaultProtocolInfo */
export interface VaultProtocolInfo {
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

/** Combined vault data (basic + protocol) */
export interface VaultData {
  basic: VaultBasicInfo;
  protocol: VaultProtocolInfo;
}

/** Interface for reading vault data from the BTCVaultRegistry contract. */
export interface VaultRegistryReader {
  getVaultBasicInfo(vaultId: Hex): Promise<VaultBasicInfo>;
  getVaultProtocolInfo(vaultId: Hex): Promise<VaultProtocolInfo>;
  getVaultData(vaultId: Hex): Promise<VaultData>;
}
