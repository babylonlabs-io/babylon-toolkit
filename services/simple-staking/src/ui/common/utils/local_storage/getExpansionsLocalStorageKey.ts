import { network } from "@/ui/common/config/network/btc";

const EXPANSIONS_KEY = "bbn-staking-expansions";
const RENEWAL_DELEGATIONS_KEY = "bbn-staking-renewal-delegations";

// Safe no-op key to prevent potential issues with empty string
const NO_KEY = "__NO_KEY__";

// Get the local storage key for staking expansions
export const getExpansionsLocalStorageKey = (pk: string | undefined) => {
  return pk ? `${EXPANSIONS_KEY}-${network}-${pk}` : NO_KEY;
};

// Get the local storage key for staking renewals
export const getRenewalDelegationsLocalStorageKey = (
  pk: string | undefined,
) => {
  return pk ? `${RENEWAL_DELEGATIONS_KEY}-${network}-${pk}` : NO_KEY;
};
