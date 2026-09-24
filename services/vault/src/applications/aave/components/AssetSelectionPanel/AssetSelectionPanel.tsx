/**
 * AssetSelectionPanel
 *
 * Select asset, the first step of the borrow flow in the loan overlay: one
 * card per borrowable token. A token can be listed on several hubs, so a card
 * stands for all of that token's reserves and carries no per-market figures;
 * Select hub compares them next. Frozen and paused reserves are already absent
 * from `borrowableReserves`.
 *
 * Aave caps how many reserves the position may borrow. At the cap only the
 * tokens it already owes stay pickable, because borrowing more of those is
 * the one borrow the Spoke still accepts.
 */

import { Avatar } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import type { Address } from "viem";

import { COPY } from "@/copy";

import { useAaveConfig } from "../../context";
import {
  isReserveSelectable,
  type BorrowReserveGate,
} from "../../utils/borrowReserveLimit";
import { groupReservesByUnderlying } from "../../utils/reserveGroups";
import { getReserveTokenLabel } from "../../utils/reserveTokenLabel";
import { BorrowLimitNotice } from "../BorrowLimitNotice";
import { LoanPickerFrame } from "../LoanPickerFrame";

interface AssetSelectionPanelProps {
  /**
   * Receives the chosen token's underlying address. The overlay decides
   * whether the token needs Select hub or goes straight to its form.
   */
  onSelectAsset: (underlying: Address) => void;
  /** The position's standing against the spoke's borrow-reserve cap. */
  borrowGate: BorrowReserveGate;
}

export function AssetSelectionPanel({
  onSelectAsset,
  borrowGate,
}: AssetSelectionPanelProps) {
  const { borrowableReserves } = useAaveConfig();

  const cards = useMemo(
    () =>
      groupReservesByUnderlying(borrowableReserves).map(
        ({ underlying, reserves }) => ({
          underlying,
          // A token is pickable while any of its markets still is: Select hub
          // narrows it to the ones that are.
          selectable: reserves.some((reserve) =>
            isReserveSelectable(borrowGate, reserve.reserveId),
          ),
          ...getReserveTokenLabel(reserves[0]),
        }),
      ),
    [borrowableReserves, borrowGate],
  );

  return (
    <LoanPickerFrame
      title={COPY.loans.assetSelection.title}
      notice={
        borrowGate.limit !== null && (
          <BorrowLimitNotice mode="asset" limit={borrowGate.limit} />
        )
      }
    >
      {cards.length === 0 ? (
        <p className="py-4 text-center text-accent-secondary">
          {COPY.loans.assetSelection.emptyBorrow}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map((card) => (
            <button
              key={card.underlying}
              type="button"
              disabled={!card.selectable}
              onClick={() => onSelectAsset(card.underlying)}
              className="flex min-w-0 items-center gap-4 rounded-xl bg-background-secondary p-4 text-left transition-colors enabled:cursor-pointer enabled:hover:brightness-125 disabled:opacity-40"
              // E2E: e2e/real/actions/borrow.ts (selectAsset) clicks the card
              // by underlying address. Keyed by address, not symbol: two hubs
              // can list different tokens that share a symbol.
              data-testid={`asset-select-row-${card.underlying.toLowerCase()}`}
            >
              <Avatar
                url={card.icon}
                alt={card.name}
                size="large"
                variant="circular"
                className="h-12 w-12 shrink-0 rounded-full bg-white"
              />
              <span className="flex min-w-0 flex-col items-start">
                <span className="w-full truncate text-base leading-[1.5] tracking-[0.15px] text-accent-primary">
                  {card.name}
                </span>
                <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">
                  {card.symbol}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </LoanPickerFrame>
  );
}
