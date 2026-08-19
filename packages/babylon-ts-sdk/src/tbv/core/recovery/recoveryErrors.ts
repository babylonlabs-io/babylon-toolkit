/**
 * Typed failures for Pre-PegIn parameter recovery (#2203).
 *
 * Split by who can act on them. A root mismatch is user-fixable — wrong
 * wallet, wrong account or wrong network — and must be distinguishable from
 * a search that found nothing, which is ours. Without the split both look
 * identical to the caller.
 *
 * @module recovery/recoveryErrors
 */

/**
 * The re-derived vault root does not match the funded Pre-PegIn's auth-anchor
 * OP_RETURN commitment.
 *
 * The root is bound to the wallet seed, the derivation account AND the
 * network (`derive-context-hash.md` §2.1 folds the connected pubkey and the
 * canonical network name into the HKDF `info`), so all three must match the
 * ones that created the deposit.
 */
export class VaultRootMismatchError extends Error {
  constructor(
    readonly derivedAuthAnchorHash: string,
    readonly onChainAuthAnchorHash: string,
  ) {
    super(
      `Re-derived vault root does not match this Pre-PegIn: derived ` +
        `auth-anchor hash ${derivedAuthAnchorHash}, transaction commits to ` +
        `${onChainAuthAnchorHash}. Connect the same wallet, on the same ` +
        `account and the same network, that created the deposit.`,
    );
    this.name = "VaultRootMismatchError";
  }
}

/**
 * The Pre-PegIn carries no single, unambiguous auth-anchor OP_RETURN.
 *
 * The anchor sits at `vout === htlcCount`, and it is the only structural
 * signal for how many HTLC outputs the transaction funds. Without it the
 * vault count would have to be guessed, so recovery refuses rather than
 * deriving the wrong number of hashlocks.
 */
export class UnanchoredPrePeginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnanchoredPrePeginError";
  }
}

/**
 * No candidate parameter set reproduces the funded Pre-PegIn's HTLC outputs.
 *
 * Either the true parameters are outside the enumerated space — an operator
 * roster that rotated more than once has no chain-reachable historical read —
 * or the transaction is not one of ours.
 */
export class PeginParamsNotFoundError extends Error {
  constructor(
    readonly candidatesTried: number,
    /** A bounded sample of per-candidate rejection reasons, for diagnosis. */
    readonly sampleRejections: readonly string[],
  ) {
    super(
      `No candidate parameter set reproduces this Pre-PegIn's HTLC outputs ` +
        `(${candidatesTried} candidate(s) tried). Sample rejections: ` +
        `${sampleRejections.join(" | ")}`,
    );
    this.name = "PeginParamsNotFoundError";
  }
}

/**
 * More than one candidate reproduces the funded Pre-PegIn. Fail closed.
 *
 * Every survivor byte-matched the SAME funded outputs, so they agree on each
 * HTLC scriptPubKey and value and would produce the same refund transaction.
 * They disagree on which version stamps the destroyed vault row held, so the
 * reconstruction cannot claim a single answer.
 */
export class PeginParamsAmbiguousError extends Error {
  constructor(readonly survivorLabels: readonly string[]) {
    super(
      `${survivorLabels.length} candidate parameter sets reproduce this ` +
        `Pre-PegIn's HTLC outputs, so the vault's stamped versions cannot be ` +
        `determined: ${survivorLabels.join(" | ")}. Reconstruction refused.`,
    );
    this.name = "PeginParamsAmbiguousError";
  }
}
