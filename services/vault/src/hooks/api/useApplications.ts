import { useQuery } from "@tanstack/react-query";

import { fetchApplications } from "../../services/applications";

export const APPLICATIONS_KEY = "applications";

export const useApplications = () => {
  return useQuery({
    queryKey: [APPLICATIONS_KEY],
    queryFn: fetchApplications,
  });
};
