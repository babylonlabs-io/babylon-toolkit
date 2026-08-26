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
 * 64-char lowercase hex (no `0x`) x-only BTC pubkey sourced from an on-chain
 * registry. Minted only by `assertOnChainBtcPubkey`, which is the shared
 * validator behind both producers:
 * {@link VaultRegistryReader.getVaultProviderGenesisBtcPubKey} (the fixed
 * registration key) and {@link OperationKeyReader} (RFC-006 operation keys,
 * resolved current or at a vault's frozen epoch).
 *
 * @stability frozen
 */
export type OnChainBtcPubkey = string & {
  readonly [onChainBtcPubkeyBrand]: true;
};

/**
 * Mirrors `IBTCVaultRegistry.BTCVaultStatus` in BTCVaultRegistry.sol exactly.
 * Use this when consuming `status` from `getVaultBasicInfo` /
 * `getBtcVaultBasicInfo`.
 *
 * Do NOT confuse with the app-side `ContractStatus` enum
 * (`services/deposit/peginState.ts`) — that one is for the indexer and
 * extends this with values 5-7, reassigning 4 to LIQUIDATED. Reading an
 * on-chain status through `ContractStatus[n]` for labels will mislabel
 * Expired(4) as LIQUIDATED.
 */
export enum OnChainBtcVaultStatus {
  PENDING = 0,
  VERIFIED = 1,
  ACTIVE = 2,
  REDEEMED = 3,
  EXPIRED = 4,
}

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
  /**
   * ETH block number stamped at the Pending→Verified transition.
   * Compared against `block.number` (inclusive:
   * `block.number >= verifiedAt + peginActivationDelay`), never a unix timestamp.
   */
  verifiedAt: bigint;
  depositorWotsPkHash: Hex;
  hashlock: Hex;
  htlcVout: number;
  depositorPopSignature: Hex;
  prePeginTxHash: Hex;
  vaultProviderCommissionBps: number;
  /** Vault core version (uint16) stamped at registration. VP-side gating only — see #1690. */
  vaultCoreVersion: number;
}

/** Combined vault data (basic + protocol) */
export interface VaultData {
  basic: VaultBasicInfo;
  protocol: VaultProtocolInfo;
}

/**
 * RFC-006 operation-key epochs a vault froze at `submitPeginRequest`.
 *
 * Each registry keeps a monotonic epoch counter that every key/payout setter
 * pre-increments. A vault stamps the counters live at its creation, and every
 * participant resolves "which key did this vault bond?" by asking the registry
 * for the key whose appended version is the latest stamped `<=` this epoch. A
 * rotation after the vault was created therefore never moves its keys.
 *
 * `uint64` — kept as `bigint` end-to-end and passed straight back to the
 * `...AtEpoch` getters, never narrowed through `Number`.
 *
 * Only ever read through {@link VaultRegistryReader.getVaultKeyEpochs}, which
 * uses the extended ABI. See `BTCVaultRegistryKeyEpochs.abi.ts` for why that
 * read is quarantined to its own ABI.
 */
export interface KeyEpochs {
  vpKeyEpoch: bigint;
  appKeeperKeyEpoch: bigint;
  ucKeyEpoch: bigint;
}

/** Interface for reading vault data from the BTCVaultRegistry contract. */
export interface VaultRegistryReader {
  getVaultBasicInfo(vaultId: Hex): Promise<VaultBasicInfo>;
  getVaultProtocolInfo(vaultId: Hex): Promise<VaultProtocolInfo>;
  getProtocolInfoBatch(vaultIds: readonly Hex[]): Promise<VaultProtocolInfo[]>;
  getVaultData(vaultId: Hex): Promise<VaultData>;
  /**
   * Read a vault provider's *genesis* (registration) BTC key — the key bonded
   * at version 0, which never moves when the operator rotates.
   *
   * Used only as the genesis fallback for epoch-based resolution and as a
   * candidate when cross-checking an indexer hint. Never the key to build a
   * Bitcoin lock with; that comes from `OperationKeyReader`.
   *
   * Resolves via `getOperationBtcKeyAtEpoch` at epoch 0, so it requires an
   * RFC-006 registry — as does every caller.
   */
  getVaultProviderGenesisBtcPubKey(
    vpAddress: Address,
  ): Promise<OnChainBtcPubkey>;
  /** Read the protocol pegin fee (in wei) for a given vault provider. */
  getPegInFee(vaultProvider: Address): Promise<bigint>;
  /**
   * Read a vault provider's current commission in basis points.
   *
   * Validates the contract-enforced `[0, 9999]` range — an out-of-range
   * value signals a wrong contract address or ABI drift, not a real rate.
   */
  getVaultProviderCommission(vaultProvider: Address): Promise<number>;
  /**
   * Read a vault's frozen RFC-006 key epochs.
   *
   * Uses the extended `getBtcVaultProtocolInfo` ABI. Against a registry whose
   * `BTCVaultProtocolInfo` struct is not extended this returns silent garbage
   * for a populated vault rather than throwing, so it must only be called
   * against an RFC-006 registry — a deployment invariant, not something this
   * call can detect. A registry missing the operation-key getters altogether is
   * the safer case: key resolution reverts downstream and these epochs are never
   * used. See `BTCVaultRegistryKeyEpochs.abi.ts`.
   */
  getVaultKeyEpochs(vaultId: Hex): Promise<KeyEpochs>;
  /** {@link getVaultKeyEpochs} for many vaults in one multicall. */
  getVaultKeyEpochsBatch(vaultIds: readonly Hex[]): Promise<KeyEpochs[]>;
  /**
   * Read a vault provider's *current* RFC-006 operation BTC key — the key its
   * server signs auth tokens with. Falls back to the registration key when the
   * provider has never rotated.
   */
  getCurrentVaultProviderOperationBtcKey(
    vpAddress: Address,
  ): Promise<OnChainBtcPubkey>;
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
  /**
   * Number of blocks added to the activation deadline as a grace window
   * during which a depositor may still reclaim an expired pegin via the
   * HTLC preimage. Source: `IProtocolParams.TBVProtocolParams.expiredPegInGraceBlocks`.
   */
  expiredPegInGraceBlocks: bigint;
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
  proverCircuitVersion: number;
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
  expiredPegInGraceBlocks: bigint;
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
  /**
   * Currently-active vault core (tx-graph) version
   * (`ProtocolParams.activeVaultCoreVersion()`, uint16 ≥ 1). Stamped onto
   * every new vault at peg-in submission; fresh deposits must build this
   * graph version. Read in the same multicall so a governance version bump
   * can't land between reading the params and reading the version.
   */
  activeVaultCoreVersion: number;
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
  /**
   * Observation window enforced between a vault's final ACK and its
   * activation, in ETH blocks measured from `verifiedAt`. `0` disables it.
   *
   * Deliberately its own read rather than a field on
   * {@link PegInConfiguration}: the parameter is absent from deployments that
   * predate it, so folding it into the shared multicall would make every
   * protocol-param read fail wherever it is missing.
   *
   * @throws If the deployment does not expose `peginActivationDelay()`, or
   *   the decoded payload is not a `bigint`.
   */
  getPeginActivationDelay(): Promise<bigint>;
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
  getCurrentVaultKeepers(appEntryPoint: Address): Promise<AddressBTCKeyPair[]>;
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

// ============================================================================
// RFC-006 Operation-Key Types
// ============================================================================

/**
 * The participants whose operation keys are being resolved, and the roster
 * they are resolved against.
 *
 * A roster entry's `ethAddress` is the operator's **admin** address — the
 * lookup key for its key history — and its `btcPubKey` is the operator's
 * **genesis** key. Both are needed: the `...AtEpochOrGenesis` getters take the
 * roster key explicitly because the correct genesis for a keeper/challenger is
 * its key in the vault's *frozen membership version*, which an operator that
 * was later dropped from the roster no longer has a current entry for.
 */
export interface OperationKeyQuery {
  vaultProviderEthAddress: Address;
  /**
   * The VP's genesis (registration) key, from
   * {@link VaultRegistryReader.getVaultProviderGenesisBtcPubKey}.
   *
   * The VP has no roster entry to carry a genesis key the way keepers and
   * challengers do, so it is supplied here. Every call site already reads it:
   * it is what the indexer hint is compared against, and what makes the VP's
   * `rotated` flag mean the same thing as everyone else's.
   */
  vaultProviderGenesisBtcPubkey: Hex;
  applicationEntryPoint: Address;
  /** Keeper roster at the membership version being resolved against. */
  vaultKeepers: readonly AddressBTCKeyPair[];
  /** Challenger roster at the membership version being resolved against. */
  universalChallengers: readonly AddressBTCKeyPair[];
}

/** Raw registry-returned operation keys, index-aligned with the query rosters. */
export interface RawOperationKeys {
  vaultProvider: Hex;
  vaultKeepers: Hex[];
  universalChallengers: Hex[];
}

/**
 * Registry-returned payout scriptPubKeys, index-aligned with the query
 * rosters. `universalChallengers` has no counterpart: a UC is never a claimer,
 * so it has no payout script.
 */
export interface RawPayoutScripts {
  vaultProvider: Hex;
  vaultKeepers: Hex[];
}

/**
 * Reads RFC-006 operation keys and payout scripts across all three registries
 * (BTCVaultRegistry, ApplicationRegistry, ProtocolParams).
 *
 * Every method resolves the whole participant set in a **single** multicall so
 * the keys are pinned to one block. That atomicity is load-bearing: a rotation
 * landing between two `eth_call`s would yield a self-inconsistent key set that
 * builds a lock no counterparty agrees with.
 */
export interface OperationKeyReader {
  /**
   * Resolve every participant's *current* operation key.
   *
   * Used for new peg-ins and for the VP auth pin. Needs no epoch read at all —
   * each registry's `getCurrentOperationBtcKey` resolves its own genesis
   * fallback, so an operator that never rotated yields its registration key.
   */
  getCurrentOperationKeys(query: OperationKeyQuery): Promise<RawOperationKeys>;
  /**
   * Resolve every participant's operation key bonded at a vault's frozen
   * epochs. Used for every existing-vault path (resume, payout, refund).
   */
  getOperationKeysAtEpochs(
    query: OperationKeyQuery,
    epochs: KeyEpochs,
  ): Promise<RawOperationKeys>;
  /**
   * Resolve the VP's commission payout script and each keeper's payout script
   * at a vault's frozen epochs.
   *
   * The registry backfills BIP-86 P2TR of the epoch's operation key for any
   * operator that never called `setPayoutScript`, so this returns byte-identical
   * results to local BIP-86 derivation until an operator registers a custom
   * script.
   */
  getPayoutScriptsAtEpochs(
    query: OperationKeyQuery,
    epochs: KeyEpochs,
  ): Promise<RawPayoutScripts>;
}
