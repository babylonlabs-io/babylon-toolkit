/**
 * AssetSelectionPanel
 *
 * Select asset, the first step of the borrow flow in the loan overlay: one
 * card per borrowable token. A token can be listed on several hubs, so a card
 * stands for all of that token's reserves and carries no per-market figures;
 * Select hub compares them next. Frozen and paused reserves are already absent
 * from `borrowableReserves`.
 */

import { Avatar } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import type { Address } from "viem";

import { COPY } from "@/copy";

import { useAaveConfig } from "../../context";
import { groupReservesByUnderlying } from "../../utils/reserveGroups";
import { getReserveTokenLabel } from "../../utils/reserveTokenLabel";
import { LoanPickerFrame } from "../LoanPickerFrame";

interface AssetSelectionPanelProps {
  /**
   * Receives the chosen token's underlying address. The overlay decides
   * whether the token needs Select hub or goes straight to its form.
   */
  onSelectAsset: (underlying: Address) => void;
}

export function AssetSelectionPanel({
  onSelectAsset,
}: AssetSelectionPanelProps) {
  const { borrowableReserves } = useAaveConfig();

  const cards = useMemo(
    () =>
      groupReservesByUnderlying(borrowableReserves).map(
        ({ underlying, reserves }) => ({
          underlying,
          ...getReserveTokenLabel(reserves[0]),
        }),
      ),
    [borrowableReserves],
  );

  return (
    <LoanPickerFrame title={COPY.loans.assetSelection.title}>
      {cards.length === 0 ? (
        <p className="py-4 text-center text-accent-secondary">
          {COPY.loans.assetSelection.emptyBorrow}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {cards.map((card) => (
            <button
              key={card.underlying}
              type="button"
              onClick={() => onSelectAsset(card.underlying)}
              className="flex min-w-0 cursor-pointer items-center gap-4 rounded-xl bg-secondary-highlight p-4 text-left transition-colors hover:bg-secondary-strokeLight dark:bg-primary-main dark:hover:bg-secondary-strokeDark"
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
                <span className="w-full truncate text-base text-accent-primary">
                  {card.name}
                </span>
                <span className="text-sm text-accent-secondary">
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
