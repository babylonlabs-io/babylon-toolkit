/**
 * Assert that a `reorderVaults(bytes32[])` submission is well-formed against
 * trusted on-chain state, before the wallet prompt fires.
 *
 * The reorder CTA builds its calldata from indexer-supplied vault IDs,
 * amounts, and liquidation indexes. The on-chain adapter only rejects
 * invalid permutations (`InvalidVaultsPermutation`), so a tampered indexer
 * can return the user's real vault IDs but falsified amounts to steer the
 * dApp-side optimizer toward an attacker-chosen-but-valid order.
 *
 * Two guards close that gap. Both fail closed.
 *
 * - `assertReorderMembership` reads `AaveIntegrationAdapter.getPosition(user)`
 *   from the env-pinned adapter and refuses if the submitted multiset
 *   disagrees with the on-chain set.
 *
 * - `assertOptimalOrderMatchesOnChain` re-fetches per-vault basic info
 *   from `BTCVaultRegistry.getBtcVaultBasicInfo` (amount, status,
 *   applicationEntryPoint), re-runs the full `calculate(...)` pipeline
 *   with on-chain amounts, and refuses if any per-vault status /
 *   application check fails or if the trusted calculator's
 *   `optimalVaultOrder` does not equal the submission (including the
 *   case where the trusted calculator would have suggested no reorder at
 *   all). Only called when the caller is the auto-suggested CTA — manual
 *   drag-and-drop reorders intentionally skip this guard so the user can
 *   pick a non-optimal order.
 */

import { ContractStatus } from "@babylonlabs-io/ts-sdk/tbv/core/services";
import { getPosition } from "@babylonlabs-io/ts-sdk/tbv/integrations/aave";
import type { Address, Hex } from "viem";

import { getBtcVaultBasicInfoFromChain } from "@/clients/eth-contract/btc-vault-registry/query";
import { ethClient } from "@/clients/eth-contract/client";
import { satoshiToBtcNumber } from "@/utils/btcConversion";

import { calculate, type Vault } from "../positionNotifications";

export class ReorderMembershipMismatchError extends Error {
  readonly code = "REORDER_MEMBERSHIP_MISMATCH";
}

export class OptimalReorderMismatchError extends Error {
  readonly code = "OPTIMAL_REORDER_MISMATCH";
}

export class PositionChangedError extends Error {
  readonly code = "POSITION_CHANGED_REFRESH_REQUIRED";
}

/**
 * Trusted calculator inputs for the optimal-order recompute. All values
 * must be on-chain-anchored — the whole point of the guard is to refuse
 * recomputes against indexer-supplied inputs.
 *
 * - CF, THF, maxLB: from `useVaultSplitParams` (Spoke reads)
 * - btcPrice: from `usePrices` (Chainlink BTC/USD aggregator)
 * - totalDebtUsd: from `useAaveUserPosition().debtValueUsd`
 *   (`accountData.totalDebtValueRay`, a Spoke read)
 * - expectedHF: optional override; defaults to the calculator's
 *   `EXPECTED_HEALTH_FACTOR_AT_LIQUIDATION`.
 */
export interface ReorderVerificationContext {
  CF: number;
  THF: number;
  maxLB: number;
  btcPrice: number;
  totalDebtUsd: number;
  expectedHF?: number;
}

function lower(id: Hex): string {
  return id.toLowerCase();
}

function sameMultiset(a: readonly Hex[], b: readonly Hex[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const id of a) counts.set(lower(id), (counts.get(lower(id)) ?? 0) + 1);
  for (const id of b) {
    const next = (counts.get(lower(id)) ?? 0) - 1;
    if (next < 0) return false;
    counts.set(lower(id), next);
  }
  return Array.from(counts.values()).every((n) => n === 0);
}

function sameOrderedSequence(a: readonly Hex[], b: readonly Hex[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (lower(a[i]) !== lower(b[i])) return false;
  }
  return true;
}

/**
 * Guard A — verify the submitted vault IDs are exactly the user's current
 * on-chain position. Runs on every reorder submission (auto-suggested CTA
 * and manual drag-and-drop modal alike).
 *
 * Returns the on-chain ordering so callers (specifically Guard B) can
 * feed it into the notification calculator without a second
 * `getPosition` round-trip.
 *
 * @param trustedAdapterAddress - Env-pinned AaveIntegrationAdapter (same
 *   address the tx will be sent to). Read straight from
 *   `getAaveAdapterAddress()` at the call site.
 * @returns the current on-chain ordering of `vaultIds`, exactly as the
 *   adapter returned them.
 * @throws {ReorderMembershipMismatchError} when the on-chain multiset
 *   disagrees with the submitted multiset (case-insensitive), or when no
 *   position exists.
 */
export async function assertReorderMembership(
  trustedAdapterAddress: Address,
  user: Address,
  submittedVaultIds: readonly Hex[],
): Promise<readonly Hex[]> {
  const publicClient = ethClient.getPublicClient();
  const position = await getPosition(publicClient, trustedAdapterAddress, user);
  if (!position) {
    throw new ReorderMembershipMismatchError(
      `No on-chain position found for ${user} on adapter ${trustedAdapterAddress}. Aborting reorder to avoid signing against unknown vault membership.`,
    );
  }
  if (!sameMultiset(submittedVaultIds, position.vaultIds)) {
    throw new ReorderMembershipMismatchError(
      `Reorder submission vault set does not match on-chain position. Submitted ${submittedVaultIds.length} vaults, on-chain has ${position.vaultIds.length}.`,
    );
  }
  return position.vaultIds;
}

/**
 * Guard B — verify the submitted ordering equals what the trusted
 * notification calculator would have suggested.
 *
 * Re-runs the full `calculate(...)` pipeline (not just `computeOptimalOrder`)
 * so that suppression rules — e.g. when an optimal reorder would newly
 * introduce an over-seizure condition the user currently doesn't have — are
 * honored. A
 * malicious indexer can otherwise fabricate a CTA whose submitted order
 * equals `computeOptimalOrder(trusted).order` even though the trusted
 * calculator would have returned `optimalVaultOrder: null`.
 *
 * The calculator needs the **current** on-chain ordering as its `vaults`
 * input so it can decide whether a reorder helps relative to that
 * baseline; callers thread that through from `assertReorderMembership`'s
 * return value to avoid a duplicate `getPosition` round-trip.
 *
 * Also validates per-vault on-chain status / applicationEntryPoint to
 * match the audit recommendation literally (Guard A's membership check
 * makes these structurally redundant, but they fail closed regardless).
 *
 * Only invoked from the auto-suggested CTA. The manual drag-and-drop modal
 * intentionally does not call this guard, so users can choose a non-optimal
 * order without being second-guessed by the dApp.
 *
 * @param currentVaultIds - Ordering returned by
 *   `AaveIntegrationAdapter.getPosition(user).vaultIds`. Used as the
 *   `vaults` input to `calculate(...)` so the suppression rules see the
 *   user's actual current ordering.
 * @throws {OptimalReorderMismatchError} when any per-vault check fails,
 *   the trusted calculator suggests no reorder, or the optimal order
 *   does not equal the submission.
 */
export async function assertOptimalOrderMatchesOnChain(
  submittedVaultIds: readonly Hex[],
  currentVaultIds: readonly Hex[],
  trustedAdapterAddress: Address,
  ctx: ReorderVerificationContext,
): Promise<void> {
  if (submittedVaultIds.length === 0) {
    throw new OptimalReorderMismatchError(
      "Reorder submission is empty — refusing to sign.",
    );
  }

  const basicInfo = await getBtcVaultBasicInfoFromChain(currentVaultIds);

  const vaults: Vault[] = currentVaultIds.map((id, i) => {
    const info = basicInfo.get(lower(id) as Hex);
    if (info === undefined) {
      throw new OptimalReorderMismatchError(
        `On-chain basic info for vault ${id} not returned by registry multicall.`,
      );
    }
    if (info.status !== ContractStatus.ACTIVE) {
      throw new OptimalReorderMismatchError(
        `Vault ${id} has on-chain status ${info.status}, expected ACTIVE (${ContractStatus.ACTIVE}). Refusing to recompute reorder against a non-active vault.`,
      );
    }
    if (
      info.applicationEntryPoint.toLowerCase() !==
      trustedAdapterAddress.toLowerCase()
    ) {
      throw new OptimalReorderMismatchError(
        `Vault ${id} is bound to application ${info.applicationEntryPoint}, expected the env-pinned Aave adapter ${trustedAdapterAddress}.`,
      );
    }
    return {
      id: lower(id),
      btc: satoshiToBtcNumber(info.amount),
      name: `Vault ${i + 1}`,
    };
  });

  // Re-runs the full optimizer (worst case ~100-200ms for an exact DP at the
  // 17-vault cap). Acceptable on this path: it's a one-shot guard immediately
  // before a wallet prompt (which itself takes seconds), and a position of 17
  // separate peg-ins is extraordinarily rare.
  const { optimalVaultOrder } = calculate({
    btcPrice: ctx.btcPrice,
    totalDebtUsd: ctx.totalDebtUsd,
    vaults,
    CF: ctx.CF,
    THF: ctx.THF,
    maxLB: ctx.maxLB,
    ...(ctx.expectedHF !== undefined ? { expectedHF: ctx.expectedHF } : {}),
  });

  if (optimalVaultOrder === null) {
    throw new OptimalReorderMismatchError(
      "Trusted calculator would not have suggested a reorder under on-chain amounts. Aborting to avoid signing an indexer-fabricated CTA.",
    );
  }

  const expectedOrder = optimalVaultOrder.map((v) => v.id as Hex);

  if (!sameOrderedSequence(submittedVaultIds, expectedOrder)) {
    throw new OptimalReorderMismatchError(
      "Optimal reorder does not match the calculator's output under on-chain amounts. Aborting to avoid signing an indexer-steered permutation.",
    );
  }
}

/**
 * Guard C — verify the live on-chain vault ordering still matches the
 * caller's modal-open baseline.
 *
 * The drag-and-drop reorder modal snapshots the indexer-derived vault
 * list when it opens (so the user's drag state isn't stomped by
 * background refetches). If live state changes while the modal is open
 * — sibling-tab confirm, position-manager action, partial liquidation —
 * the signed `bytes32[]` can still be a valid permutation of the live
 * multiset and silently overwrites the new on-chain order with the
 * stale one. The on-chain `InvalidVaultsPermutation` check is
 * multiset-only and `eth_call` simulates the already-built calldata,
 * so neither catches this.
 *
 * This guard is a pure function over the live ordering already returned
 * by {@link assertReorderMembership}, so the modal path does not pay an
 * extra `getPosition` RPC for the check.
 *
 * @param liveVaultIds - Ordering returned by
 *   `AaveIntegrationAdapter.getPosition(user).vaultIds` — typically the
 *   value `assertReorderMembership` just returned.
 * @param expectedCurrentVaultIds - The vault order the caller believes
 *   is live (e.g. the modal-open snapshot the user reviewed before
 *   dragging).
 * @throws {PositionChangedError} when the two orderings disagree in
 *   length or strict order (case-insensitive on the bytes32 hex).
 */
export function assertReorderBaseline(
  liveVaultIds: readonly Hex[],
  expectedCurrentVaultIds: readonly Hex[],
): void {
  if (!sameOrderedSequence(liveVaultIds, expectedCurrentVaultIds)) {
    throw new PositionChangedError(
      "Your collateral order changed since you opened this dialog. Close it, review the refreshed order, and try again.",
    );
  }
}
