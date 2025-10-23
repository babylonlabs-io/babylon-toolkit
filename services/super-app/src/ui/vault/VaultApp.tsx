import { Route, Routes } from "react-router";
import { VaultLayout } from "@services/vault/ui/vault/VaultLayout";
import { MarketDetail as MarketDetailPage } from "@services/vault/ui/vault/components/MarketDetail";

export const VaultApp = () => {
    return (
        <Routes>
            <Route index element={<VaultLayout />} />
            <Route path="market/:marketId" element={<MarketDetailPage />} />
        </Routes>
    );
};

