import { Container } from "@babylonlabs-io/core-ui";
import { Route, Routes } from "react-router";

import { MarketDetail as MarketDetailPage } from "./components/Market/Detail";
import { Overview } from "./components/Overview";
import { VaultStats } from "./components/Overview/VaultStats";
import ApplicationsHome from "./components/pages/ApplicationsHome";
import Deposit from "./components/pages/Deposit";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route index element={<ApplicationsHome />} />
        <Route path="deposit" element={<Deposit />} />
        <Route
          path="vault"
          element={
            <Container
              as="main"
              className="mx-auto flex flex-1 flex-col gap-6 px-4 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0"
            >
              <VaultStats />
              <Overview />
            </Container>
          }
        />
        <Route path="market/:marketId" element={<MarketDetailPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
