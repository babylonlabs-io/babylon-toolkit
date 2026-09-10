/**
 * Collateral utility functions
 * Business logic for filtering and transforming collateral data.
 */

import type { AavePositionCollateral } from "@/applications/aave/services/fetchPositions";
import type {
  CollateralVaultEntry,
  CollateralVaultLifecycle,
} from "@/types/collateral";
import type { VaultProvider } from "@/types/vaultProvider";

import { truncateHash } from "./addressUtils";
import { satoshiToBtcNumber } from "./btcConversion";
import { derivePrePeginTxHash } from "./vaultTransformers";

/** Vault status while the peg-out is in flight (BTC payout not settled yet) */
const WITHDRAWING_VAULT_STATUS = "redeemed";

/** Terminal vault statuses — the vault has left the position for good */
const SETTLED_VAULT_STATUSES = new Set(["liquidated", "depositor_withdrawn"]);

/** Resolves a vault provider address to display name and icon */
type ProviderResolver = (address: string) => VaultProvider | undefined;

/**
 * Classifies a raw indexer collateral row, or `null` when it must not be shown.
 * Status leads over `removedAt`: separate indexer handlers write them.
 */
export function classifyCollateral(
  collateral: AavePositionCollateral,
): Exclude<CollateralVaultLifecycle, "activating"> | null {
  const status = collateral.vault?.status;
  if (status && SETTLED_VAULT_STATUSES.has(status)) return null;
  if (status === WITHDRAWING_VAULT_STATUS) return "withdrawing";
  if (collateral.removedAt !== null) return null;
  return "active";
}

/**
 * Maps raw Aave position collaterals to display-friendly entries, tagging each
 * with its lifecycle. Settled and liquidated collaterals are dropped; a vault
 * whose peg-out is still in flight is kept as a `withdrawing` row.
 */
export function toCollateralVaultEntries(
  collaterals: AavePositionCollateral[],
  findProvider?: ProviderResolver,
): CollateralVaultEntry[] {
  return collaterals.flatMap((c) => {
    const lifecycle = classifyCollateral(c);
    if (lifecycle === null) return [];

    const providerAddress = c.vault?.vaultProvider ?? "";
    const provider = findProvider?.(providerAddress);

    return {
      id: `${c.depositorAddress}-${c.vaultId}`,
      lifecycle,
      vaultId: c.vaultId,
      peginTxHash: c.vault?.peginTxHash,
      prePeginTxHash: derivePrePeginTxHash(c.vault?.unsignedPrePeginTx),
      amountBtc: satoshiToBtcNumber(c.amount),
      addedAt: Number(c.addedAt),
      inUse: c.vault?.inUse ?? false,
      providerAddress: providerAddress,
      providerName: provider?.name ?? truncateHash(providerAddress),
      providerIconUrl: provider?.iconUrl,
      depositorBtcPubkey: c.vault?.depositorBtcPubKey,
      depositorPayoutBtcAddress: c.vault?.depositorPayoutBtcAddress,
      unsignedPrePeginTx: c.vault?.unsignedPrePeginTx,
      liquidationIndex: c.liquidationIndex,
      offchainParamsVersion: c.vault?.offchainParamsVersion,
    };
  });
}

/** Rows that count towards the position's vault count — every row but a peg-out in flight. */
export function countActiveVaults(entries: CollateralVaultEntry[]): number {
  return entries.filter(
    (entry) => entry.lifecycle === "active" || entry.lifecycle === "activating",
  ).length;
}

/**
 * Re-tags entries whose withdrawal transaction has been mined but which the
 * indexer has not reported yet. `pendingWithdrawVaultIds` comes from the
 * pending-vaults marker (see PendingVaultsContext).
 */
export function applyPendingWithdrawals(
  entries: CollateralVaultEntry[],
  pendingWithdrawVaultIds: ReadonlySet<string>,
): CollateralVaultEntry[] {
  if (pendingWithdrawVaultIds.size === 0) return entries;
  return entries.map((entry) =>
    entry.lifecycle === "active" &&
    pendingWithdrawVaultIds.has(entry.vaultId.toLowerCase())
      ? { ...entry, lifecycle: "withdrawing" }
      : entry,
  );
}

/**
 * Computes the maximum borrowable USD value for a collateral position:
 *   amountBtc * btcPrice * collateralFactor
 *
 * Returns `null` when any input is missing, non-finite, or non-positive,
 * so callers can hide the field rather than render a misleading `$0`.
 */
export function computeMaxBorrowUsd(
  amountBtc: string,
  btcPrice: number,
  collateralFactor: number | null,
): number | null {
  if (collateralFactor === null) return null;
  if (!Number.isFinite(btcPrice) || btcPrice <= 0) return null;
  if (!Number.isFinite(collateralFactor) || collateralFactor <= 0) return null;
  const amount = parseFloat(amountBtc);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount * btcPrice * collateralFactor;
}
