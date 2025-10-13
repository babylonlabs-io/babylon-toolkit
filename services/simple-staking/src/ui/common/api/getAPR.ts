import { API_ENDPOINTS } from "../constants/endpoints";
import { PersonalizedAPRResponse } from "../types/api/coStaking";

import { apiWrapper } from "./apiWrapper";

/**
 * Fetch personalized APR data from backend based on user's total staked amounts
 * @param btcStakedSat - Total BTC in satoshis (confirmed + pending)
 * @param babyStakedUbbn - Total BABY in ubbn (confirmed + pending)
 * @returns Personalized APR data including current, boost, and additional BABY needed
 * @throws Error if stake amounts are invalid (negative or not finite)
 */
export const getPersonalizedAPR = async (
  btcStakedSat: number,
  babyStakedUbbn: number,
): Promise<PersonalizedAPRResponse["data"]> => {
  // Validate input parameters
  if (btcStakedSat < 0 || !isFinite(btcStakedSat)) {
    throw new Error(
      `Invalid BTC stake amount: ${btcStakedSat}. Must be non-negative and finite.`,
    );
  }

  if (babyStakedUbbn < 0 || !isFinite(babyStakedUbbn)) {
    throw new Error(
      `Invalid BABY stake amount: ${babyStakedUbbn}. Must be non-negative and finite.`,
    );
  }

  const params = new URLSearchParams({
    btc_staked: btcStakedSat.toString(),
    baby_staked: babyStakedUbbn.toString(),
  });

  const { data } = await apiWrapper<PersonalizedAPRResponse>(
    "GET",
    `${API_ENDPOINTS.APR}?${params.toString()}`,
    "Error fetching personalized APR data",
  );

  return data.data;
};
