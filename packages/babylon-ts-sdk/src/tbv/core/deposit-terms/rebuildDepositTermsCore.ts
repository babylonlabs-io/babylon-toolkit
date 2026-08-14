/**
 * Pure core of the resume-broadcast DepositTerms rebuild (#2220 Part 2).
 *
 * Takes plain chain-derived data (the app orchestrator does the chain reads +
 * sibling discovery) and: (1) asserts sibling completeness against the funded
 * tx's auth-anchor OP_RETURN, (2) recomputes the amount-independent sizing
 * (depositorClaimValue, peginMaxFee, anchor) via WASM, (3) byte-matches each
 * HTLC output's value + scriptPubKey against the funded tx (Gate 1), then (4)
 * projects into DepositTerms. No chain access, no browser state — unit-testable.
 *
 * btc-vault is the protocol source of truth (`compute_min_htlc_value`,
 * `derive_challengers_for`). Design: `todo/ledger/2220-part2-resume-rebuild-design.md`.
 */

import {
  computeMinClaimValue,
  computeMinPeginFee,
  getPrePeginHtlcConnectorInfo,
  peginP2aAnchorOutput,
} from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Transaction } from "bitcoinjs-lib";

import { findAuthAnchorOpReturn } from "../managers/pegin/assertAuthAnchorOpReturn";
import { assertEncodedHtlcOutputsMatch } from "../primitives/psbt/assertWasmPeginSizing";
import { stripHexPrefix } from "../primitives/utils/bitcoin";
import { calculateBtcTxHash } from "../utils/transaction/btcTxHash";

import { buildDepositTerms } from "./buildDepositTerms";
import type { DepositTerms } from "./depositTerms";

/** One HTLC in the shared Pre-PegIn tx, ordered by (and contiguous in) htlcVout. */
export interface RebuildSibling {
  /** x-only or 0x-prefixed hex hashlock, per-vault (feeds the HTLC scriptPubKey). */
  hashlock: string;
  /** btc-vault `pegin_amount` for this sibling (satoshis). */
  amount: bigint;
}

export interface RebuildDepositTermsCoreInput {
  /** Stamped tx-graph version (NOT chain-active). */
  vaultCoreVersion: number;
  /** Sibling HTLCs ordered by htlcVout; index === htlcVout (asserted by the app). */
  siblings: readonly RebuildSibling[];
  /** Funded Pre-PegIn tx hex — already hash-verified vs on-chain prePeginTxHash by the app (Gate 0). */
  fundedPrePeginTxHex: string;

  // Stamped-version participant data (already resolved + sorted by the app).
  depositorBtcPubkey: string;
  vaultProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: readonly string[];
  universalChallengerBtcPubkeys: readonly string[];

  // Version-locked scalars.
  protocolFeeRate: bigint;
  minPeginFeeRate: bigint;
  councilQuorum: number;
  councilSize: number;
  timelockPegin: number;
  timelockAssert: number;
  timelockRefund: number;

  // Pass-through into DepositTerms.
  prepeginTxid: string;
  /** Funded-tx fee (Σin − Σout), computed by the app; the device's `prepegin_max_fee` bound. */
  prepeginMaxFee: bigint;
  maxAcceptableCommissionBps: number;

  /** WASM network descriptor for scriptPubKey derivation. */
  network: Parameters<typeof getPrePeginHtlcConnectorInfo>[0]["network"];
}

export async function rebuildDepositTermsCore(
  input: RebuildDepositTermsCoreInput,
): Promise<DepositTerms> {
  const siblingCount = input.siblings.length;
  if (siblingCount === 0) {
    throw new Error(
      "rebuildDepositTermsCore: at least one sibling is required",
    );
  }
  if (input.prepeginMaxFee <= 0n) {
    throw new Error(
      `rebuildDepositTermsCore: prepeginMaxFee must be > 0, got ${input.prepeginMaxFee}`,
    );
  }

  // Gate 0 (self-verified, not merely trusted from the caller): the funded tx
  // bytes must hash to the on-chain-pinned prepeginTxid. Everything below trusts
  // these bytes — without this a substituted tx that replicates the first N HTLC
  // outputs passes Gate 1 while carrying a different fee/txid the device would
  // then be asked to approve. Mirrors the refund flow's Gate 0.
  const expectedTxid = stripHexPrefix(input.prepeginTxid).toLowerCase();
  const actualTxid = stripHexPrefix(
    calculateBtcTxHash(input.fundedPrePeginTxHex),
  ).toLowerCase();
  if (actualTxid !== expectedTxid) {
    throw new Error(
      `Funded Pre-PegIn tx hashes to ${actualTxid}, expected ${expectedTxid} ` +
        `(on-chain prepeginTxid). Resume refused.`,
    );
  }

  // Completeness anchor: the funded tx's auth-anchor OP_RETURN sits at
  // vout === HTLC count. Production pegins always commit exactly one anchor, so
  // its absence (or an ambiguous set) MUST reject — this is the only guard
  // against an indexer-lagged partial sibling set (Gate 1 only inspects 0..N-1).
  const found = findAuthAnchorOpReturn(
    stripHexPrefix(input.fundedPrePeginTxHex),
  );
  if (found === undefined || found.vout !== siblingCount) {
    throw new Error(
      `Auth-anchor OP_RETURN ${
        found === undefined ? "absent or ambiguous" : `at vout ${found.vout}`
      } does not match sibling count ${siblingCount}; sibling set is incomplete. ` +
        `Resume refused.`,
    );
  }

  // Amount-independent sizing (btc-vault: DCV + minPeginFee depend on the signer
  // set + rates, not the pegin amount). Depositor-as-claimer:
  // numLocalChallengers === numVks (VP excluded) — graph.rs derive_challengers_for.
  const numVks = input.vaultKeeperBtcPubkeys.length;
  const numUcs = input.universalChallengerBtcPubkeys.length;
  const depositorClaimValue = await computeMinClaimValue(
    input.vaultCoreVersion,
    numVks,
    numUcs,
    input.councilQuorum,
    input.councilSize,
    input.protocolFeeRate,
  );
  const peginMaxFee = await computeMinPeginFee(
    input.vaultCoreVersion,
    numVks,
    numUcs,
    input.minPeginFeeRate,
  );
  const anchor = await peginP2aAnchorOutput(input.vaultCoreVersion);
  const anchorValue = anchor?.value ?? 0n;

  // Gate 1: per sibling, expected HTLC value = amount + DCV + peginMaxFee + anchor
  // (btc-vault compute_min_htlc_value), and expected scriptPubKey from the
  // sibling's on-chain hashlock. assertEncodedHtlcOutputsMatch byte-matches both
  // against the funded tx's outputs 0..N-1.
  const expectedHtlcValues = input.siblings.map(
    (s) => s.amount + depositorClaimValue + peginMaxFee + anchorValue,
  );
  const expectedHtlcScriptPubKeys = await Promise.all(
    input.siblings.map(async (s) => {
      const connector = await getPrePeginHtlcConnectorInfo({
        txGraphVersion: input.vaultCoreVersion,
        depositorPubkey: input.depositorBtcPubkey,
        vaultProviderPubkey: input.vaultProviderBtcPubkey,
        vaultKeeperPubkeys: [...input.vaultKeeperBtcPubkeys],
        universalChallengerPubkeys: [...input.universalChallengerBtcPubkeys],
        hashlock: stripHexPrefix(s.hashlock),
        timelockRefund: input.timelockRefund,
        network: input.network,
      });
      return connector.scriptPubKey;
    }),
  );
  const fundedOutputs = Transaction.fromHex(
    stripHexPrefix(input.fundedPrePeginTxHex),
  ).outs.map((o) => ({ value: o.value, script: o.script }));
  assertEncodedHtlcOutputsMatch(
    fundedOutputs,
    expectedHtlcValues,
    expectedHtlcScriptPubKeys,
  );

  return buildDepositTerms({
    vaultCoreVersion: input.vaultCoreVersion,
    protocolFeeRate: input.protocolFeeRate,
    timelockPegin: input.timelockPegin,
    timelockAssert: input.timelockAssert,
    timelockRefund: input.timelockRefund,
    prepeginTxid: input.prepeginTxid,
    prepeginMaxFee: input.prepeginMaxFee,
    vaultProviderBtcPubkey: input.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: input.vaultKeeperBtcPubkeys,
    universalChallengerBtcPubkeys: input.universalChallengerBtcPubkeys,
    maxAcceptableCommissionBps: input.maxAcceptableCommissionBps,
    peginAmounts: input.siblings.map((s) => s.amount),
    depositorClaimValue,
    peginMaxFee,
  });
}
