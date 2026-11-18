/**
 * Whether the PegIn is proven to have spent the vault's HTLC on Bitcoin.
 * Selects the Withdraw dialog's body only; the handler runs its own proof.
 */
export type WithdrawStuckProof = "proven" | "not-proven";
