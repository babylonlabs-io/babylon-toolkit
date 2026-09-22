/**
 * Host-side verification of one delegated-claim signature against the
 * request it answers, shared by the signer and the assembler.
 *
 * Critical path 8: a wallet may ignore the untweaked-signer flag, so a
 * signature is only accepted once it verifies against the PSBT that was
 * requested and the depositor's x-only key.
 *
 * @module services/delegated-claim/verifySignatureForRequest
 */

import { Buffer } from "buffer";

import { assertScriptPathSchnorrSignature } from "../../primitives";

import type { DelegatedClaimSigningPlan, DelegatedClaimSigningRequest } from "./types";
import { xOnlyHex } from "./walletIdentity";

/**
 * @throws If `signatureHex` is not a valid script-path signature by the
 *         plan's depositor over `request`'s PSBT and input.
 * @internal
 * @experimental
 */
export function assertSignatureForRequest(
  plan: DelegatedClaimSigningPlan,
  request: DelegatedClaimSigningRequest,
  signatureHex: string,
): void {
  assertScriptPathSchnorrSignature({
    requestedPsbtHex: psbtBase64ToHex(request.psbtBase64),
    signatureHex,
    signerXOnlyPubkeyHex: xOnlyHex(plan.depositorPublicKey),
    inputIndex: request.inputIndex,
  });
}

// The WASM graph emits and reads PSBTs as base64; wallets and the verifier
// take them as hex. Re-encode the same bytes; never parse.

/**
 * @internal
 * @experimental
 */
export function psbtBase64ToHex(psbtBase64: string): string {
  return Buffer.from(psbtBase64, "base64").toString("hex");
}

/**
 * @internal
 * @experimental
 */
export function psbtHexToBase64(psbtHex: string): string {
  return Buffer.from(psbtHex, "hex").toString("base64");
}
