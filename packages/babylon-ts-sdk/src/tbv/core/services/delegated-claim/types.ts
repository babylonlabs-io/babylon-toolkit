/**
 * Types for the delegated-claim (depositor-as-claimer) artifact flow.
 *
 * @module services/delegated-claim/types
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import type { Hex } from "viem";

/**
 * The small, non-opaque fields of an `artifacts.json` file.
 *
 * @experimental
 */
export interface WatchtowerArtifactsSummary {
  /**
   * Vault Core version the file records, absent on files written before the
   * field existed. `assertArtifactsUsableForVault` refuses a file whose
   * value differs from the version it verifies under.
   */
  vaultCoreVersion?: number;
  /** 32-byte on-chain vault id, as the file records it. */
  vaultId: string;
  /** Txid of the fully signed Claim transaction the file carries. */
  claimTxid: string;
  /**
   * Txid of the PegIn output that Claim spends. Together with the depositor's
   * Ethereum address this derives the vault id, which is the only check that
   * binds the file's graph to a vault — `vault_id` itself is self-declared.
   */
  peginTxid: string;
  proverCircuitVersion: number;
  /**
   * Block of the finalized `VaultClaimableBy` event, or `0n` when the file was
   * assembled before the Ethereum withdrawal was initiated. A claim run
   * against zero proves the wrong block and fails before Assert, so
   * `assertArtifactsUsableForVault` refuses it.
   *
   * `bigint`, matching {@link DelegatedClaimVaultContext} and the WASM
   * boundary — a block number is a u64 there.
   */
  claimableEventBlockNumber: bigint;
  /** Hex challenger public keys the file carries BaBe sessions for. */
  babeSessionChallengerPubkeys: string[];
}

/**
 * Inputs the vault provider supplies for artifact assembly.
 *
 * @experimental
 */
export interface ClaimerArtifactsSource {
  /** `tx_graph_json` from `requestDepositorClaimerArtifacts`. */
  txGraphJson: string;
  /**
   * `verifying_key_hex` from the same response.
   *
   * Trusted from the vault provider. This value is written into the
   * artifacts file and is the key `pinPegoutProof` later verifies the
   * Groth16 proof against, so a provider that supplies a key of its own
   * choosing makes that verification prove nothing. No registry read in
   * this SDK exposes a verifying key, or a hash of one, per
   * `proverCircuitVersion`, so there is nothing to compare it with yet.
   * Obtain it over an authenticated channel, and re-check it here once the
   * chain exposes an anchor.
   */
  verifyingKeyHex: string;
}

/**
 * On-chain facts the assembled artifacts commit to.
 *
 * @experimental
 */
export interface DelegatedClaimVaultContext {
  vaultId: Hex;
  /**
   * Depositor's Ethereum address, the one the vault was registered under.
   * With the PegIn txid it re-derives {@link DelegatedClaimVaultContext.vaultId},
   * which is how a vault-provider-served graph is bound to this vault.
   */
  depositorEthAddress: Hex;
  /**
   * `depositorPayoutScriptPubKey` as the vault registered it on chain, hex.
   * The Payout the vault provider builds is checked against this before the
   * wallet signs it.
   */
  registeredPayoutScriptPubKey: string;
  /** Vault provider's BTC public key, registered on chain for this vault. */
  vaultProviderBtcPubkey: string;
  /** Vault keepers registered on chain, the local challengers of this claim. */
  vaultKeeperBtcPubkeys: string[];
  /** Universal challengers registered on chain. */
  universalChallengerBtcPubkeys: string[];
  /** Graph (vault core) version of the vault. Delegated claim requires 3. */
  txGraphVersion: number;
  proverCircuitVersion: number;
  /**
   * Vault Core version from the finalized `PegInSubmitted` event. The builder
   * refuses a graph that records a different one, which is what stops a graph
   * built under other rules from being signed.
   */
  vaultCoreVersion: number;
  /**
   * Block of the finalized `VaultClaimableBy` event.
   *
   * Zero is accepted, because the file is meant to be assembled while the
   * vault provider is still online, which can be long before the withdrawal
   * is initiated. Such a file is not claimable as written: nothing in the SDK
   * fills the field in later, and `assertArtifactsUsableForVault` refuses it.
   * Pass the real block whenever the event has already finalized.
   */
  claimableEventBlockNumber: bigint;
  /**
   * Value of output 0 of the vault's depositor-signed PegIn, in sats, parsed
   * from `VaultData.protocol.depositorSignedPeginTx`. The Payout's input 0
   * spends that output (btc-vault `payout.rs:103-112` @ ac4954e7), so it is
   * one of the two amounts the claim-time fee band is measured over.
   */
  peginVaultOutputValueSats: number;
  /** `feeRate` of the vault's stamped `getOffchainParamsByVersion`, sat/vB. */
  protocolFeeRate: bigint;
  /** `securityCouncilKeys.length` of the same stamped offchain params. */
  councilSize: number;
  /** `getTimelockPeginByVersion` — the CSV sequence of Payout input 0. */
  timelockPegin: number;
  /** `timelockAssert` of the stamped params — the CSV sequence of Payout input 1. */
  timelockAssert: number;
}

/**
 * Which delegated-claim transaction a signing request is for.
 *
 * @experimental
 */
export type DelegatedClaimSigningKind =
  | "claim"
  | "assert"
  | "payoutClaimer"
  | "payoutDepositor"
  | "wronglyChallenged";

/**
 * One PSBT the depositor must sign, with the input to sign and a stable id
 * the signatures are keyed by.
 *
 * @experimental
 */
export interface DelegatedClaimSigningRequest {
  /** `kind`, or `wronglyChallenged:<challenger x-only hex>:<gcIndex>`. */
  readonly id: string;
  readonly kind: DelegatedClaimSigningKind;
  readonly psbtBase64: string;
  readonly inputIndex: number;
  readonly challengerPubkey?: string;
  readonly gcIndex?: number;
}

/**
 * Everything one delegated-claim signing session needs, built once and
 * signed by whichever wallet path fits. Treat as immutable: the assembler
 * rebuilds every PSBT from the graph and byte-compares against this.
 *
 * @experimental
 */
export interface DelegatedClaimSigningPlan {
  readonly depositorPublicKey: string;
  readonly btcNetwork: Network;
  readonly source: ClaimerArtifactsSource;
  readonly vault: DelegatedClaimVaultContext;
  readonly babeSessionsJson?: string;
  readonly requests: readonly DelegatedClaimSigningRequest[];
}

/**
 * 64-byte Schnorr signatures (hex) keyed by {@link DelegatedClaimSigningRequest.id}.
 *
 * @experimental
 */
export type DelegatedClaimSignatures = ReadonlyMap<string, string>;
