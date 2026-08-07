/**
 * Borrowing markets data page (v3, Figma node 10088-60956).
 *
 * Everything on the page reads from the same three batched Hub queries over
 * `borrowableReserves`: the stats bar and the collateral card show the routed
 * symbol's slice, the table shows every reserve. The two charts are still
 * placeholders — the borrow-APR chart needs a rate time series and the
 * interest-rate-model chart needs the IRM curve parameters, and no source in
 * the app exposes either today.
 */

import { Avatar, Container, Heading, Text } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { IoChevronBack } from "react-icons/io5";
import { useLocation, useNavigate, useParams } from "react-router";

import { ReserveIdentityBlock } from "@/applications/aave/components/ReserveIdentityBlock";
import { BPS_SCALE, LOAN_TAB } from "@/applications/aave/constants";
import { useAaveConfig } from "@/applications/aave/context";
import {
  useAaveBorrowAprs,
  useAaveReserveLiquidity,
  useAaveReservesPrices,
  useVaultSplitParams,
  useVerifiedReserveIdentity,
} from "@/applications/aave/hooks";
import { NEUTRAL_BUTTON_CLASS } from "@/components/shared/buttonClasses";
import { PAGE_CONTENT_CLASS } from "@/components/shared/layoutClasses";
import { getNetworkConfigBTC } from "@/config";
import { COPY } from "@/copy";
import { useDemoMarketData } from "@/dev/demoMarketData";
import { getAssetPickerRoute, getMarketSlug, MARKET_PARAM } from "@/routes";
import {
  getCurrencyIconWithFallback,
  getTokenByAddress,
} from "@/services/token/tokenService";
import {
  formatAprPercent,
  formatBasisPointsAsPercent,
  formatCompactTokenAmount,
  formatCompactUsd,
} from "@/utils/formatting";

import type { BorrowMarketRow } from "./BorrowMarketsTable";
import { BorrowMarketsTable } from "./BorrowMarketsTable";
import { CollateralInfoCard } from "./CollateralInfoCard";
import type { MarketStat } from "./MarketStatsBar";
import { MarketStatsBar } from "./MarketStatsBar";

/** Figma's card chrome and heights, so the page's rhythm is already right
 *  when the real charts land. */
const CHART_CARD_CLASS = "w-full rounded-2xl bg-background-secondary";
const BORROW_APR_CHART_HEIGHT_CLASS = "h-[300px]";
const INTEREST_RATE_MODEL_CHART_HEIGHT_CLASS = "h-[392px]";

/** Every USD figure here sits beside an always-uppercase token amount. */
const UPPERCASE_MAGNITUDE_SUFFIX = true;

const btcConfig = getNetworkConfigBTC();

/** Empty placeholder when the amount or its price is missing, never `$0`. */
function compactUsdLabel(
  amount: number | undefined,
  priceUsd: number | null | undefined,
): string {
  return amount === undefined || priceUsd == null
    ? COPY.common.emptyValue
    : formatCompactUsd(amount * priceUsd, UPPERCASE_MAGNITUDE_SUFFIX);
}

function compactTokenLabel(amount: number | undefined, symbol: string): string {
  return amount === undefined
    ? COPY.common.emptyValue
    : `${formatCompactTokenAmount(amount)} ${symbol}`;
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <Heading variant="h5" as="h2" className="font-normal text-accent-primary">
        {title}
      </Heading>
      <Text variant="body1" className="text-accent-secondary">
        {description}
      </Text>
    </div>
  );
}

export default function BorrowingMarketsData() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { config, borrowableReserves } = useAaveConfig();

  const reserveIds = useMemo(
    () => borrowableReserves.map((r) => r.reserveId),
    [borrowableReserves],
  );
  const {
    aprPercentByReserveId,
    isLoading: aprsLoading,
    error: aprsError,
  } = useAaveBorrowAprs({ reserves: borrowableReserves });
  const {
    liquidityByReserveId,
    isLoading: liquidityLoading,
    error: liquidityError,
  } = useAaveReserveLiquidity({ reserves: borrowableReserves });
  const {
    pricesByReserveId,
    isLoading: pricesLoading,
    error: pricesError,
  } = useAaveReservesPrices({
    spokeAddress: config?.coreSpokeAddress,
    reserveIds,
  });
  // Collateral factor of the protocol's one collateral reserve (vBTC), read
  // on-chain rather than from the indexer-cached reserve config so the page
  // can't show a figure that has drifted. Needs no connected address.
  const { params: splitParams } = useVaultSplitParams();

  // God-mode demo data (dev only; null unless the panel's toggle is on).
  // Substituted at the raw-hook layer, so the derivation below formats demo
  // figures exactly as it formats live ones. Inert in production.
  const demoMarketData = useDemoMarketData();
  const isDemo = demoMarketData !== null;
  const effectiveReserves = demoMarketData?.reserves ?? borrowableReserves;
  const effectiveLiquidityByReserveId =
    demoMarketData?.liquidityByReserveId ?? liquidityByReserveId;
  const effectiveAprPercentByReserveId =
    demoMarketData?.aprPercentByReserveId ?? aprPercentByReserveId;
  const effectivePricesByReserveId =
    demoMarketData?.pricesByReserveId ?? pricesByReserveId;
  const effectiveCollateralFactor =
    demoMarketData?.collateralFactor ?? splitParams?.CF ?? null;

  // Resolve by the registry slug the link was built from, never by the
  // indexer's own symbol — see `getMarketSlug` for why that distinction is the
  // audit-F7 boundary. Exactly one match or none: `.find` would take whichever
  // duplicate the indexer ordered first.
  const selectedReserve = useMemo(() => {
    const slug = params[MARKET_PARAM]?.toLowerCase();
    const matches = !slug
      ? []
      : effectiveReserves.filter(
          (r) => getMarketSlug(r.reserveId, r.reserve.underlying) === slug,
        );
    if (matches.length === 1) return matches[0];
    // Demo only: the fixtures replace the live reserve set, so whatever id is
    // already in the URL matches none of them. Falling back to the first
    // fixture lets the toggle work from any market route instead of blanking
    // the page — the live path above still resolves strictly or not at all.
    return isDemo ? (effectiveReserves[0] ?? null) : null;
  }, [effectiveReserves, params, isDemo]);

  // Demo fixtures have no on-chain counterpart, so verification could only
  // fail for them — leave the read disabled rather than letting that failure
  // trip the integrity gate and hide the very layout the demo exists to show.
  const {
    identity,
    isLoading: identityLoading,
    error: identityError,
    isIntegrityViolation,
    retry: retryIdentity,
  } = useVerifiedReserveIdentity({
    reserveId: isDemo ? undefined : selectedReserve?.reserveId,
    underlying: isDemo ? undefined : selectedReserve?.reserve.underlying,
  });

  // Dev-only (`useDemoMarketData` is null in production): the fixture's own
  // label stands in for a verified identity. The F7 gate below still governs
  // every live reserve.
  const demoIdentity = isDemo ? selectedReserve?.token : undefined;
  const symbol = demoIdentity?.symbol ?? identity?.symbol ?? "";
  const name = demoIdentity?.name ?? identity?.name ?? symbol;
  const icon = getCurrencyIconWithFallback(
    demoIdentity
      ? getTokenByAddress(demoIdentity.address)?.icon
      : identity?.icon,
    symbol,
  );

  const rows = useMemo<BorrowMarketRow[]>(
    () =>
      effectiveReserves.map((reserve) => {
        const key = reserve.reserveId.toString();
        const liquidity = effectiveLiquidityByReserveId[key] ?? null;
        const aprPercent = effectiveAprPercentByReserveId[key] ?? null;
        const priceUsd = effectivePricesByReserveId[key] ?? null;
        const tokenSymbol = reserve.token.symbol;

        return {
          reserveId: key,
          symbol: tokenSymbol,
          name: reserve.token.name,
          icon: getCurrencyIconWithFallback(
            getTokenByAddress(reserve.token.address)?.icon,
            tokenSymbol,
          ),
          aprLabel:
            aprPercent === null
              ? COPY.common.emptyValue
              : formatAprPercent(aprPercent),
          availableLabel: compactTokenLabel(
            liquidity?.availableLiquidity,
            tokenSymbol,
          ),
          utilizationLabel:
            liquidity?.utilizationBps == null
              ? COPY.common.emptyValue
              : formatBasisPointsAsPercent(liquidity.utilizationBps),
          utilizationRatio:
            liquidity?.utilizationBps == null
              ? null
              : liquidity.utilizationBps / BPS_SCALE,
          borrowedUsdLabel: compactUsdLabel(liquidity?.totalBorrowed, priceUsd),
          borrowedTokenLabel: compactTokenLabel(
            liquidity?.totalBorrowed,
            tokenSymbol,
          ),
          suppliedUsdLabel: compactUsdLabel(
            liquidity?.suppliedLiquidity,
            priceUsd,
          ),
          suppliedTokenLabel: compactTokenLabel(
            liquidity?.suppliedLiquidity,
            tokenSymbol,
          ),
        };
      }),
    [
      effectiveReserves,
      effectiveAprPercentByReserveId,
      effectiveLiquidityByReserveId,
      effectivePricesByReserveId,
    ],
  );

  const stats = useMemo<MarketStat[]>(() => {
    const key = selectedReserve?.reserveId.toString();
    const liquidity =
      key === undefined ? null : effectiveLiquidityByReserveId[key];
    const aprPercent =
      key === undefined ? null : effectiveAprPercentByReserveId[key];
    const priceUsd = key === undefined ? null : effectivePricesByReserveId[key];

    return [
      {
        label: COPY.marketData.stats.availableLiquidity,
        value: compactUsdLabel(liquidity?.availableLiquidity, priceUsd),
      },
      {
        label: COPY.marketData.stats.borrowApr,
        value:
          aprPercent == null
            ? COPY.common.emptyValue
            : formatAprPercent(aprPercent),
        tooltip: COPY.loans.borrowAprTooltip,
      },
      {
        label: COPY.marketData.stats.supplied,
        value: compactUsdLabel(liquidity?.suppliedLiquidity, priceUsd),
        tooltip: COPY.marketData.stats.suppliedTooltip,
      },
      {
        label: COPY.marketData.stats.totalBorrowed,
        value: compactUsdLabel(liquidity?.totalBorrowed, priceUsd),
      },
      {
        label: COPY.marketData.stats.marketUtilization,
        value:
          liquidity?.utilizationBps == null
            ? COPY.common.emptyValue
            : formatBasisPointsAsPercent(liquidity.utilizationBps),
      },
    ];
  }, [
    selectedReserve,
    effectiveAprPercentByReserveId,
    effectiveLiquidityByReserveId,
    effectivePricesByReserveId,
  ]);

  const collateralFactor =
    effectiveCollateralFactor === null
      ? COPY.common.emptyValue
      : formatBasisPointsAsPercent(effectiveCollateralFactor * BPS_SCALE);

  const centered = (message: string) => (
    <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="flex items-center justify-center py-12">
        <p className="text-accent-secondary">{message}</p>
      </div>
    </Container>
  );

  // Nothing below may render before the asset is proven — every figure on the
  // page is a claim about a specific market, and an unverified header is the
  // mislabeling F7 stops. Skipped under demo, where no verification ran.
  if (!isDemo) {
    if (identityError) {
      return (
        <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
          <ReserveIdentityBlock
            compromised={isIntegrityViolation}
            onRetry={() => void retryIdentity()}
          />
        </Container>
      );
    }
    if (identityLoading) return centered(COPY.common.loading);
    if (!identity) return centered(COPY.loans.reserveNotFound);
  } else if (!demoIdentity) {
    // Demo is on but the routed id matches no fixture.
    return centered(COPY.loans.reserveNotFound);
  }

  // The financial reads are separate from identity: without their own states a
  // failed batch RPC renders every cell as the empty placeholder on an
  // otherwise complete-looking page, indistinguishable from a metric that
  // genuinely has no value. Demo data bypasses them entirely.
  const marketDataError = isDemo
    ? null
    : (liquidityError ?? aprsError ?? pricesError);
  if (marketDataError) return centered(COPY.marketData.dataUnavailable);
  if (!isDemo && (liquidityLoading || aprsLoading || pricesLoading)) {
    return centered(COPY.common.loading);
  }

  return (
    <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="space-y-10">
        <div className="space-y-4">
          <button
            type="button"
            onClick={() =>
              // This URL is shareable: opened directly there is no in-app entry
              // to go back to, and history back would leave the app.
              location.key === "default"
                ? navigate(getAssetPickerRoute(LOAN_TAB.BORROW))
                : navigate(-1)
            }
            className="flex w-fit cursor-pointer items-center gap-2 text-base leading-[1.5] tracking-[0.15px] text-accent-secondary transition-colors hover:text-accent-primary"
          >
            <IoChevronBack size={16} aria-hidden />
            {COPY.marketData.backToAssets}
          </button>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <Avatar
                url={icon}
                alt={name}
                size="large"
                variant="circular"
                className="h-16 w-16 shrink-0 rounded-full bg-white"
              />
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <Heading
                    variant="h5"
                    as="h1"
                    className="font-normal text-accent-primary"
                  >
                    {name}
                  </Heading>
                  <span className="rounded-lg bg-secondary-strokeLight px-2 py-0.5 text-xs leading-[1.66] tracking-[0.4px] text-accent-secondary">
                    {symbol}
                  </span>
                </div>
                <Text variant="body1" className="text-accent-secondary">
                  {COPY.marketData.subtitle(symbol)}
                </Text>
              </div>
            </div>
            <button type="button" className={NEUTRAL_BUTTON_CLASS} disabled>
              {COPY.marketData.borrowAction}
            </button>
          </div>
        </div>

        <section data-testid="market-section-liquidity-stats">
          <MarketStatsBar stats={stats} />
        </section>

        <section
          className="space-y-6"
          data-testid="market-section-market-cards-list"
        >
          <CollateralInfoCard
            assetIcon={btcConfig.icon}
            assetName={COPY.marketData.collateral.assetName}
            collateralFactor={collateralFactor}
          />
          <div
            className={`${CHART_CARD_CLASS} ${BORROW_APR_CHART_HEIGHT_CLASS}`}
            data-testid="market-section-borrow-apr-chart"
          />
        </section>

        <section
          className="space-y-6"
          data-testid="market-section-borrow-market-header"
        >
          <SectionHeader
            title={COPY.marketData.interestRateModel.title}
            description={COPY.marketData.interestRateModel.description}
          />
          <div
            className={`${CHART_CARD_CLASS} ${INTEREST_RATE_MODEL_CHART_HEIGHT_CLASS}`}
          />
        </section>

        <section
          className="space-y-6"
          data-testid="market-section-borrow-markets-section"
        >
          <SectionHeader
            title={COPY.marketData.borrowMarkets.title}
            description={COPY.marketData.borrowMarkets.description(symbol)}
          />
          <BorrowMarketsTable rows={rows} />
        </section>
      </div>
    </Container>
  );
}
