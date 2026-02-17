import { useQuery } from "@tanstack/react-query";

import { getAppIdByController } from "../applications";
import { fetchApplications } from "../services/applications";

export const APPLICATIONS_KEY = "applications";

export const useApplications = () => {
  return useQuery({
    queryKey: [APPLICATIONS_KEY],
    queryFn: async () => {
      const allApps = await fetchApplications();

      return allApps.filter((app) => getAppIdByController(app.id));
    },
  });
};
