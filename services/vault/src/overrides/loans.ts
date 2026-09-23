import { getAddress, type Address } from "viem";

import type { BorrowedAsset } from "@/applications/aave/hooks/useAaveBorrowedAssets";
import type { ActiveLoanRow } from "@/applications/aave/hooks/useActiveLoans";
import type { AaveReserveConfig } from "@/applications/aave/services/fetchConfig";
import {
  isAtBorrowReserveLimit,
  knownBorrowCount,
  type BorrowReserveLimit,
} from "@/applications/aave/utils/borrowReserveLimit";

import { createOverrideStore } from "./store";

export interface LoanOverride {
  rows: ActiveLoanRow[];
  hideReal: boolean;
}

const loanOverrideStore = createOverrideStore<LoanOverride>();

export const useLoanOverride = loanOverrideStore.useValue;
export const setLoanOverride = loanOverrideStore.set;

/**
 * Whether a demo changes the loans at all: it adds a mock row, or hides the
 * real side. A demo with neither leaves every loans surface as it is.
 */
export function isDemoAffectingLoans(
  override: LoanOverride | null,
): override is LoanOverride {
  return override !== null && (override.rows.length > 0 || override.hideReal);
}

/**
 * One reserve as a demo counts it: symbol + hub. Every demo helper keys
 * reserves this way, so they cannot disagree.
 */
function demoReserveKey(symbol: string, hub: Address): string {
  return `${symbol}|${getAddress(hub)}`;
}

/** The reserves a demo's mock rows stand for, one key per symbol + hub. */
function demoReserveKeys(override: LoanOverride): Set<string> {
  return new Set(
    override.rows.map((row) => demoReserveKey(row.symbol, row.hub.address)),
  );
}

/**
 * Borrow-reserve count a god-mode demo stands for (dev only), so every surface
 * that counts demo borrows agrees by construction.
 *
 * Mock rows count by symbol + hub — two mock USDC rows on one hub are one
 * reserve. Their `reserveId`s are per-row counters, so counting ids would
 * never merge anything, and a demo id can never equal a real one.
 *
 * The real count is added on top unless the demo hides the real side, so
 * without `hideReal` the demo only adds to what the account already owes.
 * Mock rows are not deduplicated against real reserves: a mock on a reserve
 * the account really owes counts twice. That only ever over-counts (stricter),
 * never under-counts — the real side is the Spoke's own counter, and matching
 * it against resolved debts would mix two counters that can disagree.
 */
export function demoBorrowCount(
  override: LoanOverride,
  realBorrowCount: bigint,
): bigint {
  return (
    BigInt(demoReserveKeys(override).size) +
    (override.hideReal ? 0n : realBorrowCount)
  );
}

/**
 * The borrow count a Borrowed Asset card shows, with any god-mode demo folded
 * in, so every card that shows it agrees.
 *
 * The real count is unknown (null) while the position is still loading or its
 * read failed; a disconnected visitor, or a position that loaded as null, owes
 * nothing. A demo row has no on-chain position behind it, so its reserves are
 * counted on top of the real count. An unknown real count leaves the card
 * unknown too, unless `hideReal` drops the real count altogether.
 */
export function cardBorrowCount(
  override: LoanOverride | null,
  real: Parameters<typeof knownBorrowCount>[0],
): bigint | null {
  if (isDemoAffectingLoans(override) && override.hideReal) {
    return demoBorrowCount(override, 0n);
  }
  const realBorrowCount = knownBorrowCount(real);
  if (realBorrowCount === null || !isDemoAffectingLoans(override)) {
    return realBorrowCount;
  }
  return demoBorrowCount(override, realBorrowCount);
}

/**
 * The borrowed assets a Borrowed Asset card shows, with any god-mode demo
 * folded in, so the card names the same assets it counts. Mock rows come
 * first; the real ones follow unless `hideReal` drops them.
 */
export function cardBorrowedAssets(
  override: LoanOverride | null,
  real: BorrowedAsset[],
): BorrowedAsset[] {
  if (!isDemoAffectingLoans(override)) return real;
  return [...override.rows, ...(override.hideReal ? [] : real)];
}

/**
 * Reserve ids a borrow picker treats as owed under a god-mode demo (dev only).
 *
 * The reserves the account really owes stay exempt, unless `hideReal` drops
 * the real position. A mock row also stands for a reserve owed, so the real
 * reserve it names (symbol + hub) is exempt too — otherwise the picker would
 * grey the very reserve the Loans page lists as owed. Only while the real
 * count alone is below the picker's cap: there the real account would already
 * be offered every reserve, so the exemption offers nothing the picker without
 * a demo would not. `hideReal` drops the real count here too, as
 * `demoBorrowCount` does, so a wallet already at the real cap still gets the
 * demo's reserves exempted: the one way a demo can offer more than the real
 * position would.
 */
export function demoBorrowedReserveIds(
  override: LoanOverride,
  {
    limit,
    realBorrowCount,
    realBorrowedReserveIds,
    reserves,
  }: {
    limit: BorrowReserveLimit;
    realBorrowCount: bigint;
    realBorrowedReserveIds: ReadonlySet<bigint>;
    /** Every reserve a mock row's symbol + hub could name. */
    reserves: readonly AaveReserveConfig[];
  },
): Set<bigint> {
  const borrowedReserveIds = new Set(
    override.hideReal ? [] : realBorrowedReserveIds,
  );
  if (
    !isAtBorrowReserveLimit(limit, override.hideReal ? 0n : realBorrowCount)
  ) {
    const mockReserves = demoReserveKeys(override);
    for (const reserve of reserves) {
      if (
        mockReserves.has(
          demoReserveKey(reserve.token.symbol, reserve.reserve.hub),
        )
      ) {
        borrowedReserveIds.add(reserve.reserveId);
      }
    }
  }
  return borrowedReserveIds;
}
