/**
 * Binding between the challenger set a delegated claim signs for and the set
 * the vault actually has on chain.
 *
 * The WronglyChallenged PSBTs arrive keyed by challenger public key, and the
 * vault provider chooses those keys. Nothing downstream notices a short map:
 * the artifacts file verifies against its own graph, so a missing challenger
 * produces a file that looks complete and fails only months later, when that
 * challenger's ChallengeAssert has to be answered inside
 * `timelock_challenge_assert` and the material is not there.
 *
 * The failure is asymmetric, which is why both directions are checked.
 * Missing entries leave the depositor unable to defend the claim; extra
 * entries hand out signatures for keys the protocol does not recognize.
 *
 * This mirrors `assertChallengerSetMatchesExpected` in
 * `services/deposit/signDepositorGraph.ts`, which does the same job at
 * deposit time against the same on-chain sets.
 *
 * @module services/delegated-claim/challengerBinding
 */

import { deriveLocalChallengers } from "../../primitives/challengers";
import { stripHexPrefix } from "../../primitives/utils/bitcoin";

/**
 * Thrown when the graph's challengers are not the vault's challengers.
 *
 * @experimental
 */
export class ChallengerSetMismatchError extends Error {
  constructor(
    /** Challengers the vault has that the graph left out. */
    readonly missing: string[],
    /** Challengers the graph lists that the vault does not have. */
    readonly unexpected: string[],
  ) {
    super(
      `Transaction graph's challenger set does not match the vault's ` +
        `(local ∪ universal)` +
        (missing.length > 0 ? ` (missing: ${missing.join(", ")})` : "") +
        (unexpected.length > 0
          ? ` (unexpected: ${unexpected.join(", ")})`
          : "") +
        `. Refusing to sign an incomplete or padded challenger set.`,
    );
    this.name = "ChallengerSetMismatchError";
  }
}

/**
 * The graph's challenger keys, and the on-chain sets they must equal.
 *
 * @experimental
 */
export interface AssertChallengerSetMatchesVaultParams {
  /** Challenger keys the graph produced WronglyChallenged PSBTs for. */
  graphChallengerPubkeys: string[];
  /** Depositor's BTC public key, registered on chain for this vault. */
  depositorBtcPubkey: string;
  /**
   * Vault provider's BTC public key, registered on chain for this vault.
   * The depositor-as-claimer branch does not use it, but the shared
   * derivation takes it, and passing a stand-in would be a lie that the
   * next change to that function could turn into a wrong set.
   */
  vaultProviderBtcPubkey: string;
  /** Vault keepers registered on chain for this vault. */
  vaultKeeperBtcPubkeys: string[];
  /** Universal challengers registered on chain. */
  universalChallengerBtcPubkeys: string[];
}

/**
 * Throws unless the graph's challenger set equals `local ∪ universal`.
 *
 * The depositor is the claimer here, so the local set is the vault keepers,
 * derived by the same function the deposit path uses rather than restated.
 *
 * @throws {@link ChallengerSetMismatchError} on any missing or extra key, or
 *         a plain error when the on-chain sets themselves are unusable.
 *
 * @experimental
 */
export function assertChallengerSetMatchesVault(
  params: AssertChallengerSetMatchesVaultParams,
): void {
  const local = deriveLocalChallengers({
    claimerBtcPubkey: params.depositorBtcPubkey,
    depositorBtcPubkey: params.depositorBtcPubkey,
    vaultProviderBtcPubkey: params.vaultProviderBtcPubkey,
    vaultKeeperBtcPubkeys: params.vaultKeeperBtcPubkeys,
  });
  const universal = params.universalChallengerBtcPubkeys.map(normalizeKey);

  // Protocol guarantee: the two sets are disjoint. An overlap makes a
  // challenger's role ambiguous, so it is an error rather than a union.
  const overlap = local.filter((key) => universal.includes(key));
  if (overlap.length > 0) {
    throw new Error(
      `Cannot check the challenger set: vault keepers and universal ` +
        `challengers overlap (${overlap.join(", ")}).`,
    );
  }

  const supplied = params.graphChallengerPubkeys.map(normalizeKey);
  const suppliedSet = new Set(supplied);
  if (suppliedSet.size !== supplied.length) {
    throw new Error(
      "Transaction graph lists the same challenger more than once.",
    );
  }

  const expected = [...local, ...universal];
  const expectedSet = new Set(expected);
  const missing = expected.filter((key) => !suppliedSet.has(key));
  const unexpected = supplied.filter((key) => !expectedSet.has(key));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new ChallengerSetMismatchError(missing, unexpected);
  }
}

function normalizeKey(pubkey: string): string {
  return stripHexPrefix(pubkey).toLowerCase();
}
