/**
 * useSelectedProviderData Hook
 * Extracts BTC public keys and liquidator data from selected providers
 */

import { useMemo } from "react";

import type { VaultProvider } from "../../../../types/vaultProvider";

export interface UseSelectedProviderDataParams {
  selectedProviders: string[];
  providers: VaultProvider[];
}

export interface UseSelectedProviderDataReturn {
  selectedProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
}

export function useSelectedProviderData(
  params: UseSelectedProviderDataParams,
): UseSelectedProviderDataReturn {
  const { selectedProviders, providers } = params;

  return useMemo(() => {
    if (selectedProviders.length === 0 || providers.length === 0) {
      return {
        selectedProviderBtcPubkey: "",
        liquidatorBtcPubkeys: [],
      };
    }

    const selectedProvider = providers.find(
      (p) => p.id.toLowerCase() === selectedProviders[0].toLowerCase(),
    );

    if (!selectedProvider) {
      return {
        selectedProviderBtcPubkey: "",
        liquidatorBtcPubkeys: [],
      };
    }

    const liquidators =
      selectedProvider.liquidators?.map((liq) => liq.btc_pub_key) || [];

    return {
      selectedProviderBtcPubkey: selectedProvider.btc_pub_key || "",
      liquidatorBtcPubkeys: liquidators,
    };
  }, [selectedProviders, providers]);
}
