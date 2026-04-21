/**
 * Types and interfaces for ETH contract readers.
 *
 * These are optional utilities — callers can use them or build their own.
 * Core service functions never import from this module.
 */

import type { Address, Hex } from "viem";

// ============================================================================
// Vault Registry Types
// ============================================================================

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

// ============================================================================
// Protocol Params Types (from IProtocolParams.sol)
// ============================================================================

/**
 * TBV protocol parameters from the ProtocolParams contract.
 * Matches Solidity struct `IProtocolParams.TBVProtocolParams` exactly.
 *
 * All uint64 amounts use bigint (satoshi values can exceed 2^53).
 * uint8 uses number (bounded, max 255).
 */
export interface TBVProtocolParams {
  minimumPegInAmount: bigint;
  maxPegInAmount: bigint;
  pegInAckTimeout: bigint;
  pegInActivationTimeout: bigint;
  maxHtlcOutputCount: number;
}

/**
 * Versioned offchain parameters from the ProtocolParams contract.
 * Matches Solidity struct `IProtocolParams.VersionedOffchainParams` exactly.
 *
 * bigint for: uint256 timelocks, uint64 fee rates/amounts.
 * number for: uint8/uint16/uint32 fields (bounded, safe for JS arithmetic).
 */
export interface VersionedOffchainParams {
  timelockAssert: bigint;
  timelockChallengeAssert: bigint;
  securityCouncilKeys: Hex[];
  councilQuorum: number;
  feeRate: bigint;
  babeTotalInstances: number;
  babeInstancesToFinalize: number;
  minVpCommissionBps: number;
  tRefund: number;
  tStale: number;
  minPeginFeeRate: bigint;
  proverProgramVersion: number;
  minPrepeginDepth: number;
}

/**
 * Combined peg-in configuration read atomically via multicall.
 * Prevents TOCTOU inconsistency if governance updates params between reads.
 */
export interface PegInConfiguration {
  minimumPegInAmount: bigint;
  maxPegInAmount: bigint;
  pegInAckTimeout: bigint;
  pegInActivationTimeout: bigint;
  maxHtlcOutputCount: number;
  timelockPegin: number;
  timelockRefund: number;
  minVpCommissionBps: number;
  offchainParams: VersionedOffchainParams;
}

/** Interface for reading protocol parameters from the ProtocolParams contract. */
export interface ProtocolParamsReader {
  getTBVProtocolParams(): Promise<TBVProtocolParams>;
  getOffchainParamsByVersion(version: number): Promise<VersionedOffchainParams>;
  getLatestOffchainParams(): Promise<VersionedOffchainParams>;
  getLatestOffchainParamsVersion(): Promise<number>;
  getTimelockPeginByVersion(version: number): Promise<number>;
  getPegInConfiguration(): Promise<PegInConfiguration>;
}

// ============================================================================
// Signer-Set Types (from BTCVaultTypes.sol)
// ============================================================================

/**
 * Matches Solidity struct `BTCVaultTypes.AddressBTCKeyPair` exactly.
 * Used for vault keepers and universal challengers.
 */
export interface AddressBTCKeyPair {
  ethAddress: Address;
  btcPubKey: Hex;
}

/** Interface for reading vault keepers from the ApplicationRegistry contract. */
export interface VaultKeeperReader {
  getVaultKeepersByVersion(
    appEntryPoint: Address,
    version: number,
  ): Promise<AddressBTCKeyPair[]>;
  getCurrentVaultKeepers(
    appEntryPoint: Address,
  ): Promise<AddressBTCKeyPair[]>;
  getCurrentVaultKeepersVersion(appEntryPoint: Address): Promise<number>;
}

/** Interface for reading universal challengers from the ProtocolParams contract. */
export interface UniversalChallengerReader {
  getUniversalChallengersByVersion(
    version: number,
  ): Promise<AddressBTCKeyPair[]>;
  getCurrentUniversalChallengers(): Promise<AddressBTCKeyPair[]>;
  getLatestUniversalChallengersVersion(): Promise<number>;
}
