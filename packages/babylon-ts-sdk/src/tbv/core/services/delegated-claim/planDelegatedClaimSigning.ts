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

import { assertPayoutScriptMatchesPopKey } from "../../clients/eth/payout-script";
import { ensureHexPrefix } from "../../primitives/utils/bitcoin";
import {
  buildAssertClaimerPsbt,
  buildClaimPsbt,
  buildPayoutClaimerPsbt,
  buildPayoutDepositorPsbt,
  buildWronglyChallengedPsbts,
} from "../../wasm";

import { assertAssertBindsClaimAndPayout } from "./assertBinding";
import { assertPayoutFeeAndTimelocks } from "./assertPayoutFeeAndTimelocks";
import { assertChallengerSetMatchesVault } from "./challengerBinding";
import { assertPayoutPaysRegisteredScript } from "./payoutBinding";
import { copyAssertConnectorLeaf } from "./payoutInputLeaf";
import { DELEGATED_CLAIM_TX_GRAPH_VERSION } from "./readWatchtowerArtifacts";
import {
  buildDelegatedClaimSigningRequests,
  type DelegatedClaimPsbtSet,
} from "./signingRequests";
import type {
  ClaimerArtifactsSource,
  DelegatedClaimSigningPlan,
  DelegatedClaimVaultContext,
} from "./types";
import {
  assertClaimSpendsVault,
  peginTxidFromClaimPsbt,
} from "./vaultIdBinding";
import { assertVerifyingKeyIsTrusted } from "./verifyingKeyBinding";
import { xOnlyHex } from "./walletIdentity";

/** @experimental */
export interface PlanDelegatedClaimSigningParams {
  /**
   * Depositor's BTC public key (compressed or x-only hex). A vault that
   * registered a P2WPKH payout script needs the compressed key here, as at
   * registration: the x-only form cannot derive a P2WPKH script.
   */
  depositorPublicKey: string;
  /** Network the depositor's address is derived on, to check the signer. */
  btcNetwork: Network;
  /** Graph and verifying key as the vault provider returned them. */
  source: ClaimerArtifactsSource;
  /** See {@link DelegatedClaimSigningPlan.trustedVerifyingKeyHex}. */
  trustedVerifyingKeyHex: string;
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
  // The wallet-identity and signature checks compare against this key, so it
  // has to be the chain's — and in a form the signer accepts, which is the
  // compressed or x-only one, never the 65-byte uncompressed key.
  const depositorXOnly = xOnlyHex(depositorPublicKey);
  if (depositorXOnly !== vault.depositorBtcPubkey) {
    throw new Error(
      `Depositor key ${depositorXOnly} is not the vault's registered depositor key ${vault.depositorBtcPubkey}; refusing to plan a claim for another key.`,
    );
  }

  // Otherwise the destination the whole claim pays rests on the RPC node's
  // registration log alone. The two forms are this SDK's registration rule
  // (`clients/eth/payout-script.ts`, called from pegin-registration-client.ts:407),
  // not the contract's — it bounds the script's length alone.
  try {
    assertPayoutScriptMatchesPopKey(
      ensureHexPrefix(vault.registeredPayoutScriptPubKey),
      vault.depositorBtcPubkey,
      depositorPublicKey,
    );
  } catch (cause) {
    throw new Error(
      `Registered payout script ${vault.registeredPayoutScriptPubKey} failed the depositor-key ` +
        `derivation check: ${cause instanceof Error ? cause.message : String(cause)}. This SDK ` +
        `registers only P2TR of the depositor's x-only key or P2WPKH of the compressed key (the ` +
        `contract bounds the script's length alone, PeginLogic.sol:237-240 @ c559f5c2); refusing ` +
        `to sign a claim that pays it.`,
      { cause },
    );
  }

  // Vaults on graph v1 and v2 have no delegated-claim path at all, so the
  // builders below would be asked for transactions that do not exist.
  if (txGraphVersion !== DELEGATED_CLAIM_TX_GRAPH_VERSION) {
    throw new Error(
      `Graph version ${txGraphVersion} is not the delegated-claim graph version ` +
        `${DELEGATED_CLAIM_TX_GRAPH_VERSION}; vaults on earlier graphs have no delegated-claim path.`,
    );
  }

  // One axis under two names (readDelegatedClaimVaultContext): the builders
  // pick the graph model by the first, the fee band by the second.
  if (txGraphVersion !== vault.vaultCoreVersion) {
    throw new Error(
      `Graph version ${txGraphVersion} does not match the vault context's vault core version ${vault.vaultCoreVersion}; they are one axis and must agree.`,
    );
  }

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
      depositorBtcPubkey: vault.depositorBtcPubkey,
    });
  }

  // Byte-compares the two unsigned transactions, so from here the depositor
  // PSBT is proved to describe the same Payout the Assert binding tied to this
  // vault's PegIn and Assert.
  const payoutDepositor = copyAssertConnectorLeaf({
    payoutDepositorPsbtBase64: payoutDepositorRaw,
    payoutClaimerPsbtBase64: payoutClaimer,
  });

  // How much of the money reaches it: the CSV sequences the signature commits
  // to, and the fee the difference between inputs and outputs burns. Both
  // PSBTs go in because the declared prevout amounts live in each one's input
  // map, which the byte-equality above does not cover.
  await assertPayoutFeeAndTimelocks({
    payoutClaimerPsbtBase64: payoutClaimer,
    payoutDepositorPsbtBase64: payoutDepositor,
    assertPsbtBase64: assert,
    vault,
  });

  // Who can be answered later.
  assertChallengerSetMatchesVault({
    graphChallengerPubkeys: Object.keys(wronglyChallenged),
    depositorBtcPubkey: depositorPublicKey,
    vaultProviderBtcPubkey: vault.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: vault.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: vault.universalChallengerBtcPubkeys,
  });

  return { claim, assert, payoutClaimer, payoutDepositor, wronglyChallenged };
}

/**
 * @throws If the vault provider's verifying key is not the trusted one, if
 *         `depositorPublicKey` is not the vault's registered depositor key,
 *         the registered payout script is not derived from it,
 *         the graph version and the vault context's vault core version
 *         disagree, the graph is not version 3, any binding check fails, or
 *         the Payout's CSV sequences, declared prevout amounts or implicit fee
 *         do not match the vault's stamped timelocks, its PegIn and Assert
 *         outputs, and the fee band.
 * @experimental
 */
export async function planDelegatedClaimSigning(
  params: PlanDelegatedClaimSigningParams,
): Promise<DelegatedClaimSigningPlan> {
  // Before anything is built or prompted: a substituted key would let a proof
  // the depositor never authorized pass the pre-Assert check (btc-vault
  // `delegated_claim.rs:405-414` @ ac4954e7).
  assertVerifyingKeyIsTrusted({
    servedVerifyingKeyHex: params.source.verifyingKeyHex,
    trustedVerifyingKeyHex: params.trustedVerifyingKeyHex,
    proverCircuitVersion: params.vault.proverCircuitVersion,
  });

  const psbts = await buildBoundPsbtSet(
    params.vault.txGraphVersion,
    params.source.txGraphJson,
    params.vault,
    params.depositorPublicKey,
  );
  return {
    depositorPublicKey: params.depositorPublicKey,
    btcNetwork: params.btcNetwork,
    trustedVerifyingKeyHex: params.trustedVerifyingKeyHex,
    source: params.source,
    vault: params.vault,
    babeSessionsJson: params.babeSessionsJson,
    requests: buildDelegatedClaimSigningRequests(psbts),
  };
}
