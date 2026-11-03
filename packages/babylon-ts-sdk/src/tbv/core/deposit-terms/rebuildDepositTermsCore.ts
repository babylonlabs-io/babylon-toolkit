/**
 * Pure core of the resume-broadcast DepositTerms rebuild (#2220 Part 2).
 *
 * Takes plain chain-derived data (the app orchestrator does the chain reads +
 * sibling discovery) and: (1) asserts sibling completeness against the funded
 * tx's auth-anchor OP_RETURN, (2) recomputes the amount-independent sizing
 * (depositorClaimValue via WASM; peginMaxFee and the P2A anchor from the
 * TypeScript fee model and constants), (3) byte-matches each
 * HTLC output's value + scriptPubKey against the funded tx (Gate 1), then (4)
 * projects into DepositTerms. No chain access, no browser state — unit-testable.
 *
 * btc-vault is the protocol source of truth (`compute_min_htlc_value`,
 * `derive_challengers_for`).
 */

import { computeMinClaimValue, getPrePeginHtlcConnectorInfo } from "../wasm";
import { Transaction } from "bitcoinjs-lib";

import { findAuthAnchorOpReturn } from "../managers/pegin/assertAuthAnchorOpReturn";
import {
  assertEncodedHtlcOutputsMatch,
  HtlcOutputMismatchError,
} from "../primitives/psbt/assertWasmPeginSizing";
import { PEGIN_P2A_ANCHOR_VALUE_SATS } from "../primitives/psbt/constants";
import { stripHexPrefix } from "../primitives/utils/bitcoin";
import { UnanchoredPrePeginError } from "../recovery/recoveryErrors";
import { computeMinPeginFeeSats } from "../utils/fee/peginFeeMath";
import { calculateBtcTxHash } from "../utils/transaction/btcTxHash";

import { buildDepositTerms } from "./buildDepositTerms";
import type { DepositTerms } from "./depositTerms";

/** One HTLC in the shared Pre-PegIn tx, ordered by (and contiguous in) htlcVout. */
export interface RebuildSibling {
  /** 32-byte hex hashlock (0x prefix optional), per-vault (feeds the HTLC scriptPubKey). */
  hashlock: string;
  /** btc-vault `pegin_amount` for this sibling (satoshis). */
  amount: bigint;
}

/** What {@link assertFundedHtlcOutputsMatch} checks a funded tx against. */
export interface FundedHtlcOutputsInput {
  /** Stamped tx-graph version (NOT chain-active). */
  vaultCoreVersion: number;
  /** Sibling HTLCs ordered by htlcVout; index === htlcVout (asserted by the app). */
  siblings: readonly RebuildSibling[];
  /** Funded Pre-PegIn tx hex. Gate 0 (hash vs prepeginTxid) is SELF-verified below — callers need not pre-verify. */
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
  timelockRefund: number;

  /** On-chain Pre-PegIn txid the funded tx must hash to. */
  prepeginTxid: string;

  /** WASM network descriptor for scriptPubKey derivation. */
  network: Parameters<typeof getPrePeginHtlcConnectorInfo>[0]["network"];
}

export interface RebuildDepositTermsCoreInput extends FundedHtlcOutputsInput {
  // Pass-through into DepositTerms; no HTLC output encodes these.
  timelockPegin: number;
  timelockAssert: number;
  /** Funded-tx fee (Σin − Σout), computed by the app; the device's `prepegin_max_fee` bound. */
  prepeginMaxFee: bigint;
  maxAcceptableCommissionBps: number;
}

/**
 * Whether an error means the funded transaction's HTLC outputs differ from what
 * the registered keys and parameters produce.
 *
 * `instanceof` alone fails across module boundaries (duplicate SDK copies, test
 * mocks), so this falls back to the name field, as the key drift guard does.
 */
export function isHtlcOutputMismatchError(err: unknown): boolean {
  return (
    err instanceof HtlcOutputMismatchError ||
    (err instanceof Error && err.name === "HtlcOutputMismatchError")
  );
}

/**
 * Prove a funded Pre-PegIn's HTLC outputs are the ones the registered keys and
 * parameters produce: the hash, sibling completeness, then each output's value
 * and scriptPubKey. Needs no fee or commission value, and no wallet capability.
 *
 * @throws {UnanchoredPrePeginError} If no single auth-anchor OP_RETURN exists.
 * @throws {HtlcOutputMismatchError} If any HTLC output differs.
 */
export async function assertFundedHtlcOutputsMatch(
  input: FundedHtlcOutputsInput,
): Promise<{ depositorClaimValue: bigint; peginMaxFee: bigint }> {
  const siblingCount = input.siblings.length;
  if (siblingCount === 0) {
    throw new Error(
      "rebuildDepositTermsCore: at least one sibling is required",
    );
  }
  for (const [i, sibling] of input.siblings.entries()) {
    if (sibling.amount <= 0n) {
      throw new Error(
        `rebuildDepositTermsCore: sibling[${i}] has non-positive on-chain pegin ` +
          `amount ${sibling.amount}; the chain-read vault record is invalid. Resume refused.`,
      );
    }
  }

  // Gate 0, self-verified: everything below trusts these bytes, and a
  // substituted tx replicating the HTLC outputs would pass Gate 1 with a
  // different fee/txid.
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

  // Completeness anchor: the single auth-anchor OP_RETURN sits at vout === HTLC
  // count — the only guard against a partial sibling set.
  const found = findAuthAnchorOpReturn(
    stripHexPrefix(input.fundedPrePeginTxHex),
  );
  if (found === undefined) {
    throw new UnanchoredPrePeginError(
      `Funded Pre-PegIn carries no single, unambiguous auth-anchor OP_RETURN ` +
        `commitment — it either predates auth anchoring or is malformed. The ` +
        `anchor is required to prove sibling completeness. Resume refused.`,
    );
  }
  if (found.vout !== siblingCount) {
    throw new Error(
      `Auth-anchor OP_RETURN at vout ${found.vout} does not match the ` +
        `discovered sibling count ${siblingCount}; the discovered sibling set ` +
        `does not cover this transaction's HTLC outputs (a sibling may not be ` +
        `registered yet, or not by this depositor). Resume refused.`,
    );
  }

  // Amount-independent sizing. Depositor-as-claimer: numLocalChallengers ===
  // numVks (VP excluded) — btc-vault graph.rs derive_challengers_for.
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
  const peginMaxFee = computeMinPeginFeeSats(
    numVks,
    numUcs,
    input.minPeginFeeRate,
  );
  const anchorValue = PEGIN_P2A_ANCHOR_VALUE_SATS;

  if (depositorClaimValue <= 0n) {
    throw new Error(
      `WASM returned non-positive depositorClaimValue ${depositorClaimValue}; ` +
        `expected > 0. Resume refused.`,
    );
  }

  // Gate 1: per sibling, value = amount + DCV + peginMaxFee + anchor (btc-vault
  // compute_min_htlc_value) + scriptPubKey from the on-chain hashlock,
  // byte-matched against outputs 0..N-1.
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

  return { depositorClaimValue, peginMaxFee };
}

export async function rebuildDepositTermsCore(
  input: RebuildDepositTermsCoreInput,
): Promise<DepositTerms> {
  if (input.prepeginMaxFee <= 0n) {
    throw new Error(
      `rebuildDepositTermsCore: prepeginMaxFee must be > 0, got ${input.prepeginMaxFee}`,
    );
  }

  const { depositorClaimValue, peginMaxFee } =
    await assertFundedHtlcOutputsMatch(input);

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
