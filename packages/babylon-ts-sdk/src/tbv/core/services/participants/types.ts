/**
 * Types for RFC-006 participant operation-key resolution.
 *
 * @module services/participants/types
 */

import type { Address } from "viem";

import type {
  KeyEpochs,
  OnChainBtcPubkey,
  OperationKeyQuery,
} from "../../clients/eth/types";

/** One operator's resolved identity: who it is, and which key it signs with. */
export interface ResolvedParticipant {
  /**
   * The operator's admin ETH address — its stable identity and the lookup key
   * for its operation-key history. This is the roster entry's `ethAddress`.
   */
  adminAddress: Address;
  /**
   * The operator's genesis BTC key: its roster entry / registration key.
   * x-only, lowercase, no `0x`. Retained because indexer hints are still
   * expressed in these, and because a keeper's genesis is the fallback the
   * `...OrGenesis` getters resolve to.
   */
  genesisBtcPubkey: OnChainBtcPubkey;
  /**
   * The operation key this resolution produced — the key that actually goes
   * into the Bitcoin scripts. Equals `genesisBtcPubkey` until the operator
   * rotates.
   */
  operationBtcPubkey: OnChainBtcPubkey;
  /** Whether the operation key differs from the genesis key. */
  rotated: boolean;
}

/** How a {@link ParticipantKeySet} was resolved. Carried for diagnostics. */
export type KeyResolutionMode =
  | { mode: "current" }
  | { mode: "epochs"; epochs: KeyEpochs };

/**
 * Every participant's resolved operation key for one vault (or one about to be
 * created).
 *
 * The pairs are the source of truth; the sorted arrays are derived from them.
 * Never invert that. Rotation changes a key, and therefore changes where it
 * lands in the lexicographic sort, so an index-join from a sorted array back
 * to a roster entry is wrong the moment anyone rotates.
 */
export interface ParticipantKeySet {
  vaultProvider: ResolvedParticipant;
  vaultKeepers: ResolvedParticipant[];
  universalChallengers: ResolvedParticipant[];
  /** Sorted keeper operation keys — what script construction consumes. */
  vaultKeeperOperationKeysSorted: string[];
  /** Sorted challenger operation keys — what script construction consumes. */
  universalChallengerOperationKeysSorted: string[];
  /** Provenance of this resolution. */
  resolvedAt: KeyResolutionMode;
  /**
   * The rosters and addresses this set was resolved against.
   *
   * Carried so a later re-resolution — notably the post-registration
   * read-after-mine check — reuses the *same* roster rather than re-deriving
   * one that may since have moved, which would report a roster drift as a key
   * drift.
   */
  query: OperationKeyQuery;
}
