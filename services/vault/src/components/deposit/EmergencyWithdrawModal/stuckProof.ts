/**
 * What is known when the Withdraw dialog opens. Selects the dialog's body
 * only; the handler runs its own proof.
 * - `proven`: the PegIn is proven to have spent the vault's HTLC on Bitcoin.
 * - `not-proven`: no such proof, and the failure that opened the dialog was
 *   not a mined reveal. An earlier mined reveal may have published the secret.
 * - `not-proven-secret-public`: no such proof, and the failure that opened
 *   the dialog was a mined reveal, which published the secret.
 */
export type WithdrawStuckProof =
  | "proven"
  | "not-proven"
  | "not-proven-secret-public";
