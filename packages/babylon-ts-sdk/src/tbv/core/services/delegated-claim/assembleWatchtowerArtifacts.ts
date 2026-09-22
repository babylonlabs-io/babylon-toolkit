/**
 * Watchtower artifact assembly for the delegated claim.
 *
 * Collects every claimer-side signature the `vaultd vp wt` watchtower CLI
 * will need — in one batched wallet interaction — and bundles them with the
 * vault provider's transaction graph into an `artifacts.json`.
 *
 * Do this while the vault provider is still online and the depositor is
 * still at the keyboard. The signatures are Taproot script-path signatures
 * whose sighashes do not cover witness data, so they stay valid however the
 * claim later plays out: the WOTS values, the Groth16 proof, and the hashlock
 * preimages are all witness-only. That is what lets one signing session
 * authorize a claim that runs months later without the depositor present.
 *
 * @module services/delegated-claim/assembleWatchtowerArtifacts
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";

import type { BitcoinWallet } from "../../../../shared/wallets/interfaces";
import type { DepositTerms } from "../../deposit-terms/depositTerms";
import type { VaultContextInput } from "../../vault-secrets";

import { assembleWatchtowerArtifactsFromSignatures } from "./assembleWatchtowerArtifactsFromSignatures";
import { planDelegatedClaimSigning } from "./planDelegatedClaimSigning";
import { signDelegatedClaimPlan } from "./signDelegatedClaimPlan";
import type {
  ClaimerArtifactsSource,
  DelegatedClaimVaultContext,
} from "./types";

/**
 * Everything one delegated-claim signing session needs.
 *
 * @experimental
 */
export interface AssembleWatchtowerArtifactsParams {
  /** Wallet holding the depositor key the graph was built with. */
  btcWallet: BitcoinWallet;
  /** Depositor's BTC public key (compressed or x-only hex). */
  depositorPublicKey: string;
  /** Network the depositor's address is derived on, to check the signer. */
  btcNetwork: Network;
  /** Graph and verifying key as the vault provider returned them. */
  source: ClaimerArtifactsSource;
  /** See {@link DelegatedClaimSigningPlan.trustedVerifyingKeyHex}. */
  trustedVerifyingKeyHex: string;
  vault: DelegatedClaimVaultContext;
  /**
   * Per-challenger BaBe sessions as `{"<pk>": {"decryptor_artifacts_hex":
   * "..."}}`, passed through into the file unchanged.
   *
   * The WASM builder and verifier require an entry for every challenger of
   * the graph (btc-vault `validate_babe_sessions`); an omitted value becomes
   * `{}` and is refused on any real graph. Real sessions run to hundreds of
   * megabytes per challenger, so a browser caller passes a placeholder map
   * (one {@link BABE_SESSION_PLACEHOLDER_DECRYPTOR_HEX} entry per challenger)
   * and joins the real sessions into the file downstream —
   * `assertArtifactsUsableForVault` refuses a file that still carries one.
   */
  babeSessionsJson?: string;
  /**
   * Required for approval-capable wallets (the `DepositTermsApprover` seam):
   * the terms that load this vault's intent on the device. Resume flows
   * rebuild them from on-chain state.
   */
  depositTerms?: DepositTerms;
  /**
   * Required for approval-capable wallets: the context the vault root derives
   * from; its depositor key must be the vault's registered key, checked before
   * any device I/O.
   */
  vaultContext?: VaultContextInput;
}

/**
 * Signs the delegated-claim set and returns the `artifacts.json` content,
 * ready to write verbatim.
 *
 * Composition of {@link planDelegatedClaimSigning},
 * {@link signDelegatedClaimPlan} and
 * {@link assembleWatchtowerArtifactsFromSignatures}. Software wallets sign
 * in one batched prompt; approval-capable wallets sign as ordered device
 * ceremonies. Every signature is verified against the graph before the
 * file is produced. This one-shot forwards neither `signal` nor `resume`;
 * callers needing those use the split.
 *
 * Experimental: this API can change in a minor release. Pin the SDK
 * version if you build on it.
 *
 * @throws If the vault provider's verifying key is not `trustedVerifyingKeyHex`,
 *         if the graph is not version 3, if a binding check fails, if the
 *         wallet returns a signature that does not verify, or if the graph's
 *         own presignatures are incomplete.
 * @experimental
 */
export async function assembleWatchtowerArtifacts(
  params: AssembleWatchtowerArtifactsParams,
): Promise<string> {
  const plan = await planDelegatedClaimSigning({
    depositorPublicKey: params.depositorPublicKey,
    btcNetwork: params.btcNetwork,
    source: params.source,
    trustedVerifyingKeyHex: params.trustedVerifyingKeyHex,
    vault: params.vault,
    babeSessionsJson: params.babeSessionsJson,
  });
  const signatures = await signDelegatedClaimPlan(plan, params.btcWallet, {
    depositTerms: params.depositTerms,
    vaultContext: params.vaultContext,
  });
  return assembleWatchtowerArtifactsFromSignatures({ plan, signatures });
}
