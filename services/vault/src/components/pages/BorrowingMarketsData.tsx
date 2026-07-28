/**
 * Borrowing markets data page (v3, Figma node 10088-60956).
 *
 * Shell only: the route, the "Back to Assets" control, the asset header, and
 * one empty card per section of the design. Section bodies are placeholders —
 * the metrics, the two charts and the markets table land in a follow-up, so
 * this file deliberately reads no Aave data.
 *
 * Section ids mirror the Figma layer names under `Market Info` so the two can
 * be lined up when the bodies are filled in. Only "Interest rate model" and
 * "Borrow Markets" carry a visible title in the design; the first three blocks
 * are labelled by the asset header above them.
 */

import { Avatar, Container, Heading, Text } from "@babylonlabs-io/core-ui";
import { useMemo } from "react";
import { IoChevronBack } from "react-icons/io5";
import { useNavigate, useParams } from "react-router";

import { useAaveConfig } from "@/applications/aave/context";
import { NEUTRAL_BUTTON_CLASS } from "@/components/shared/buttonClasses";
import {
  CARD_SHELL_CLASS,
  PAGE_CONTENT_CLASS,
} from "@/components/shared/layoutClasses";
import { COPY } from "@/copy";
import { MARKET_SYMBOL_PARAM } from "@/routes";
import {
  getCurrencyIconWithFallback,
  getTokenByAddress,
} from "@/services/token/tokenService";

/** Placeholder height of a section body until its content lands. */
const SECTION_BODY_CLASS = "min-h-[120px]";
/** Placeholder height of the two chart sections, taller than a plain card. */
const CHART_BODY_CLASS = "min-h-[240px]";

function Section({
  id,
  title,
  description,
  bodyClassName = SECTION_BODY_CLASS,
}: {
  /** Figma layer name of this block, also the section's `data-testid`. */
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
  const params = useParams();
  const { borrowableReserves } = useAaveConfig();
  const symbol = (params[MARKET_SYMBOL_PARAM] ?? "").toUpperCase();

  // Identity only — name and logo for the header. The market figures this page
  // shows come later; this reads the already-loaded reserve config, no fetch.
  // The icon resolves from the symbol alone, so it still renders while the
  // config is loading or for a symbol that matches no reserve.
  const { name, icon } = useMemo(() => {
    const reserve = borrowableReserves.find(
      (r) => r.token.symbol.toUpperCase() === symbol,
    );
    return {
      name: reserve?.token.name ?? symbol,
      icon: getCurrencyIconWithFallback(
        reserve && getTokenByAddress(reserve.token.address)?.icon,
        symbol,
      ),
    };
  }, [borrowableReserves, symbol]);

  return (
    <Container className={`${PAGE_CONTENT_CLASS} pb-6`}>
      <div className="space-y-5">
        {/* History back rather than a fixed route: this page is reached from
            the borrow asset picker, whose open state is component-local, so
            navigating to `/loans` would land there with the picker shut. */}
        <button
          type="button"
          onClick={() => navigate(-1)}
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
          {/* Disabled until the follow-up wires it to the borrow overlay. */}
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
