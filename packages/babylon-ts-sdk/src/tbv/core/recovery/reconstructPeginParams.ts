/**
 * Recover a stranded deposit's destroyed protocol parameters by trialling an
 * enumerated candidate space against the funded Pre-PegIn transaction (#2203).
 *
 * This is a candidate enumerator plus a loop over an EXISTING verifier.
 * `rebuildDepositTermsCore` already answers "do these parameters and this
 * funded transaction agree?" — it rebuilds every HTLC scriptPubKey through the
 * WASM oracle and byte-matches script and value against the transaction, from
 * plain inputs with no chain access. Recovery reuses it verbatim so there is
 * exactly one implementation of that judgement in the codebase.
 *
 * No wallet, no `vaultId`, no browser: every input is either supplied by the
 * caller or read off the transaction. Hashlocks come from
 * `deriveHashlocksFromPrePegin`.
 *
 * @module recovery/reconstructPeginParams
 */

import type { Network } from "@babylonlabs-io/babylon-tbv-rust-wasm";
import { Transaction } from "bitcoinjs-lib";

import type { DepositTerms } from "../deposit-terms/depositTerms";
import { rebuildDepositTermsCore } from "../deposit-terms/rebuildDepositTermsCore";
import { findAuthAnchorOpReturn } from "../managers/pegin/assertAuthAnchorOpReturn";
import { HtlcOutputMismatchError } from "../primitives/psbt/assertWasmPeginSizing";
import {
  processPublicKeyToXOnly,
  stripHexPrefix,
} from "../primitives/utils/bitcoin";
import { calculateBtcTxHash } from "../utils/transaction/btcTxHash";
import {
  computeMinClaimValue,
  computeMinPeginFee,
  peginP2aAnchorOutput,
} from "../wasm";

import {
  describePeginParamsCandidate,
  describeUnresolvedVersion,
  type PeginParamsCandidate,
  type UnresolvedVersion,
} from "./peginParamsCandidates";
import {
  PeginParamsAmbiguousError,
  PeginParamsIncompleteSpaceError,
  PeginParamsNotFoundError,
  PeginSizingIntegrityError,
  UnanchoredPrePeginError,
} from "./recoveryErrors";

/**
 * How many per-candidate reasons an error message carries, for rejections and
 * for unevaluated candidates alike. The full list is one line per candidate and
 * runs to hundreds; a handful is enough to tell "wrong transaction" from
 * "roster not enumerated". Only the message is capped — the counts that drive
 * the fail-closed decisions stay exact.
 */
const MAX_REPORTED_REJECTIONS = 5;

export interface ReconstructPeginParamsInput {
  /** Hashlocks indexed by `htlcVout`, from `deriveHashlocksFromPrePegin`. */
  hashlocks: readonly string[];
  /** Funded (broadcast) Pre-PegIn transaction hex, `0x` optional. */
  fundedPrePeginTxHex: string;
  /** Depositor x-only BTC pubkey hex, from the connected wallet. */
  depositorBtcPubkey: string;
  /**
   * Funded-transaction fee, `Σin − Σout`. Not derivable from the transaction
   * alone — the input values live in the funding UTXOs — but those are
   * Bitcoin-keyed reads, which a reorg on Ethereum leaves intact.
   */
  prepeginMaxFee: bigint;
  /**
   * Commission ceiling projected into the returned {@link DepositTerms}. Not a
   * search axis: it never reaches the HTLC scriptPubKey or value, so the
   * transaction carries no evidence of it and the caller must supply the bound
   * it is willing to accept.
   */
  maxAcceptableCommissionBps: number;
  network: Network;
  /** The space to search, from `buildPeginParamsCandidates`. */
  candidates: readonly PeginParamsCandidate[];
  /**
   * Versions the caller enumerated over but could not resolve. Required, and
   * `[]` is the explicit claim that the enumeration was complete — so a caller
   * cannot arrive at a trusted answer by forgetting to mention its gaps.
   *
   * A non-empty list turns a sole match into a
   * {@link PeginParamsIncompleteSpaceError}: uniqueness only rules out a wrong
   * answer when the right answer was in the space to begin with.
   */
  unresolvedVersions: readonly UnresolvedVersion[];
}

export interface ReconstructPeginParamsResult {
  /** The single candidate whose rebuild matched the funded transaction. */
  candidate: PeginParamsCandidate;
  /**
   * Terms projected from the matched candidate.
   *
   * The transaction pins the participant keys, `timelockRefund`, and each
   * HTLC's scriptPubKey and total value. It does NOT pin how that value splits
   * into `peginAmount`, `depositorClaimValue` and `peginMaxFee` — that split
   * follows from the matched candidate's fee-side parameters, which the
   * transaction carries no evidence of.
   */
  terms: DepositTerms;
  /**
   * Per-vault `peginAmount`, inverted from the observed HTLC output values.
   * Only as sound as the matched candidate's reserve — see {@link terms}.
   */
  peginAmounts: readonly bigint[];
  /** The transaction's `SHA256(authAnchor)` commitment, for the refund rebuild. */
  authAnchorHash: string;
  /** Size of the space actually trialled, for the recovery record. */
  candidatesTried: number;
  /**
   * Every candidate that matched and projected identical terms.
   *
   * More than one is normal rather than suspicious: candidates differing only
   * in fields the transaction cannot express — version labels whose
   * script- and value-relevant content is the same — are indistinguishable by
   * construction and describe the same deposit. They are reported rather than
   * refused; refusal is reserved for survivors whose terms actually differ.
   */
  matchedCandidates: readonly PeginParamsCandidate[];
}

/**
 * Canonical form of a match's observable content, for equality only.
 *
 * Two survivors agreeing here produce the same refund and the same reported
 * amounts, so the difference between them is a label with no consequence.
 */
function matchFingerprint(
  terms: DepositTerms,
  peginAmounts: readonly bigint[],
): string {
  return JSON.stringify({ terms, peginAmounts }, (_key, value) =>
    typeof value === "bigint" ? `${value}` : value,
  );
}

/** Amount-independent per-HTLC reserve, recomputed exactly as the verifier does. */
interface PeginSizing {
  depositorClaimValue: bigint;
  peginMaxFee: bigint;
  p2aAnchorValue: bigint;
}

/** Identity of the inputs that determine a candidate's reserve, for memoising it. */
function sizingCacheKey(candidate: PeginParamsCandidate): string {
  const { offchainParams: params, participants } = candidate;
  return [
    candidate.vaultCoreVersion,
    participants.vaultKeeperBtcPubkeys.length,
    participants.universalChallengerBtcPubkeys.length,
    params.councilQuorum,
    params.councilSize,
    params.protocolFeeRate,
    params.minPeginFeeRate,
  ].join("|");
}

/**
 * Compute the amount-independent reserve for one candidate, asserting the WASM
 * outputs before they are consumed (CLAUDE.md critical path 1).
 *
 * Only binary-integrity invariants are asserted here — a claim value or fee of
 * zero, or a negative anchor, is impossible for ANY valid parameter set, so it
 * indicts the binary rather than the candidate and must escape the search loop
 * instead of being counted as a rejection. The plausibility band on the implied
 * reserve is deliberately NOT duplicated: it depends on the candidate's own
 * `minPeginFeeRate`, so a candidate can legitimately fail it, and the verifier
 * applies it where it belongs — as a candidate filter.
 *
 * An absent anchor reads as `0n` because the facade returns `null` for graph
 * versions whose PegIn carries no anchor and never a zero-valued placeholder,
 * which is the same reading `rebuildDepositTermsCore` takes.
 */
async function computePeginSizing(
  candidate: PeginParamsCandidate,
): Promise<PeginSizing> {
  const { offchainParams: params, participants } = candidate;
  // Depositor-as-claimer: the local-challenger count is the keeper count
  // (the vault provider is excluded) — btc-vault graph.rs derive_challengers_for.
  const numVks = participants.vaultKeeperBtcPubkeys.length;
  const numUcs = participants.universalChallengerBtcPubkeys.length;
  const [depositorClaimValue, peginMaxFee, anchorOutput] = await Promise.all([
    computeMinClaimValue(
      candidate.vaultCoreVersion,
      numVks,
      numUcs,
      params.councilQuorum,
      params.councilSize,
      params.protocolFeeRate,
    ),
    computeMinPeginFee(
      candidate.vaultCoreVersion,
      numVks,
      numUcs,
      params.minPeginFeeRate,
    ),
    peginP2aAnchorOutput(candidate.vaultCoreVersion),
  ]);
  const p2aAnchorValue = anchorOutput?.value ?? 0n;

  if (depositorClaimValue <= 0n) {
    throw new PeginSizingIntegrityError(
      `WASM returned non-positive depositorClaimValue ${depositorClaimValue} for graph version ${candidate.vaultCoreVersion}`,
    );
  }
  if (peginMaxFee <= 0n) {
    throw new PeginSizingIntegrityError(
      `WASM returned non-positive peginMaxFee ${peginMaxFee} for graph version ${candidate.vaultCoreVersion}`,
    );
  }
  if (p2aAnchorValue < 0n) {
    throw new PeginSizingIntegrityError(
      `WASM returned negative P2A anchor value ${p2aAnchorValue} for graph version ${candidate.vaultCoreVersion}`,
    );
  }

  return { depositorClaimValue, peginMaxFee, p2aAnchorValue };
}

/**
 * Search the candidate space for the parameter set that reproduces the funded
 * Pre-PegIn, and project it back into {@link DepositTerms}.
 *
 * Per candidate: invert each vault's `peginAmount` from the observed HTLC
 * output value via the protocol identity `htlcValue = peginAmount +
 * depositorClaimValue + peginMaxFee + p2aAnchorValue`, then hand the result to
 * `rebuildDepositTermsCore`, which independently recomputes that same sizing
 * and byte-matches both the value and the scriptPubKey of every HTLC output.
 *
 * Because the amount is inverted from the value it is compared against, the
 * VALUE check cannot discriminate between candidates: it holds for any
 * candidate whose reserve leaves a positive amount. The scriptPubKey does all
 * the discriminating, and `getPrePeginHtlcConnectorInfo` accepts exactly one
 * offchain-params scalar — `timelockRefund`. So two offchain versions sharing
 * a `timelockRefund` are indistinguishable however much their fee rates or
 * council parameters differ, and that is precisely the ambiguity this function
 * refuses to guess through. The value check is still run, by the verifier, as
 * the bound that stops a candidate whose reserve exceeds the funded output.
 *
 * Every candidate is trialled; the loop does not stop at the first match,
 * because detecting ambiguity is the point. Matches are then COMPARED rather
 * than counted — several candidates matching is the ordinary case whenever
 * their differences cannot reach the transaction, and refusing on a count
 * alone would reject a deposit whose refund is fully determined.
 *
 * A candidate is only rejected on a Gate-1 byte mismatch, which is the
 * transaction positively disagreeing with it. Any other failure means the
 * candidate was never really evaluated, so it is recorded as unresolved and
 * feeds the same fail-closed path as a version that could not be read —
 * otherwise an incidental error on the TRUE candidate would remove it silently
 * and hand back a look-alike as a trusted unique answer.
 *
 * @throws {UnanchoredPrePeginError} If the transaction carries no single,
 *   unambiguous auth-anchor OP_RETURN.
 * @throws {PeginParamsNotFoundError} If no candidate matched.
 * @throws {PeginParamsAmbiguousError} If matches disagree on the projected terms.
 * @throws {PeginParamsIncompleteSpaceError} If a match is found but the space
 *   was known to be incomplete, or a candidate failed to evaluate.
 */
export async function reconstructPeginParams(
  input: ReconstructPeginParamsInput,
): Promise<ReconstructPeginParamsResult> {
  const {
    hashlocks,
    fundedPrePeginTxHex,
    depositorBtcPubkey,
    prepeginMaxFee,
    maxAcceptableCommissionBps,
    network,
    candidates,
    unresolvedVersions,
  } = input;

  if (hashlocks.length === 0) {
    throw new Error(
      "reconstructPeginParams: at least one hashlock is required",
    );
  }
  if (candidates.length === 0) {
    throw new Error("reconstructPeginParams: candidate space is empty");
  }

  // The verifier compares this against WASM-built scripts and does not
  // normalise, while the derivation half accepts a `0x` prefix. Passing one
  // wallet string to both must not make step 1 pass and step 2 fail every
  // candidate, which would present as "no parameters found".
  const normalizedDepositorBtcPubkey =
    processPublicKeyToXOnly(depositorBtcPubkey);

  const cleanTxHex = stripHexPrefix(fundedPrePeginTxHex);
  const anchor = findAuthAnchorOpReturn(cleanTxHex);
  if (anchor === undefined) {
    throw new UnanchoredPrePeginError(
      `Pre-PegIn carries no single, unambiguous auth-anchor OP_RETURN; the ` +
        `sibling set cannot be proven complete. Reconstruction refused.`,
    );
  }
  // The verifier re-checks this, but catching it here attributes the failure
  // to the hashlock set rather than to every candidate in turn.
  if (anchor.vout !== hashlocks.length) {
    throw new Error(
      `reconstructPeginParams: ${hashlocks.length} hashlock(s) supplied but ` +
        `the auth-anchor OP_RETURN sits at vout ${anchor.vout}, so the ` +
        `transaction funds ${anchor.vout} HTLC output(s). Reconstruction refused.`,
    );
  }

  const outputs = Transaction.fromHex(cleanTxHex).outs;
  const observedHtlcValues = hashlocks.map((_, i) => BigInt(outputs[i].value));
  const prepeginTxid = stripHexPrefix(
    calculateBtcTxHash(cleanTxHex),
  ).toLowerCase();

  const sizingCache = new Map<string, PeginSizing>();
  const survivors: {
    candidate: PeginParamsCandidate;
    terms: DepositTerms;
    peginAmounts: bigint[];
    fingerprint: string;
  }[] = [];
  const rejections: string[] = [];
  // Count drives the fail-closed decision and must stay exact; only the labels
  // that reach the error message are capped, since in the fallback search every
  // candidate can land here and each entry embeds a full error message.
  const unevaluatedLabels: string[] = [];
  let unevaluatedCount = 0;

  for (const candidate of candidates) {
    try {
      const cacheKey = sizingCacheKey(candidate);
      let sizing = sizingCache.get(cacheKey);
      if (sizing === undefined) {
        sizing = await computePeginSizing(candidate);
        sizingCache.set(cacheKey, sizing);
      }
      const reserve =
        sizing.depositorClaimValue + sizing.peginMaxFee + sizing.p2aAnchorValue;
      const peginAmounts = observedHtlcValues.map((value) => value - reserve);
      // A reserve larger than the funded output is the transaction positively
      // disagreeing with this candidate — the value bound doing the one piece
      // of discriminating it can. The verifier would reject it too, but with a
      // generic error that would be misread as "never evaluated" and would
      // pollute the space with phantom gaps.
      const shortIndex = peginAmounts.findIndex((amount) => amount <= 0n);
      if (shortIndex !== -1) {
        throw new HtlcOutputMismatchError(
          `HTLC output[${shortIndex}] value ${observedHtlcValues[shortIndex]} ` +
            `is not above this candidate's reserve ${reserve}, so it implies a ` +
            `non-positive pegin amount ${peginAmounts[shortIndex]}.`,
        );
      }

      const { offchainParams: params, participants } = candidate;
      const terms = await rebuildDepositTermsCore({
        vaultCoreVersion: candidate.vaultCoreVersion,
        siblings: hashlocks.map((hashlock, i) => ({
          hashlock,
          amount: peginAmounts[i],
        })),
        fundedPrePeginTxHex: cleanTxHex,
        depositorBtcPubkey: normalizedDepositorBtcPubkey,
        vaultProviderBtcPubkey: participants.vaultProviderBtcPubkey,
        vaultKeeperBtcPubkeys: participants.vaultKeeperBtcPubkeys,
        universalChallengerBtcPubkeys:
          participants.universalChallengerBtcPubkeys,
        protocolFeeRate: params.protocolFeeRate,
        minPeginFeeRate: params.minPeginFeeRate,
        councilQuorum: params.councilQuorum,
        councilSize: params.councilSize,
        timelockPegin: params.timelockPegin,
        timelockAssert: params.timelockAssert,
        timelockRefund: params.timelockRefund,
        prepeginTxid,
        prepeginMaxFee,
        maxAcceptableCommissionBps,
        network,
      });

      survivors.push({
        candidate,
        terms,
        peginAmounts,
        fingerprint: matchFingerprint(terms, peginAmounts),
      });
    } catch (err) {
      // A malformed WASM sizing output is not a property of the candidate, so
      // counting it as a rejection would bury a broken binary under "no
      // candidate matched". Let it out.
      if (err instanceof PeginSizingIntegrityError) {
        throw err;
      }
      const label = describePeginParamsCandidate(candidate);
      const reason = err instanceof Error ? err.message : String(err);
      if (err instanceof HtlcOutputMismatchError) {
        // The transaction positively disagrees with this candidate — the
        // expected outcome for all but one, so it cannot propagate. Recorded,
        // and a sample reaches the not-found error to keep it diagnosable.
        if (rejections.length < MAX_REPORTED_REJECTIONS) {
          rejections.push(`[${label}] ${reason}`);
        }
      } else {
        // Anything else says nothing about the transaction: this candidate was
        // never actually evaluated. Treating it as a rejection would let an
        // incidental failure on the true candidate hand back a look-alike.
        unevaluatedCount++;
        if (unevaluatedLabels.length < MAX_REPORTED_REJECTIONS) {
          unevaluatedLabels.push(`${label} (${reason})`);
        }
      }
    }
  }

  // A candidate that could not be evaluated is a hole in the space in exactly
  // the same way an unreadable version is, so the two are reported together.
  const gapCount = unresolvedVersions.length + unevaluatedCount;
  const gaps = [
    ...unresolvedVersions.map(describeUnresolvedVersion),
    ...unevaluatedLabels,
  ];

  if (survivors.length === 0) {
    throw new PeginParamsNotFoundError(candidates.length, rejections, gaps);
  }

  // Compare, do not count. Survivors all byte-matched the same funded outputs,
  // so they already agree on every HTLC scriptPubKey and total value; if they
  // also project identical terms there is nothing to choose between them and
  // nothing is at stake in choosing.
  const distinct = new Set(survivors.map((s) => s.fingerprint));
  if (distinct.size > 1) {
    throw new PeginParamsAmbiguousError(
      survivors.map((s) => describePeginParamsCandidate(s.candidate)),
    );
  }

  // Reported after ambiguity: disagreeing survivors are the more specific
  // diagnosis, and that error already names them.
  if (gapCount > 0) {
    throw new PeginParamsIncompleteSpaceError(
      describePeginParamsCandidate(survivors[0].candidate),
      gaps,
    );
  }

  return {
    candidate: survivors[0].candidate,
    terms: survivors[0].terms,
    peginAmounts: survivors[0].peginAmounts,
    authAnchorHash: anchor.hash,
    candidatesTried: candidates.length,
    matchedCandidates: survivors.map((s) => s.candidate),
  };
}
