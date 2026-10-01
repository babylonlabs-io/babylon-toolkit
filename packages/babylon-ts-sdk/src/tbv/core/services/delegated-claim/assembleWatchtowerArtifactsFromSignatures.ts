/**
 * Turns a signed delegated-claim plan into `artifacts.json`.
 *
 * Neither input is trusted as-is. Every PSBT is rebuilt from the graph and
 * byte-compared against the plan, so a caller that altered a request between
 * planning and signing fails here rather than producing a file whose
 * signatures verify against transactions nobody checked; and every signature
 * is verified against the rebuilt PSBT and the depositor key, so the map need
 * not come from `signDelegatedClaimPlan` to be safe.
 *
 * @module services/delegated-claim/assembleWatchtowerArtifactsFromSignatures
 */

import type { WronglyChallengedSigs } from "../../wasm";
import { buildWatchtowerArtifacts, finalizeClaimTx } from "../../wasm";

import { buildBoundPsbtSet } from "./planDelegatedClaimSigning";
import {
  buildDelegatedClaimSigningRequests,
  wronglyChallengedRequestId,
} from "./signingRequests";
import type {
  DelegatedClaimSignatures,
  DelegatedClaimSigningPlan,
  DelegatedClaimSigningRequest,
} from "./types";
import { assertSignatureForRequest } from "./verifySignatureForRequest";
import { assertVerifyingKeyIsTrusted } from "./verifyingKeyBinding";

/**
 * Thrown when a plan's requests differ from the ones the graph builds now.
 *
 * @experimental
 */
export class SigningPlanMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SigningPlanMismatchError";
  }
}

/**
 * A signed plan: the plan as it was handed to the signer, and the signatures
 * it produced.
 *
 * @experimental
 */
export interface AssembleFromSignaturesParams {
  plan: DelegatedClaimSigningPlan;
  signatures: DelegatedClaimSignatures;
}

/**
 * Proves the plan's requests are, field for field, the ones the graph builds.
 * Positional: the rebuilt list is canonical, so a reorder reports as an id
 * mismatch at the first position that differs.
 */
function assertPlanMatchesRebuilt(
  given: readonly DelegatedClaimSigningRequest[],
  rebuilt: readonly DelegatedClaimSigningRequest[],
): void {
  if (given.length !== rebuilt.length) {
    throw new SigningPlanMismatchError(
      `Plan has ${given.length} requests but the graph builds ${rebuilt.length}; the plan was altered after planning.`,
    );
  }
  for (let i = 0; i < rebuilt.length; i++) {
    const expected = rebuilt[i];
    const request = given[i];
    if (request.id !== expected.id) {
      throw new SigningPlanMismatchError(
        `Plan request at position ${i} is "${request.id}" but the graph builds "${expected.id}" there; the plan was altered after planning.`,
      );
    }
    if (request.kind !== expected.kind) {
      throw new SigningPlanMismatchError(
        `Plan request "${request.id}" has kind "${request.kind}" but the graph builds "${expected.kind}"; the plan was altered after planning.`,
      );
    }
    if (request.inputIndex !== expected.inputIndex) {
      throw new SigningPlanMismatchError(
        `Plan request "${request.id}" signs inputIndex ${request.inputIndex} but the graph builds ${expected.inputIndex}; the plan was altered after planning.`,
      );
    }
    if (request.psbtBase64 !== expected.psbtBase64) {
      throw new SigningPlanMismatchError(
        `Plan request "${request.id}" carries a psbt that differs from the one the graph builds; the plan was altered after planning.`,
      );
    }
  }
}

/** One signature per request, no more and no fewer. */
function assertSignaturesCoverRequests(
  requests: readonly DelegatedClaimSigningRequest[],
  signatures: DelegatedClaimSignatures,
): void {
  const requestIds = new Set(requests.map((request) => request.id));
  const missing = [...requestIds].filter((id) => !signatures.has(id));
  const extra = [...signatures.keys()].filter((id) => !requestIds.has(id));
  if (missing.length === 0 && extra.length === 0) return;
  const quoted = (ids: string[]) => ids.map((id) => `"${id}"`).join(", ");
  throw new Error(
    `Signatures do not cover the plan: ${signatures.size} signatures for ${requests.length} requests` +
      (missing.length > 0 ? `; missing ${quoted(missing)}` : "") +
      (extra.length > 0 ? `; extra ${quoted(extra)}` : "") +
      ".",
  );
}

function requireSignature(
  signatures: DelegatedClaimSignatures,
  id: string,
): string {
  const signatureHex = signatures.get(id);
  // Unreachable after assertSignaturesCoverRequests; kept for type narrowing.
  if (signatureHex === undefined) {
    throw new Error(
      `No signature for request "${id}"; the plan was not fully signed.`,
    );
  }
  return signatureHex;
}

/**
 * Rebuilds the PSBT set from the plan's graph and vault, proves the plan's
 * requests equal it, verifies every signature against the rebuilt request,
 * then routes each signature to its artifacts field. Only the rebuilt set
 * feeds the file; the plan's own PSBT bytes are compared and never used.
 *
 * @throws {SigningPlanMismatchError} If any request's id, kind, input index
 *         or PSBT differs from the one the graph builds now.
 * @throws If the plan's vault-provider verifying key is not its trusted one,
 *         a request has no signature, a signature has no request, a
 *         signature does not verify against its rebuilt request, a binding
 *         check on the rebuilt set fails, or the Rust verification of the
 *         bundle fails.
 * @experimental
 */
export async function assembleWatchtowerArtifactsFromSignatures(
  params: AssembleFromSignaturesParams,
): Promise<string> {
  const { plan, signatures } = params;
  const { txGraphVersion } = plan.vault;
  const graphJson = plan.source.txGraphJson;

  // The plan is a plain object, so the planner's comparison is re-run here on
  // the key that is actually about to be written into the file.
  const trustedVerifyingKeyHex = assertVerifyingKeyIsTrusted({
    servedVerifyingKeyHex: plan.source.verifyingKeyHex,
    trustedVerifyingKeyHex: plan.trustedVerifyingKeyHex,
    proverCircuitVersion: plan.vault.proverCircuitVersion,
  });

  const psbts = await buildBoundPsbtSet(
    txGraphVersion,
    graphJson,
    plan.vault,
    plan.depositorPublicKey,
  );
  const rebuilt = buildDelegatedClaimSigningRequests(psbts);
  assertPlanMatchesRebuilt(plan.requests, rebuilt);
  assertSignaturesCoverRequests(rebuilt, signatures);
  // Against the rebuilt request, so a caller-supplied map is held to the same
  // bar as one the signer produced.
  for (const request of rebuilt) {
    assertSignatureForRequest(
      plan,
      request,
      requireSignature(signatures, request.id),
    );
  }

  // Keyed off the rebuilt set, so each signature lands on the challenger and
  // garbled-circuit index the graph built its PSBT for.
  const wronglyChallengedSigs: WronglyChallengedSigs = {};
  for (const challengerPubkey of Object.keys(psbts.wronglyChallenged)) {
    wronglyChallengedSigs[challengerPubkey] = psbts.wronglyChallenged[
      challengerPubkey
    ].map((_, gcIndex) =>
      requireSignature(
        signatures,
        wronglyChallengedRequestId(challengerPubkey, gcIndex),
      ),
    );
  }

  const signedClaimTxHex = await finalizeClaimTx(
    txGraphVersion,
    graphJson,
    requireSignature(signatures, "claim"),
  );

  return buildWatchtowerArtifacts({
    txGraphVersion,
    graphJson,
    signedClaimTxHex,
    assertClaimerSigHex: requireSignature(signatures, "assert"),
    payoutClaimerSigHex: requireSignature(signatures, "payoutClaimer"),
    wronglyChallengedSigs,
    depositorPayoutSigHex: requireSignature(signatures, "payoutDepositor"),
    verifyingKeyHex: trustedVerifyingKeyHex,
    claimableEventBlockNumber: plan.vault.claimableEventBlockNumber,
    proverCircuitVersion: plan.vault.proverCircuitVersion,
    vaultIdHex: plan.vault.vaultId,
    babeSessionsJson: plan.babeSessionsJson,
    expectedVaultCoreVersion: plan.vault.vaultCoreVersion,
  });
}
