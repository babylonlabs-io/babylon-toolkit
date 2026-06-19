/**
 * DisconnectedOverview Component
 *
 * Entry / landing screen rendered when no wallet is connected. Left column:
 * product pitch, a Cap / Max CF / Loan process time stat row, and the Connect
 * CTA. Right column: a vertical list of feature cards. The rates card statically
 * shows live borrow APRs; only the last two cards expand, with single-open
 * accordion behavior.
 */

import { MobileLogo } from "@babylonlabs-io/core-ui";
import { useMemo, useState } from "react";

import { BPS_SCALE } from "@/applications/aave/constants";
import {
  useVaultSplitParams,
  type VaultSplitParams,
} from "@/applications/aave/hooks";
import { Connect } from "@/components/Wallet";
import { COPY } from "@/copy";
import type { CapSnapshot } from "@/services/deposit";
import {
  formatSatoshisToBtcDisplay,
  satoshiToBtcNumber,
} from "@/utils/btcConversion";
import { formatBasisPointsAsPercent } from "@/utils/formatting";

import { CompetitiveRatesIcon } from "./DisconnectedFeatureCards/CompetitiveRatesIcon";
import { FastAccessIcon } from "./DisconnectedFeatureCards/FastAccessIcon";
import { FeatureCard } from "./DisconnectedFeatureCards/FeatureCard";
import { PartialLiquidationIcon } from "./DisconnectedFeatureCards/PartialLiquidationIcon";
import { SelfCustodialIcon } from "./DisconnectedFeatureCards/SelfCustodialIcon";
import { TrustlessIcon } from "./DisconnectedFeatureCards/TrustlessIcon";
import { useLandingBorrowAprs } from "./useLandingBorrowAprs";

const COPY_OVERVIEW = COPY.overview.disconnected;

function formatCapAmount(satoshis: bigint): string {
  const btc = satoshiToBtcNumber(satoshis);
  return formatSatoshisToBtcDisplay(satoshis, btc >= 1 ? 2 : 8);
}

function capStatValue(capSnapshot: CapSnapshot | null): string {
  if (!capSnapshot) return "—";
  if (!capSnapshot.hasTotalCap) return COPY_OVERVIEW.stats.capUncapped;
  return COPY_OVERVIEW.stats.capValue(
    formatCapAmount(capSnapshot.totalBTC),
    formatCapAmount(capSnapshot.totalCapBTC),
  );
}

function maxCfStatValue(splitParams: VaultSplitParams | null): string {
  if (!splitParams) return COPY.common.emptyValue;
  return formatBasisPointsAsPercent(Math.round(splitParams.CF * BPS_SCALE));
}

interface StatCellProps {
  label: string;
  value: string;
  withDivider?: boolean;
}

function StatCell({ label, value, withDivider }: StatCellProps) {
  return (
    <div
      className={`flex flex-col gap-1 px-4 py-3 ${withDivider ? "border-l border-secondary-strokeLight dark:border-secondary-strokeDark" : ""}`}
    >
      <span className="text-xs text-accent-secondary">{label}</span>
      <span className="text-base text-accent-primary">{value}</span>
    </div>
  );
}

interface AprStat {
  label: string;
  value: string | undefined;
  colorClass: string;
}

function AprRow({ stats }: { stats: AprStat[] }) {
  return (
    <div className="grid grid-cols-3">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={`flex flex-col gap-1 ${i > 0 ? "border-l border-secondary-strokeLight pl-4 dark:border-secondary-strokeDark" : ""}`}
        >
          <span className="text-xs text-accent-secondary">{stat.label}</span>
          <span className={`text-2xl font-normal ${stat.colorClass}`}>
            {stat.value ?? "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

interface DisconnectedOverviewProps {
  capSnapshot: CapSnapshot | null;
}

export function DisconnectedOverview({
  capSnapshot,
}: DisconnectedOverviewProps) {
  const borrowAprs = useLandingBorrowAprs();
  const { params: splitParams } = useVaultSplitParams();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const aprStats: AprStat[] = useMemo(
    () => [
      {
        label: COPY_OVERVIEW.aprLabels.usdt,
        value: borrowAprs.usdt,
        colorClass: "text-[#26A17B]",
      },
      {
        label: COPY_OVERVIEW.aprLabels.usdc,
        value: borrowAprs.usdc,
        colorClass: "text-[#2775CA]",
      },
      {
        label: COPY_OVERVIEW.aprLabels.wbtc,
        value: borrowAprs.wbtc,
        colorClass: "text-[#F7931A]",
      },
    ],
    [borrowAprs.usdt, borrowAprs.usdc, borrowAprs.wbtc],
  );

  const featureCards = useMemo(() => {
    const features = COPY_OVERVIEW.features;
    return [
      {
        icon: <CompetitiveRatesIcon />,
        title: features.competitiveRates.title,
        body: features.competitiveRates.body,
        extra: <AprRow stats={aprStats} />,
      },
      {
        icon: <FastAccessIcon />,
        title: features.fastAccess.title,
        body: features.fastAccess.body,
      },
      {
        icon: <PartialLiquidationIcon />,
        title: features.partialLiquidation.title,
        body: features.partialLiquidation.body,
      },
      {
        icon: <SelfCustodialIcon />,
        title: features.selfCustodial.title,
        body: features.selfCustodial.body,
        expandable: true,
      },
      {
        icon: <TrustlessIcon />,
        title: features.trustless.title,
        body: features.trustless.body,
        expandable: true,
      },
    ];
  }, [aprStats]);

  return (
    <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-2 md:gap-12">
      {/* Left: product pitch + stats + Connect CTA */}
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          <span className="[&_svg]:!h-10 [&_svg]:!w-10 [&_svg]:!text-secondary-main dark:[&_svg]:!text-accent-primary">
            <MobileLogo />
          </span>
          <img
            src="/images/aave.svg"
            alt="Aave"
            className="h-10 w-10 rounded-full"
          />
        </div>

        <h3 className="mt-8 text-[34px] font-normal leading-tight text-accent-primary">
          {COPY_OVERVIEW.heroTitle}
        </h3>
        <p className="mt-4 text-base text-accent-secondary">
          {COPY_OVERVIEW.heroBody}
        </p>

        <div className="mt-8 grid w-full max-w-md grid-cols-3 rounded-xl border border-secondary-strokeLight dark:border-secondary-strokeDark">
          <StatCell
            label={COPY_OVERVIEW.stats.capLabel}
            value={capStatValue(capSnapshot)}
          />
          <StatCell
            label={COPY_OVERVIEW.stats.maxCfLabel}
            value={maxCfStatValue(splitParams)}
            withDivider
          />
          <StatCell
            label={COPY_OVERVIEW.stats.loanProcessTimeLabel}
            value={COPY_OVERVIEW.stats.loanProcessTimePlaceholder}
            withDivider
          />
        </div>

        <div className="mt-8">
          <Connect text={COPY_OVERVIEW.connectButton} />
        </div>
      </div>

      {/* Right: feature cards. Only the last two expand (single-open). */}
      <div className="flex flex-col gap-3">
        {featureCards.map((card, index) => (
          <FeatureCard
            key={card.title}
            icon={card.icon}
            title={card.title}
            body={card.body}
            extra={card.extra}
            expandable={card.expandable}
            expanded={card.expandable ? expandedIndex === index : undefined}
            onToggle={
              card.expandable
                ? () =>
                    setExpandedIndex((current) =>
                      current === index ? null : index,
                    )
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
