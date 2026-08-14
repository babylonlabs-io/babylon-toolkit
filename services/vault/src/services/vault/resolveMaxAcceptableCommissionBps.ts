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
 * and the indexer exposes it, read that field directly. Until then this validates the
 * stored `vaultProviderCommissionBps` against the protocol range and applies the same
 * `capMaxAcceptableCommissionBps` policy the fresh path uses, so the rebuilt ceiling
 * clears the device's dust floor exactly as the original did.
 *
 * Why the proxy is safe for the Pre-PegIn broadcast resume: `commissionFee` is not part
 * of the Pre-PegIn signature, DERIVE_CONTEXT_HASH, or any byte-verification gate — only
 * the device's parse-time dust gate + on-screen display use it. The flow is feature-
 * flagged and pre-mainnet, so no user hits the interim. Remaining caveat: if the VP's
 * commission drifted between quote and registration, the rebuilt ceiling can differ
 * from the originally submitted one by up to 25 bps until #2252 lands.
 */

import { capMaxAcceptableCommissionBps } from "@babylonlabs-io/ts-sdk/tbv/core";

import { assertVpCommissionInProtocolRange } from "./vaultPayoutSignatureService";

export function resolveMaxAcceptableCommissionBps(
  vault: { vaultProviderCommissionBps: number },
  minVpCommissionBps: number,
): number {
  assertVpCommissionInProtocolRange(
    vault.vaultProviderCommissionBps,
    minVpCommissionBps,
  );
  // TODO(#2252): return the emitted maxAcceptableCommissionBps once available.
  return capMaxAcceptableCommissionBps(vault.vaultProviderCommissionBps);
}
