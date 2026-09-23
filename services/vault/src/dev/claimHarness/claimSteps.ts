/**
 * The SDK calls the page makes, one function per button, with the argument
 * plumbing in one place. Nothing here touches the DOM.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import {
  assembleWatchtowerArtifactsFromSignatures,
  assertArtifactsUsableForVault,
  attachFinalizedAssert,
  DELEGATED_CLAIM_TX_GRAPH_VERSION,
  DelegatedClaimSigningIncompleteError,
  deriveClaimerWotsKeypair,
  finalizePayout,
  finalizeWronglyChallenged,
  pinPegoutProof,
  planDelegatedClaimSigning,
  signDelegatedClaimPlan,
  type ClaimerWotsKeypair,
  type DelegatedClaimSignatures,
  type DelegatedClaimSigningPlan,
  type DepositTerms,
  type VaultContextInput,
  type WatchtowerArtifactsSummary,
} from "@babylonlabs-io/ts-sdk/tbv/core";
import { pushTx } from "@babylonlabs-io/ts-sdk/tbv/core/clients";

import { getMempoolApiUrl } from "@/clients/btc/config";
import { getBTCNetworkForWASM } from "@/config/pegin";

import type { ClaimerSource } from "./artifacts";
import { placeholderBabeSessionsJson } from "./babeSessionsPlaceholder";
import type { ClaimChainContext } from "./chainReads";

const TX_GRAPH_VERSION = DELEGATED_CLAIM_TX_GRAPH_VERSION;

/** Field names of the artifacts file the claim-time calls read and write. */
const CLAIM_TX_FIELD = "claim_tx";
const ASSERT_TX_HEX_FIELD = "assert_tx_hex";

export async function deriveWots(
  wallet: BitcoinWallet,
  chain: ClaimChainContext,
  source: ClaimerSource,
): Promise<ClaimerWotsKeypair> {
  return deriveClaimerWotsKeypair({
    btcWallet: wallet,
    vaultContext: chain.vaultContextInput,
    htlcVout: chain.htlcVout,
    txGraphJson: source.txGraphJson,
    txGraphVersion: TX_GRAPH_VERSION,
    expectedWotsPkHash: chain.depositorWotsPkHash,
  });
}

export async function buildPlan(
  chain: ClaimChainContext,
  source: ClaimerSource,
): Promise<DelegatedClaimSigningPlan> {
  return planDelegatedClaimSigning({
    depositorPublicKey: chain.depositorBtcPubkey,
    // Same WASM union as the terms rebuild; "testnet" and "signet" share one
    // bitcoinjs network in the SDK's address check (bitcoin.ts:327-329).
    btcNetwork: getBTCNetworkForWASM(),
    source,
    vault: chain.vault,
    // Carried on the plan, so the assembler's rebuild gets it too (Task 0).
    babeSessionsJson: placeholderBabeSessionsJson(chain.vault),
  });
}

type SignOutcome =
  | { ok: true; signatures: DelegatedClaimSignatures }
  | {
      ok: false;
      partial: DelegatedClaimSignatures;
      failedRequestId: string;
      error: Error;
    };

interface SignPlanOptions {
  depositTerms?: DepositTerms;
  vaultContext?: VaultContextInput;
  resume?: DelegatedClaimSignatures;
}

/**
 * An incomplete approval-wallet run is a result, not a failure: the partial
 * map is what "Resume" passes back. Every other error propagates.
 */
export async function signPlan(
  plan: DelegatedClaimSigningPlan,
  wallet: BitcoinWallet,
  opts: SignPlanOptions,
): Promise<SignOutcome> {
  try {
    return {
      ok: true,
      signatures: await signDelegatedClaimPlan(plan, wallet, opts),
    };
  } catch (error) {
    if (error instanceof DelegatedClaimSigningIncompleteError) {
      return {
        ok: false,
        partial: error.signatures,
        failedRequestId: error.failedRequestId,
        error,
      };
    }
    throw error;
  }
}

export async function assemble(
  plan: DelegatedClaimSigningPlan,
  signatures: DelegatedClaimSignatures,
): Promise<string> {
  return assembleWatchtowerArtifactsFromSignatures({ plan, signatures });
}

export async function verifyArtifacts(
  artifactsJson: string,
  chain: ClaimChainContext,
): Promise<WatchtowerArtifactsSummary> {
  return assertArtifactsUsableForVault({
    artifactsJson,
    expectedVaultId: chain.vault.vaultId,
    depositorEthAddress: chain.vault.depositorEthAddress,
    txGraphVersion: TX_GRAPH_VERSION,
  });
}

function readStringField(artifactsJson: string, field: string): string {
  const parsed: unknown = JSON.parse(artifactsJson);
  const value =
    parsed !== null && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)[field]
      : undefined;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Artifacts carry no "${field}".`);
  }
  return value;
}

export function claimTxHexOf(artifactsJson: string): string {
  return readStringField(artifactsJson, CLAIM_TX_FIELD);
}

/** Broadcasts through the app's mempool config; the mempool error text comes back verbatim. */
export async function broadcast(txHex: string): Promise<string> {
  return pushTx(txHex, getMempoolApiUrl());
}

export async function pinProof(
  artifactsJson: string,
  proofHex: string,
): Promise<string> {
  return pinPegoutProof(
    TX_GRAPH_VERSION,
    artifactsJson,
    proofHex.trim().replace(/^0x/, ""),
  );
}

export async function attachAssert(
  pinnedJson: string,
  wotsKeypairJson: string,
): Promise<{ artifactsJson: string; assertTxHex: string }> {
  const artifactsJson = await attachFinalizedAssert(
    TX_GRAPH_VERSION,
    pinnedJson,
    wotsKeypairJson,
  );
  return {
    artifactsJson,
    assertTxHex: readStringField(artifactsJson, ASSERT_TX_HEX_FIELD),
  };
}

export async function buildPayout(assertedJson: string): Promise<string> {
  return finalizePayout(TX_GRAPH_VERSION, assertedJson);
}

export async function buildWronglyChallenged(
  assertedJson: string,
  challengerPkHex: string,
  gcIndex: number,
  preimageHex: string,
): Promise<string> {
  return finalizeWronglyChallenged(
    TX_GRAPH_VERSION,
    assertedJson,
    challengerPkHex.trim().replace(/^0x/, ""),
    gcIndex,
    preimageHex.trim().replace(/^0x/, ""),
  );
}
