/**
 * Protocol-level deposit terms for intent-based signing wallets (e.g. the
 * Ledger vault provider): the `DepositTerms` shape an approval-capable wallet
 * is shown before any deposit signature, the thin `buildDepositTerms`
 * projection, and the `supportsDepositApproval` capability probe. Device
 * wire-format concerns (TLV framing, SLIP-44, byte order) are provider-side.
 *
 * @module deposit-terms
 */
export * from "./buildDepositTerms";
export * from "./depositTerms";
export * from "./depositTermsErrors";
