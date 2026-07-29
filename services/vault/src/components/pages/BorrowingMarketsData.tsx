/**
 * Borrowing markets data page (v3, Figma node 10088-60956). Shell only —
 * section bodies are empty cards until the metrics, charts and markets table
 * land. Section ids mirror the Figma layer names under `Market Info`.
 */

import { Avatar, Container, Heading, Text } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { IoChevronBack } from "react-icons/io5";
import { useLocation, useNavigate, useParams } from "react-router";

import { ReserveIdentityBlock } from "@/applications/aave/components/ReserveIdentityBlock";
import { LOAN_TAB } from "@/applications/aave/constants";
import { useAaveConfig } from "@/applications/aave/context";
import { useVerifiedReserveIdentity } from "@/applications/aave/hooks";
import { NEUTRAL_BUTTON_CLASS } from "@/components/shared/buttonClasses";
import {
  CARD_SHELL_CLASS,
  PAGE_CONTENT_CLASS,
} from "@/components/shared/layoutClasses";
import featureFlags from "@/config/featureFlags";
import { COPY } from "@/copy";
import {
  getAssetPickerRoute,
  MARKET_RESERVE_PARAM,
  parseReserveId,
} from "@/routes";
import { getCurrencyIconWithFallback } from "@/services/token/tokenService";

const SECTION_BODY_CLASS = "min-h-[120px]";
const CHART_BODY_CLASS = "min-h-[240px]";

function Section({
  id,
  title,
  description,
  bodyClassName = SECTION_BODY_CLASS,
}: {
  id: string;
  title?: string;
  description?: string;
  bodyClassName?: string;
}) {
  return (
    <section className="w-full space-y-4" data-testid={`market-section-${id}`}>
      {title && (
        <div className="space-y-1">
          <Heading
            variant="h6"
            as="h2"
            className="font-normal text-accent-primary"
          >
            {title}
          </Heading>
          {description && (
            <Text variant="body2" className="text-accent-secondary">
              {description}
            </Text>
          )}
        </div>
      )}
      <div className={`${CARD_SHELL_CLASS} ${bodyClassName}`} />
    </section>
  );
}

export default function BorrowingMarketsData() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const { borrowableReserves } = useAaveConfig();

  // Resolve by the reserve's on-chain id, never by a token symbol from the URL:
  // the symbol is indexer-supplied, so labelling this page from it lets a
  // compromised indexer decide which market the user is reading (audit F7).
  // Exactly one match or none — `.find` would take whichever duplicate the
  // indexer ordered first.
  const selectedReserve = useMemo(() => {
    const target = parseReserveId(params[MARKET_RESERVE_PARAM]);
    if (target === null) return null;
    const matches = borrowableReserves.filter((r) => r.reserveId === target);
    return matches.length === 1 ? matches[0] : null;
  }, [borrowableReserves, params]);

  const {
    identity,
    isLoading: identityLoading,
    error: identityError,
    isIntegrityViolation,
    retry: retryIdentity,
  } = useVerifiedReserveIdentity({
    reserveId: selectedReserve?.reserveId,
    underlying: selectedReserve?.reserve.underlying,
  });

  const symbol = identity?.symbol ?? "";
  const name = identity?.name ?? symbol;
  const icon = getCurrencyIconWithFallback(identity?.icon, symbol);

  const backToAssets = () =>
    // This URL is shareable: opened directly there is no in-app entry to go
    // back to, and history back would leave the app.
    location.key === "default"
      ? navigate(
          getAssetPickerRoute(LOAN_TAB.BORROW, featureFlags.isV3UiEnabled),
        )
      : navigate(-1);

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

  // Nothing below may render before the asset is proven — the header is the
  // whole point of the page, and an unverified one is the mislabeling F7 stops.
  if (identityLoading) {
    return (
      <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
        <div className="flex items-center justify-center py-12">
          <p className="text-accent-secondary">{COPY.common.loading}</p>
        </div>
      </Container>
    );
  }

  if (!identity) {
    return (
      <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
        <div className="flex items-center justify-center py-12">
          <p className="text-accent-secondary">{COPY.loans.reserveNotFound}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="space-y-5">
        <button
          type="button"
          onClick={backToAssets}
          className="flex w-fit cursor-pointer items-center gap-1 text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary transition-colors hover:text-accent-primary"
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
              <Text variant="body2" className="text-accent-secondary">
                {COPY.marketData.subtitle(symbol)}
              </Text>
            </div>
          </div>
          <button type="button" className={NEUTRAL_BUTTON_CLASS} disabled>
            {COPY.marketData.borrowAction}
          </button>
        </div>

        <Section id="liquidity-stats" />
        <Section id="market-cards-list" />
        <Section id="borrow-apr-chart" bodyClassName={CHART_BODY_CLASS} />
        <Section
          id="borrow-market-header"
          title={COPY.marketData.interestRateModel.title}
          description={COPY.marketData.interestRateModel.description}
          bodyClassName={CHART_BODY_CLASS}
        />
        <Section
          id="borrow-markets-section"
          title={COPY.marketData.borrowMarkets.title}
          description={COPY.marketData.borrowMarkets.description(symbol)}
        />
      </div>
    </Container>
  );
}
