/**
 * Typed rejection contract for deposit-terms approval. Providers cannot import
 * this class (no dependency edge between the packages), so the cross-package
 * contract is the error SHAPE on {@link DepositTermsApprover}. Consumers land
 * with the first provider (#2109) and its app error mapping (#2110).
 *
 * @module deposit-terms/depositTermsErrors
 */

/** The `name` value providers must set on envelope rejections (the wire contract). */
export const DEPOSIT_TERMS_REJECTED_ERROR_NAME = "DepositTermsRejectedError";

/** Why the terms were rejected before approval. */
export type DepositTermsRejectionReason = "device-envelope";

/** SDK-owned typed rejection thrown when deposit terms fail pre-approval validation. */
export class DepositTermsRejectedError extends Error {
  readonly reason: DepositTermsRejectionReason;

  constructor(
    message: string,
    reason: DepositTermsRejectionReason = "device-envelope",
  ) {
    super(message);
    this.name = DEPOSIT_TERMS_REJECTED_ERROR_NAME;
    this.reason = reason;
  }
}

/**
 * Guard for app-side error mapping. Matches `instanceof` OR the documented
 * `name` — providers and foreign realms throw structurally-conforming plain
 * errors that `instanceof` cannot see.
 */
export function isDepositTermsRejectedError(
  err: unknown,
): err is DepositTermsRejectedError {
  if (err instanceof DepositTermsRejectedError) return true;
  if (typeof err !== "object" || err === null) return false;
  const shaped = err as { name?: unknown; reason?: unknown };
  // The documented provider shape REQUIRES the reason; a name-only match is
  // a contract violation and propagates unnormalized.
  return (
    shaped.name === DEPOSIT_TERMS_REJECTED_ERROR_NAME &&
    shaped.reason === "device-envelope"
  );
}
