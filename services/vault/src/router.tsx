import { Route, Routes } from "react-router";

import { getAllApplications } from "./applications";
import Activity from "./components/pages/Activity";
import ApplicationsHome from "./components/pages/ApplicationsHome";
import RootLayout from "./components/pages/RootLayout";
import NotFound from "./components/pages/not-found";

export const Router = () => {
  const apps = getAllApplications();

  return (
    <Routes>
      <Route path="/" element={<RootLayout />}>
        <Route index element={<ApplicationsHome />} />
        <Route path="activity" element={<Activity />} />
        <Route path="deposit" element={<ApplicationsHome />} />

        {apps.map((app) => (
          <Route
            key={app.metadata.id}
            path={`app/${app.metadata.id}/*`}
            element={<app.Routes />}
          />
        ))}
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
