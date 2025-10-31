import { Container } from "@babylonlabs-io/core-ui";
import { Route, Routes } from "react-router";

import { MarketDetail as MarketDetailPage } from "./components/Market/Detail";
import { Overview } from "./components/Overview";
import { PositionDetailPage } from "./components/Position/Detail";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";
import { VaultStats } from "./components/shared/VaultStats";

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route
          index
          element={
            <Container
              as="main"
              className="mx-auto flex max-w-[1104px] flex-1 flex-col gap-6 px-4 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0"
            >
              <VaultStats />
              <Overview />
            </Container>
          }
        />
        <Route path="market/:marketId" element={<MarketDetailPage />} />
        <Route path="position/:positionId" element={<PositionDetailPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
