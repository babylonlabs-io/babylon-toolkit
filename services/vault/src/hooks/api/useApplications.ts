import { useQuery } from "@tanstack/react-query";

import { fetchApplications } from "../../services/applications";

export const APPLICATIONS_KEY = "applications";

/**
 * React hook to fetch the list of registered applications.
 * Uses fetchApplications service under the hood.
 *
 * @returns React Query result with application items array
 */
export const useApplications = () => {
  return useQuery({
    queryKey: [APPLICATIONS_KEY],
    queryFn: fetchApplications,
  });
};
