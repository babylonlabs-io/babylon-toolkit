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
  proverCircuitVersion: number;
  /**
   * Block of the finalized `VaultClaimableBy` event, or 0 when the file was
   * assembled before the Ethereum withdrawal was initiated. A claim run
   * against 0 proves the wrong block and fails before Assert.
   */
  claimableEventBlockNumber: number;
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
  /** Graph (vault core) version of the vault. Delegated claim requires 3. */
  txGraphVersion: number;
  proverCircuitVersion: number;
  /**
   * Block of the finalized `VaultClaimableBy` event. Pass `0n` when the
   * withdrawal has not been initiated yet; whoever runs the claim must
   * correct it from chain first.
   */
  claimableEventBlockNumber: bigint;
}
