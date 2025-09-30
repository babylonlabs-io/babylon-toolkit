import { API_ENDPOINTS } from "../constants/endpoints";
import { CoStakingAPRResponse } from "../types/api/coStaking";

import { apiWrapper } from "./apiWrapper";

/**
 * Fetch APR data from the backend API
 * Returns APR values for BTC staking, BABY staking, Co-staking, and maximum APR
 */
export const getAPR = async (): Promise<CoStakingAPRResponse> => {
  const { data } = await apiWrapper<CoStakingAPRResponse>(
    "GET",
    API_ENDPOINTS.APR,
    "Error fetching APR data",
  );

  return data;
};
