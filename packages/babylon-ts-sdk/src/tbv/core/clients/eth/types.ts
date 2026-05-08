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

declare const onChainBtcPubkeyBrand: unique symbol;

/**
 * 64-char lowercase hex (no `0x`) x-only BTC pubkey sourced from the
 * on-chain BTCVaultRegistry. The only legitimate producer is
 * {@link VaultRegistryReader.getVaultProviderBtcPubKey}.
 *
 * @stability frozen
 */
export type OnChainBtcPubkey = string & {
  readonly [onChainBtcPubkeyBrand]: true;
};

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
  getVaultProviderBtcPubKey(vpAddress: Address): Promise<OnChainBtcPubkey>;
  /**
   * Read `offchainParamsVersion` for many vaults in a single multicall.
   * Returns versions in the same order as the input. Throws if any vault
   * is missing on-chain.
   */
  getOffchainParamsVersionsByVaultIds(
    vaultIds: readonly Hex[],
  ): Promise<number[]>;
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
  /**
   * Version label paired atomically with `offchainParams`.
   * Read in the same multicall as the params struct so that, if a parameter
   * update lands between separate reads, the script-construction code and
   * the version label stay consistent.
   */
  offchainParamsVersion: number;
}

/**
 * All offchain params snapshots indexed by version, plus the latest version
 * number known when the snapshot was taken. Used by consumers that need to
 * resolve any historical version (e.g. signing for an existing vault locked
 * to an older version).
 */
export interface AllOffchainParamsData {
  byVersion: Map<number, VersionedOffchainParams>;
  latestVersion: number;
}

/**
 * Optional observer invoked by `fetchAllOffchainParams` when a historical
 * version fails validation. Called once per skipped version so callers can
 * log/telemeter without coupling the SDK to a specific logger.
 */
export type OnSkippedOffchainParamsVersion = (
  version: number,
  error: Error,
) => void;

/** Interface for reading protocol parameters from the ProtocolParams contract. */
export interface ProtocolParamsReader {
  getTBVProtocolParams(): Promise<TBVProtocolParams>;
  getOffchainParamsByVersion(version: number): Promise<VersionedOffchainParams>;
  getLatestOffchainParams(): Promise<VersionedOffchainParams>;
  getLatestOffchainParamsVersion(): Promise<number>;
  getTimelockPeginByVersion(version: number): Promise<number>;
  getPegInConfiguration(): Promise<PegInConfiguration>;
  fetchAllOffchainParams(
    onSkippedVersion?: OnSkippedOffchainParamsVersion,
  ): Promise<AllOffchainParamsData>;
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
