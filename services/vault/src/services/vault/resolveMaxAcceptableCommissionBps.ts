/**
 * Resolve the depositor's per-deposit commission ceiling (`maxAcceptableCommissionBps`)
 * for a resume-time DepositTerms rebuild.
 *
 * `maxAcceptableCommissionBps` is a `submitPeginRequest` argument that the contract
 * bound-checks once and discards — it is never stored on-chain and (today) never
 * emitted. It is NOT the protocol floor `minVpCommissionBps` nor the stored
 * `vaultProviderCommissionBps` (the VP's actual commission); those are different values.
 *
 * TODO(#2252): once btc-vault emits `maxAcceptableCommissionBps` on `PegInSubmitted`
 * and the indexer exposes it, read that field directly. Until then this returns the
 * stored `vaultProviderCommissionBps` as an interim proxy.
 *
 * Why the proxy is safe for the Pre-PegIn broadcast resume: `commissionFee` is not part
 * of the Pre-PegIn signature, DERIVE_CONTEXT_HASH, or any byte-verification gate — only
 * the device's parse-time dust gate + on-screen display use it. The flow is feature-
 * flagged and pre-mainnet, so no user hits the interim. Caveat: the stored actual can dip
 * below the device dust floor for a very small pegin; the emitted ceiling removes that.
 */
export function resolveMaxAcceptableCommissionBps(vault: {
  vaultProviderCommissionBps: number;
}): number {
  // TODO(#2252): return vault.maxAcceptableCommissionBps once emitted on-chain.
  return vault.vaultProviderCommissionBps;
}
