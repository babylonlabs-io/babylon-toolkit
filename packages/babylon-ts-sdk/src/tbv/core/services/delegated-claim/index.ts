/**
 * Delegated claim (depositor-as-claimer) — artifact assembly and claim-time
 * execution.
 *
 * EXPERIMENTAL. This surface is still under test. It has been exercised end
 * to end on signet, not on mainnet, and no caller ships in this repo yet.
 * Treat the shape of every export here as provisional: names, parameters and
 * return types can change in a minor release. Pin the SDK version if you
 * build on it. The on-chain and file formats are not provisional — those are
 * owned by btc-vault and by the `VAULT_WASM_COMMIT` pin.
 *
 * Produces and checks the two files a claim runs from: `artifacts.json` and
 * `wots_keypair.json`. `vaultd vp wt` reads the same pair, so either can drive
 * the claim.
 *
 * Signing is split into plan → sign → assemble so a hardware wallet can sign
 * the set as ordered device ceremonies (Assert and the depositor Payout under
 * the vault's loaded intent, the rest after it is released) while software
 * wallets keep one batched prompt. `assembleWatchtowerArtifacts` is the
 * composition of the three.
 *
 * The on-chain side of a claim is read here too: `readDelegatedClaimVaultContext`
 * builds the vault context from the registry and its registration and
 * redemption logs, and `rebuildDepositTermsForClaim` (deposit-terms) rebuilds
 * the terms an approval wallet loads, with no vault provider and no indexer.
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
  SigningPlanMismatchError,
  assembleWatchtowerArtifactsFromSignatures,
  type AssembleFromSignaturesParams,
} from "./assembleWatchtowerArtifactsFromSignatures";
export {
  AssertBindingError,
  assertAssertBindsClaimAndPayout,
  type AssertAssertBindsClaimAndPayoutParams,
} from "./assertBinding";
export {
  ChallengerSetMismatchError,
  assertChallengerSetMatchesVault,
  type AssertChallengerSetMatchesVaultParams,
} from "./challengerBinding";
export {
  deriveClaimerWotsKeypair,
  type ClaimerWotsKeypair,
  type DeriveClaimerWotsKeypairParams,
} from "./deriveClaimerWotsKeypair";
export {
  PayoutDestinationError,
  assertPayoutPaysRegisteredScript,
  type AssertPayoutPaysRegisteredScriptParams,
} from "./payoutBinding";
export {
  PayoutInputLeafError,
  copyAssertConnectorLeaf,
  type CopyAssertConnectorLeafParams,
} from "./payoutInputLeaf";
export {
  planDelegatedClaimSigning,
  type PlanDelegatedClaimSigningParams,
} from "./planDelegatedClaimSigning";
export {
  readDelegatedClaimVaultContext,
  type DelegatedClaimVaultRead,
  type DelegatedClaimVaultReaders,
  type ReadDelegatedClaimVaultContextParams,
} from "./readDelegatedClaimVaultContext";
export {
  ArtifactsVaultMismatchError,
  DELEGATED_CLAIM_TX_GRAPH_VERSION,
  assertArtifactsUsableForVault,
  summarizeWatchtowerArtifacts,
  type AssertArtifactsUsableParams,
} from "./readWatchtowerArtifacts";
export {
  DelegatedClaimSigningIncompleteError,
  assertTermsMatchVault,
  signDelegatedClaimPlan,
  type DelegatedClaimPsbtSigner,
  type SignDelegatedClaimPlanOptions,
} from "./signDelegatedClaimPlan";
export { BABE_SESSION_PLACEHOLDER_DECRYPTOR_HEX } from "./types";
export type {
  ClaimerArtifactsSource,
  DelegatedClaimSignatures,
  DelegatedClaimSigningKind,
  DelegatedClaimSigningPlan,
  DelegatedClaimSigningRequest,
  DelegatedClaimVaultContext,
  WatchtowerArtifactsSummary,
} from "./types";
export {
  VaultIdBindingError,
  assertClaimSpendsVault,
  type AssertClaimSpendsVaultParams,
} from "./vaultIdBinding";

/**
 * Claim-time execution, artifacts in and artifacts out.
 *
 * The least settled part of an already experimental module: these four are
 * re-exports of the WASM surface and have no caller in this repo. They were
 * run end to end on signet from a browser page that is not part of this
 * package. Expect them to be reshaped, renamed, or wrapped before they are
 * stable.
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
  attachFinalizedAssert,
  finalizePayout,
  finalizeWronglyChallenged,
  pinPegoutProof,
} from "../../wasm";
