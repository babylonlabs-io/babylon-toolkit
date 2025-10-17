import { DEFAULT_MAX_FINALITY_PROVIDERS } from "@/ui/common/constants";

/**
 * Hook to get the maximum number of finality providers allowed.
 *
 * @returns The maximum number of finality providers allowed
 */
export function useMaxFinalityProviders(): number {
  return DEFAULT_MAX_FINALITY_PROVIDERS;
}
