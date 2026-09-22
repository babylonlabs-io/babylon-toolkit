/**
 * Builds every PSBT a delegated claim signs and binds them to the vault
 * before any wallet prompt, returning an immutable signing plan.
 *
 * Nothing here talks to a wallet. The plan is what `signDelegatedClaimPlan`
 * signs and what `assembleWatchtowerArtifactsFromSignatures` rebuilds and
 * byte-compares against, so the checks run once, here, and the assembler
 * proves the same PSBTs were signed.
 *
 * @module services/delegated-claim/planDelegatedClaimSigning
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";

import {
  buildAssertClaimerPsbt,
  buildClaimPsbt,
  buildPayoutClaimerPsbt,
  buildPayoutDepositorPsbt,
  buildWronglyChallengedPsbts,
} from "../../wasm";

import { assertAssertBindsClaimAndPayout } from "./assertBinding";
import { assertChallengerSetMatchesVault } from "./challengerBinding";
import { assertPayoutPaysRegisteredScript } from "./payoutBinding";
import { copyAssertConnectorLeaf } from "./payoutInputLeaf";
import {
  buildDelegatedClaimSigningRequests,
  type DelegatedClaimPsbtSet,
} from "./signingRequests";
import type {
  ClaimerArtifactsSource,
  DelegatedClaimSigningPlan,
  DelegatedClaimVaultContext,
} from "./types";
import { assertClaimSpendsVault, peginTxidFromClaimPsbt } from "./vaultIdBinding";

/** @experimental */
export interface PlanDelegatedClaimSigningParams {
  /** Depositor's BTC public key (compressed or x-only hex). */
  depositorPublicKey: string;
  /** Network the depositor's address is derived on, to check the signer. */
  btcNetwork: Network;
  /** Graph and verifying key as the vault provider returned them. */
  source: ClaimerArtifactsSource;
  vault: DelegatedClaimVaultContext;
  /** See {@link AssembleWatchtowerArtifactsParams.babeSessionsJson}. */
  babeSessionsJson?: string;
}

/**
 * Build the five PSBT groups from the graph and run every binding check.
 * Shared with the assembler, which rebuilds the same set to prove the plan
 * it is given was not altered.
 *
 * @internal
 * @experimental
 */
export async function buildBoundPsbtSet(
  txGraphVersion: number,
  graphJson: string,
  vault: DelegatedClaimVaultContext,
  depositorPublicKey: string,
): Promise<DelegatedClaimPsbtSet> {
  const [claim, assert, payoutClaimer, wronglyChallenged, payoutDepositorRaw] =
    await Promise.all([
      buildClaimPsbt(txGraphVersion, graphJson),
      buildAssertClaimerPsbt(txGraphVersion, graphJson),
      buildPayoutClaimerPsbt(txGraphVersion, graphJson),
      buildWronglyChallengedPsbts(txGraphVersion, graphJson),
      buildPayoutDepositorPsbt(txGraphVersion, graphJson),
    ]);

  // The graph arrives from the vault provider and carries no proof that it
  // belongs to this vault. The Claim's first input spends the PegIn output
  // the on-chain vault id is derived from, so that input is the binding.
  assertClaimSpendsVault({
    peginTxid: peginTxidFromClaimPsbt(claim),
    depositorEthAddress: vault.depositorEthAddress,
    expectedVaultId: vault.vaultId,
  });

  // The Assert we sign must be the one the Payout's input 1 spends, and
  // must itself spend Claim:0. Checked on the builder's own PSBTs, before
  // the depositor Payout is augmented.
  assertAssertBindsClaimAndPayout({
    claimPsbtBase64: claim,
    assertPsbtBase64: assert,
    payoutClaimerPsbtBase64: payoutClaimer,
  });

  // Where the money lands. Both PSBTs describe the same Payout transaction,
  // so both are checked.
  for (const psbtBase64 of [payoutClaimer, payoutDepositorRaw]) {
    assertPayoutPaysRegisteredScript({
      payoutPsbtBase64: psbtBase64,
      registeredPayoutScriptPubKey: vault.registeredPayoutScriptPubKey,
    });
  }

  // Who can be answered later.
  assertChallengerSetMatchesVault({
    graphChallengerPubkeys: Object.keys(wronglyChallenged),
    depositorBtcPubkey: depositorPublicKey,
    vaultProviderBtcPubkey: vault.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: vault.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: vault.universalChallengerBtcPubkeys,
  });

  const payoutDepositor = copyAssertConnectorLeaf({
    payoutDepositorPsbtBase64: payoutDepositorRaw,
    payoutClaimerPsbtBase64: payoutClaimer,
  });

  return { claim, assert, payoutClaimer, payoutDepositor, wronglyChallenged };
}

/**
 * @throws If the graph is not version 3, or any binding check fails.
 * @experimental
 */
export async function planDelegatedClaimSigning(
  params: PlanDelegatedClaimSigningParams,
): Promise<DelegatedClaimSigningPlan> {
  const psbts = await buildBoundPsbtSet(
    params.vault.txGraphVersion,
    params.source.txGraphJson,
    params.vault,
    params.depositorPublicKey,
  );
  return {
    depositorPublicKey: params.depositorPublicKey,
    btcNetwork: params.btcNetwork,
    source: params.source,
    vault: params.vault,
    babeSessionsJson: params.babeSessionsJson,
    requests: buildDelegatedClaimSigningRequests(psbts),
  };
}
