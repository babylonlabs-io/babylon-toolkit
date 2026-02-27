import { Route, Routes } from "react-router";

import { AAVE_APP_ID } from "./applications/aave/config";
import {
  AaveConfigProvider,
  PendingVaultsProvider,
} from "./applications/aave/context";
import Activity from "./components/pages/Activity";
import FAQs from "./components/pages/FAQs";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";
import { DashboardPage } from "./components/simple/DashboardPage";

const DashboardWithProviders = () => (
  <AaveConfigProvider>
    <PendingVaultsProvider appId={AAVE_APP_ID}>
      <DashboardPage />
    </PendingVaultsProvider>
  </AaveConfigProvider>
);

export const Router = () => (
  <Routes>
    <Route path="/" element={<RootLayout />}>
      <Route index element={<DashboardWithProviders />} />
      <Route path="activity" element={<Activity />} />
      <Route path="faqs" element={<FAQs />} />
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes>
);
