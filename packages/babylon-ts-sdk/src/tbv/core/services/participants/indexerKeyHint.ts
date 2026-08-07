/**
 * RFC-006 indexer-hint acceptance policy — the single definition.
 *
 * Every path that builds against a vault takes participant keys from chain and
 * treats the indexer's copy as an untrusted *hint*. The hint never supplies key
 * material; its job is to catch a wrong vault provider address, a wrong
 * application entry point, or a stale roster version.
 *
 * Under RFC-006 an operator's BTC key is an append-only history of operation
 * keys, so there are two values the indexer may legitimately be serving at any
 * moment: the **registration** key (it has not caught up to a rotation) or the
 * **current operation** key (it has). Accepting only the first hard-fails every
 * depositor of a rotated provider the day the indexer catches up — an
 * indexer-side deploy, with nothing to deploy on our side and no user
 * workaround. Hence: accept either.
 *
 * For an operator that never rotated the two candidates are identical, so this
 * is exactly the old strict check until someone rotates.
 *
 * This module exists because the policy had already been written three times —
 * deposit, payout, and (missing) refund — and drifted each time. Callers differ
 * in shape and cannot share one entry point:
 *
 * - the deposit path compares three roles as whole sets and resolves operation
 *   keys **eagerly**, because it builds the Bitcoin lock with them;
 * - payout and refund compare one scalar key and must read the operation key
 *   **lazily**, because on the happy path it is a second RPC for nothing.
 *
 * So what is shared is the predicate — {@link isHintAccepted} and the two
 * matchers — plus {@link assertVaultProviderHintAccepted} for the two scalar
 * callers. Anything that needs a different acceptance rule does not belong
 * here; see `vpAuthPinnedPubkey`, which is deliberately operation-key-only
 * because accepting either would hollow out the pin.
 *
 * @module services/participants/indexerKeyHint
 */

import type { Address } from "viem";

import { canonicalizeBtcPubkey } from "../../primitives/utils/bitcoin";

/**
 * Which of the two legitimate on-chain candidates a role's hint matched.
 *
 * Both true means the role never rotated, so the hint constrains nothing.
 * Both false means the hint is not explainable by any state the chain is in.
 */
export interface HintMatch {
  registration: boolean;
  operation: boolean;
}

/**
 * The accept-either policy itself.
 *
 * Kept as a named function rather than inlined at each call site so that
 * changing the policy is a one-line change in one file, and so a reader can
 * find every path governed by it.
 */
export function isHintAccepted(match: HintMatch): boolean {
  return match.registration || match.operation;
}

/** Match a single hinted key against both candidates. */
export function matchKeyHint(
  hint: string,
  registrationKey: string,
  operationKey: string,
): HintMatch {
  const canonicalHint = canonicalizeBtcPubkey(hint);
  return {
    registration: canonicalHint === canonicalizeBtcPubkey(registrationKey),
    operation: canonicalHint === canonicalizeBtcPubkey(operationKey),
  };
}

/**
 * Match a hinted key *set* against both candidate sets.
 *
 * Compared as whole sets, never as per-element membership of the union: a
 * roster holding one registration key and one operation key is an indexer that
 * is halfway through applying a rotation, and union membership would wave that
 * through. Order is normalized, so this is set equality and not list equality.
 */
export function matchKeySetHint(
  hints: readonly string[],
  registrationKeys: readonly string[],
  operationKeys: readonly string[],
): HintMatch {
  const canonicalHints = sortedCanonical(hints);
  return {
    registration: setsEqual(canonicalHints, sortedCanonical(registrationKeys)),
    operation: setsEqual(canonicalHints, sortedCanonical(operationKeys)),
  };
}

function sortedCanonical(keys: readonly string[]): string[] {
  return keys.map(canonicalizeBtcPubkey).sort();
}

function setsEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

export interface AssertVaultProviderHintAcceptedParams {
  /** Vault provider's admin address, named in the error. */
  vaultProviderEthAddress: Address;
  /** The untrusted hint. Absent means there is nothing to cross-check. */
  hintBtcPubkey?: string;
  /** The vault provider's registration key, already read from chain. */
  registrationBtcPubkey: string;
  /**
   * Reads the vault provider's *current* operation key.
   *
   * Invoked only when the hint fails against the registration key, so a
   * provider that never rotated — and an indexer that has not caught up — cost
   * no extra RPC. Callers must not pre-read this.
   */
  readCurrentOperationBtcPubkey: () => Promise<string>;
  /**
   * Sentence appended to the error naming what was aborted, e.g.
   * `"Aborting refund."`. The shared half of the message says which keys
   * failed to match; this says which operation the user just lost.
   */
  context?: string;
}

/**
 * Assert an indexer-hinted vault provider key is one the chain can explain.
 *
 * Resolves silently when there is no hint, or when the hint matches either
 * candidate. Throws otherwise — the caller's key material is unaffected either
 * way, since resolution is chain-only.
 */
export async function assertVaultProviderHintAccepted(
  params: AssertVaultProviderHintAcceptedParams,
): Promise<void> {
  const {
    vaultProviderEthAddress,
    hintBtcPubkey,
    registrationBtcPubkey,
    readCurrentOperationBtcPubkey,
    context,
  } = params;

  if (!hintBtcPubkey) return;

  const canonicalHint = canonicalizeBtcPubkey(hintBtcPubkey);
  if (canonicalHint === canonicalizeBtcPubkey(registrationBtcPubkey)) return;

  const canonicalOperation = canonicalizeBtcPubkey(
    await readCurrentOperationBtcPubkey(),
  );
  if (canonicalHint === canonicalOperation) return;

  throw new Error(
    `Vault provider BTC pubkey mismatch for ${vaultProviderEthAddress}: ` +
      `indexer hint matches neither the registration key nor the current ` +
      `operation key on-chain.${context ? ` ${context}` : ""}`,
  );
}
