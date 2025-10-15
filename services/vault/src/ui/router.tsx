import { VaultLayout } from "@routes/vault";
import { Route, Routes } from "react-router";

import Layout from "./common/layout";
import NotFound from "./common/not-found";

export const Router = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<VaultLayout />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
