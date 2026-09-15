/**
 * Delegated claim (depositor-as-claimer) — watchtower artifact assembly.
 *
 * Produces and checks the two files the `vaultd vp wt` watchtower CLI reads
 * to claim a vault without the vault provider: `artifacts.json` and
 * `wots_keypair.json`.
 *
 * Claim-time execution is not here. Proof generation, Assert/Payout
 * finalization, the WronglyChallenged response and race monitoring all run in
 * the watchtower CLI, against the files this module produces.
 *
 * @see btc-vault docs/delegated_claim.md
 * @module services/delegated-claim
 */

export {
  assembleWatchtowerArtifacts,
  type AssembleWatchtowerArtifactsParams,
} from "./assembleWatchtowerArtifacts";
export {
  deriveClaimerWotsKeypair,
  type ClaimerWotsKeypair,
  type DeriveClaimerWotsKeypairParams,
} from "./deriveClaimerWotsKeypair";
export {
  ArtifactsVaultMismatchError,
  DELEGATED_CLAIM_TX_GRAPH_VERSION,
  assertArtifactsUsableForVault,
  summarizeWatchtowerArtifacts,
  type AssertArtifactsUsableParams,
} from "./readWatchtowerArtifacts";
export type {
  ClaimerArtifactsSource,
  DelegatedClaimVaultContext,
  WatchtowerArtifactsSummary,
} from "./types";

/**
 * Claim-time execution, artifacts in and artifacts out.
 *
 * `pinPegoutProof` verifies the prover's Groth16 proof and writes it into the
 * artifacts; `attachFinalizedAssert` then finalizes the Assert from that
 * pinned proof and the depositor's WOTS keypair, so the keypair never leaves
 * the caller. `finalizePayout` and `finalizeWronglyChallenged` return
 * broadcastable transaction hex from the signatures the file already carries.
 *
 * Persist the JSON `pinPegoutProof` returns before the Assert is broadcast: a
 * one-time WOTS keypair signs exactly one proof, and a second, different one
 * is refused.
 */
export {
  pinPegoutProof,
  attachFinalizedAssert,
  finalizePayout,
  finalizeWronglyChallenged,
} from "../../wasm";
