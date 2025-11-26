/**
 * useSelectedProviderData Hook
 * Extracts BTC public keys and liquidator data from selected providers
 */

import { useMemo } from "react";

import type {
  Liquidator,
  VaultProvider,
} from "../../../../types/vaultProvider";

export interface UseSelectedProviderDataParams {
  selectedProviders: string[];
  vaultProviders: VaultProvider[];
  liquidators: Liquidator[];
}

export interface UseSelectedProviderDataReturn {
  selectedProviderBtcPubkey: string;
  liquidatorBtcPubkeys: string[];
}

export function useSelectedProviderData(
  params: UseSelectedProviderDataParams,
): UseSelectedProviderDataReturn {
  const { selectedProviders, vaultProviders, liquidators } = params;

  return useMemo(() => {
    if (
      selectedProviders.length === 0 ||
      vaultProviders.length === 0 ||
      liquidators.length === 0
    ) {
      return {
        selectedProviderBtcPubkey: "",
        liquidatorBtcPubkeys: [],
      };
    }

    const selectedProvider = vaultProviders.find(
      (p) => p.id.toLowerCase() === selectedProviders[0].toLowerCase(),
    );

    if (!selectedProvider) {
      return {
        selectedProviderBtcPubkey: "",
        liquidatorBtcPubkeys: [],
      };
    }

    return {
      selectedProviderBtcPubkey: selectedProvider.btcPubKey || "",
      liquidatorBtcPubkeys: liquidators.map((liq) => liq.btcPubKey),
    };
  }, [selectedProviders, vaultProviders, liquidators]);
}
