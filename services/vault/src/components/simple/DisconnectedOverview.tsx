/**
 * DisconnectedOverview Component
 *
 * Entry / landing screen rendered when no wallet is connected. Left column:
 * stat chips, product pitch, the live borrow-APR row under a "Current Borrowing
 * Rates" heading, and the Connect CTA. Right column: one unbordered panel of
 * feature rows; only one row expands, with single-open accordion behavior.
 */

import { Avatar } from "@babylonlabs-io/core-ui";
import { Fragment, useMemo, useState } from "react";

import { BPS_SCALE } from "@/applications/aave/constants";
import {
  useVaultSplitParams,
  type VaultSplitParams,
} from "@/applications/aave/hooks";
import { Connect } from "@/components/Wallet";
import { COPY } from "@/copy";
import { usePrices } from "@/hooks/usePrices";
import type { CapSnapshot } from "@/services/deposit";
import { getCurrencyIconWithFallback } from "@/services/token/tokenService";
import {
  formatSatoshisToBtcDisplay,
  satoshiToBtcNumber,
} from "@/utils/btcConversion";
import {
  formatBasisPointsAsPercent,
  formatCompactUsd,
} from "@/utils/formatting";

import { CompetitiveRatesIcon } from "./DisconnectedFeatureCards/CompetitiveRatesIcon";
import { FeatureCard } from "./DisconnectedFeatureCards/FeatureCard";
import { PartialLiquidationIcon } from "./DisconnectedFeatureCards/PartialLiquidationIcon";
import { SelfCustodialIcon } from "./DisconnectedFeatureCards/SelfCustodialIcon";
import { useLandingBorrowAprs } from "./useLandingBorrowAprs";

const COPY_OVERVIEW = COPY.overview.disconnected;

// Splitting the headline into coloured spans makes the accessible name compute
// as "B i tcoin", so the heading carries the unsplit sentence as its label.
const HERO_TITLE = COPY_OVERVIEW.heroTitle;
const HERO_TITLE_TEXT = `${HERO_TITLE.lead}${HERO_TITLE.accentWord.before}${HERO_TITLE.accentWord.dotted}${HERO_TITLE.accentWord.after}${HERO_TITLE.rest}`;

function formatCapAmount(satoshis: bigint): string {
  const btc = satoshiToBtcNumber(satoshis);
  return formatSatoshisToBtcDisplay(satoshis, btc >= 1 ? 2 : 8);
}

function capStatValue(
  capSnapshot: CapSnapshot | null,
  capError: Error | null,
): string {
  if (!capSnapshot || capError) return COPY.common.emptyValue;
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

// TVL is the BTC locked across the application priced in USD. Suppressed rather
// than approximated whenever an input is untrustworthy — a stale or failed
// oracle round, a zero answer from a fresh one (nothing upstream rejects it),
// or an errored usage read, whose snapshot falls back to a 0n total. `$0 TVL`
// on the landing screen reads as a fact rather than as a failure.
function tvlStatValue(
  capSnapshot: CapSnapshot | null,
  capError: Error | null,
  btcPriceUsd: number | undefined,
  isBtcPriceUsable: boolean,
): string {
  if (
    !capSnapshot ||
    capError ||
    !isBtcPriceUsable ||
    btcPriceUsd === undefined ||
    btcPriceUsd <= 0
  ) {
    return COPY.common.emptyValue;
  }
  return formatCompactUsd(
    satoshiToBtcNumber(capSnapshot.totalBTC) * btcPriceUsd,
    true,
  );
}

interface StatChipProps {
  label: string;
  value: string;
}

function StatChip({ label, value }: StatChipProps) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-lg bg-background-secondary px-3.5 text-sm leading-[1.43] tracking-[0.17px]">
      <span className="text-accent-secondary">{label}</span>
      <span className="text-accent-primary">{value}</span>
    </span>
  );
}

interface AprStat {
  symbol: string;
  label: string;
  value: string | undefined;
}

function AprRow({ stats }: { stats: AprStat[] }) {
  return (
    <div className="flex flex-wrap items-center gap-6">
      {stats.map((stat, i) => (
        <Fragment key={stat.symbol}>
          {i > 0 && (
            <div
              aria-hidden="true"
              className="h-12 w-px shrink-0 bg-secondary-strokeLight"
            />
          )}
          <div className="flex items-center gap-3">
            <Avatar
              size="large"
              url={getCurrencyIconWithFallback(undefined, stat.symbol)}
              alt={stat.symbol}
            />
            <div className="flex flex-col items-center text-center">
              <span className="text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
                {stat.label}
              </span>
              <span className="text-accent-primary">
                <span className="text-xl leading-[1.6] tracking-[0.15px]">
                  {stat.value ?? COPY.common.emptyValue}
                </span>
                {stat.value !== undefined && (
                  <>
                    {" "}
                    <span className="text-sm leading-[1.43] tracking-[0.17px]">
                      {COPY_OVERVIEW.aprSuffix}
                    </span>
                  </>
                )}
              </span>
            </div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

interface DisconnectedOverviewProps {
  capSnapshot: CapSnapshot | null;
  capError: Error | null;
}

export function DisconnectedOverview({
  capSnapshot,
  capError,
}: DisconnectedOverviewProps) {
  const borrowAprs = useLandingBorrowAprs();
  const { params: splitParams } = useVaultSplitParams();
  const { prices, metadata } = usePrices();
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);

  const btcPriceUsd = prices["BTC"];
  const btcMetadata = metadata["BTC"];
  const isBtcPriceUsable =
    btcMetadata !== undefined &&
    !btcMetadata.isStale &&
    !btcMetadata.fetchFailed;

  const aprStats: AprStat[] = useMemo(
    () => [
      {
        symbol: "USDT",
        label: COPY_OVERVIEW.aprLabels.usdt,
        value: borrowAprs.usdt,
      },
      {
        symbol: "USDC",
        label: COPY_OVERVIEW.aprLabels.usdc,
        value: borrowAprs.usdc,
      },
      {
        symbol: "WBTC",
        label: COPY_OVERVIEW.aprLabels.wbtc,
        value: borrowAprs.wbtc,
      },
    ],
    [borrowAprs.usdt, borrowAprs.usdc, borrowAprs.wbtc],
  );

  const statChips = useMemo(
    () => [
      {
        label: COPY_OVERVIEW.stats.tvlLabel,
        value: tvlStatValue(
          capSnapshot,
          capError,
          btcPriceUsd,
          isBtcPriceUsable,
        ),
      },
      {
        label: COPY_OVERVIEW.stats.capLabel,
        value: capStatValue(capSnapshot, capError),
      },
      {
        label: COPY_OVERVIEW.stats.maxCfLabel,
        value: maxCfStatValue(splitParams),
      },
    ],
    [capSnapshot, capError, splitParams, btcPriceUsd, isBtcPriceUsable],
  );

  const featureCards = useMemo(() => {
    const features = COPY_OVERVIEW.features;
    return [
      {
        icon: <CompetitiveRatesIcon />,
        title: features.competitiveRates.title,
        body: features.competitiveRates.body,
      },
      {
        icon: <SelfCustodialIcon />,
        title: features.selfCustodial.title,
        body: features.selfCustodial.body,
        expandable: true,
      },
      {
        icon: <PartialLiquidationIcon />,
        title: features.partialLiquidation.title,
        body: features.partialLiquidation.body,
        expandable: true,
      },
    ];
  }, []);

  return (
    <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-2 md:gap-12">
      <div className="flex flex-col">
        <div className="flex flex-wrap gap-4">
          {statChips.map((chip) => (
            <StatChip key={chip.label} label={chip.label} value={chip.value} />
          ))}
        </div>

        <h1
          aria-label={HERO_TITLE_TEXT}
          className="mt-[26.67px] text-[clamp(2rem,5vw,3rem)] font-normal leading-[1.167] text-accent-primary"
        >
          {HERO_TITLE.lead}
          <span className="whitespace-nowrap">
            {HERO_TITLE.accentWord.before}
            <span className="relative inline-block text-secondary-main">
              {HERO_TITLE.accentWord.dotted}
              <span
                aria-hidden="true"
                className="absolute inset-0 select-none text-accent-primary"
              >
                {HERO_TITLE.accentWord.dotless}
              </span>
            </span>
            {HERO_TITLE.accentWord.after}
          </span>
          {HERO_TITLE.rest}
        </h1>
        <p className="mt-3 text-base leading-[1.5] tracking-[0.15px] text-accent-secondary">
          {COPY_OVERVIEW.heroBody}
        </p>

        <h2 className="mt-6 text-xl font-normal leading-[1.6] tracking-[0.15px] text-accent-primary">
          {COPY_OVERVIEW.aprHeading}
        </h2>
        <div className="mt-4">
          <AprRow stats={aprStats} />
        </div>

        <div className="mt-6">
          <Connect text={COPY_OVERVIEW.connectButton} />
        </div>
      </div>

      <div className="w-full max-w-[420px] overflow-hidden rounded-lg bg-background-secondary md:self-center md:justify-self-center">
        {featureCards.map((card) => (
          <FeatureCard
            key={card.title}
            icon={card.icon}
            title={card.title}
            body={card.body}
            expandable={card.expandable}
            expanded={
              card.expandable ? expandedTitle === card.title : undefined
            }
            onToggle={
              card.expandable
                ? () =>
                    setExpandedTitle((current) =>
                      current === card.title ? null : card.title,
                    )
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
