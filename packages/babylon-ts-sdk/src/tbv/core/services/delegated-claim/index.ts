/**
 * Delegated claim (depositor-as-claimer) — artifact assembly and claim-time
 * execution.
 *
 * Produces and checks the two files a claim runs from: `artifacts.json` and
 * `wots_keypair.json`. `vaultd vp wt` reads the same pair, so either can drive
 * the claim.
 *
 * Claim time is here as well. From an assembled `artifacts.json` this module
 * pins the Groth16 proof, finalizes the Assert, and produces the Payout and
 * WronglyChallenged transactions, so a depositor whose vault provider is gone
 * completes a claim without running the CLI.
 *
 * Two things stay outside: the proof itself comes from the prover service,
 * and nothing here watches the chain — a ChallengeAssert must be answered
 * inside `timelock_challenge_assert`, and noticing one is the caller's job.
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
