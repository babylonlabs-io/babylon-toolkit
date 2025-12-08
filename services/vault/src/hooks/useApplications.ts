import { useQuery } from "@tanstack/react-query";

import { getAppIdByController, getEnabledAppIds } from "../applications";
import { fetchApplications } from "../services/applications";

export const APPLICATIONS_KEY = "applications";

export const useApplications = () => {
  const enabledAppIds = getEnabledAppIds();

  return useQuery({
    queryKey: [APPLICATIONS_KEY, enabledAppIds],
    queryFn: async () => {
      const allApps = await fetchApplications();

      return allApps.filter((app) => {
        const appId = getAppIdByController(app.id);
        return appId && enabledAppIds.includes(appId);
      });
    },
  });
};
