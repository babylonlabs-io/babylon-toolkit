import { Avatar } from "@babylonlabs-io/core-ui";
import { useState } from "react";

import { CopyableHash } from "@/components/shared/CopyableHash";
import { ExpandMenuButton } from "@/components/shared/ExpandMenuButton";
import type { LiquidationGroupRow } from "@/types/activityLog";
import { getExplorerTxUrl } from "@/utils/explorer";
import { formatDateTime } from "@/utils/formatting";

interface LiquidationGroupCardProps {
  row: LiquidationGroupRow;
}

export function LiquidationGroupCard({ row }: LiquidationGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [collateralIcon, debtIcon] = row.tokenIcons;

  const summary = row.summary.debt
    ? `${row.summary.collateral.value} ${row.summary.collateral.symbol} / ${row.summary.debt.value} ${row.summary.debt.symbol}`
    : `${row.summary.collateral.value} ${row.summary.collateral.symbol}`;

  return (
    <article className="flex flex-col gap-6 rounded-2xl bg-secondary-highlight p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <Avatar
              url={collateralIcon}
              alt={row.summary.collateral.symbol}
              size="small"
              className="-mr-2"
            />
            {debtIcon && row.summary.debt && (
              <Avatar
                url={debtIcon}
                alt={row.summary.debt.symbol}
                size="small"
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xl leading-none text-accent-primary">
              {row.type}
            </span>
            <span className="text-sm text-accent-primary">{summary}</span>
          </div>
        </div>
        <ExpandMenuButton
          isExpanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse details" : "Expand details"}
          variant="muted"
        />
      </div>
      {expanded && (
        <ul role="list" className="flex flex-col gap-2">
          {row.children.map((child) => (
            <li
              key={child.id}
              className="flex items-center justify-between gap-4 rounded-lg bg-primary-contrast p-4"
            >
              <div className="flex min-w-0 items-center gap-2">
                <Avatar
                  url={child.tokenIcon}
                  alt={child.amount.symbol}
                  size="small"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-base leading-none text-accent-primary">
                    {child.label}
                  </span>
                  <CopyableHash
                    hash={child.transactionHash}
                    chain={child.chain}
                    explorerUrl={getExplorerTxUrl(
                      child.chain,
                      child.transactionHash,
                    )}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-base text-accent-primary">
                  {child.amount.value} {child.amount.symbol}
                </span>
                <span className="text-xs text-accent-secondary">
                  {formatDateTime(child.date)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
