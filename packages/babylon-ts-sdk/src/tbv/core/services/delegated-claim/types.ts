/**
 * Types for the delegated-claim (depositor-as-claimer) artifact flow.
 *
 * @module services/delegated-claim/types
 */

import type { Hex } from "viem";

/** The small, non-opaque fields of an `artifacts.json` file. */
export interface WatchtowerArtifactsSummary {
  /** Graph version the file was assembled under. Delegated claim requires 3. */
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

/** Inputs the vault provider supplies for artifact assembly. */
export interface ClaimerArtifactsSource {
  /** `tx_graph_json` from `requestDepositorClaimerArtifacts`. */
  txGraphJson: string;
  /** `verifying_key_hex` from the same response. */
  verifyingKeyHex: string;
}

/** On-chain facts the assembled artifacts commit to. */
export interface DelegatedClaimVaultContext {
  vaultId: Hex;
  /**
   * Depositor's Ethereum address, the one the vault was registered under.
   * With the PegIn txid it re-derives {@link DelegatedClaimVaultContext.vaultId},
   * which is how a vault-provider-served graph is bound to this vault.
   */
  depositorEthAddress: Hex;
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
}
