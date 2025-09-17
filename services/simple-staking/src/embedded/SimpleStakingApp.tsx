import { Route, Routes, useLocation } from "react-router";
import { useEffect } from "react";

import { BabyLayout } from "@/ui/baby/layout";
import { BTCStaking } from "@/ui/common/page";
import NotFound from "@/ui/common/not-found";
import "@/ui/globals.css";

export function SimpleStakingApp() {
  const location = useLocation();
  useEffect(() => {
    document.title = "Babylon - Staking Dashboard";
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="btc" element={<BTCStaking />} />
      <Route path="baby" element={<BabyLayout />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
