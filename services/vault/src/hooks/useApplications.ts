import { useQuery } from "@tanstack/react-query";

// TODO: REMOVE - unused import while testing mnemonic flow
// import { getAppIdByController, getEnabledAppIds } from "../applications";
import { getEnabledAppIds } from "../applications";
import { fetchApplications } from "../services/applications";

export const APPLICATIONS_KEY = "applications";

export const useApplications = () => {
  const enabledAppIds = getEnabledAppIds();

  return useQuery({
    queryKey: [APPLICATIONS_KEY, enabledAppIds],
    queryFn: async () => {
      const allApps = await fetchApplications();

      // TODO: REMOVE - bypass filter for testing mnemonic flow
      return allApps;
    },
  });
};
