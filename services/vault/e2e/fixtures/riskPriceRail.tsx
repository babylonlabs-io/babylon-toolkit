import "@/config/env";
import { Container } from "@babylonlabs-io/core-ui";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { RiskSection } from "@/components/simple/RiskSection";
import {
  DEBUG_HEALTH_FACTORS,
  makeDefaultDebugParams,
} from "@/dev/debugPositionStore";
import "@/globals.css";
import Providers from "@/providers";
import { Router } from "@/router";
import {
  formatBasisPointsAsPercent,
  formatLiquidationDistancePercent,
  formatUsdPrice,
} from "@/utils/formatting";

const params = makeDefaultDebugParams();
const healthFactor = DEBUG_HEALTH_FACTORS.find(
  (choice) => choice.label === "Warning",
)!.value;
const liquidationPrice = params.btcPrice / healthFactor;

createRoot(document.getElementById("root")!).render(
  <MemoryRouter initialEntries={["/"]}>
    <Providers>
      <Router />
      <section
        data-testid="risk-visual-fixture"
        className="fixed inset-x-0 bottom-0 top-20 z-50 overflow-auto bg-surface px-4 py-6 md:left-60 md:px-8"
      >
        <Container>
          <RiskSection
            healthFactor={healthFactor}
            healthFactorStatus="warning"
            hasPosition
            isPositionUnavailable={false}
            liquidationPriceText={formatUsdPrice(liquidationPrice)}
            btcPriceText={formatUsdPrice(params.btcPrice)}
            pctToLiquidationText={formatLiquidationDistancePercent(
              100 * (1 - 1 / healthFactor),
            )}
            collateralFactorText={formatBasisPointsAsPercent(
              Math.round(params.CF * 10000),
            )}
            collateralFactorLoading={false}
            btcPriceUsd={params.btcPrice}
            liquidationPriceUsd={liquidationPrice}
          />
        </Container>
      </section>
    </Providers>
  </MemoryRouter>,
);
