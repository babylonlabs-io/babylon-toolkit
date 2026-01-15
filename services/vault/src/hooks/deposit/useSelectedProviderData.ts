/**
 * useSelectedProviderData Hook
 * Extracts BTC public keys from selected providers, vault keepers, and universal challengers
 */

import { useMemo } from "react";

import type {
  UniversalChallenger,
  VaultKeeper,
  VaultProvider,
} from "../../types/vaultProvider";

export interface UseSelectedProviderDataParams {
  selectedProviders: string[];
  vaultProviders: VaultProvider[];
  vaultKeepers: VaultKeeper[];
  universalChallengers: UniversalChallenger[];
}

export interface UseSelectedProviderDataReturn {
  selectedProviderBtcPubkey: string;
  vaultKeeperBtcPubkeys: string[];
  universalChallengerBtcPubkeys: string[];
}

export function useSelectedProviderData(
  params: UseSelectedProviderDataParams,
): UseSelectedProviderDataReturn {
  const {
    selectedProviders,
    vaultProviders,
    vaultKeepers,
    universalChallengers,
  } = params;

  return useMemo(() => {
    if (
      selectedProviders.length === 0 ||
      vaultProviders.length === 0 ||
      vaultKeepers.length === 0 ||
      universalChallengers.length === 0
    ) {
      return {
        selectedProviderBtcPubkey: "",
        vaultKeeperBtcPubkeys: [],
        universalChallengerBtcPubkeys: [],
      };
    }

    const selectedProvider = vaultProviders.find(
      (p) => p.id.toLowerCase() === selectedProviders[0].toLowerCase(),
    );

    if (!selectedProvider) {
      return {
        selectedProviderBtcPubkey: "",
        vaultKeeperBtcPubkeys: [],
        universalChallengerBtcPubkeys: [],
      };
    }

    return {
      selectedProviderBtcPubkey: selectedProvider.btcPubKey || "",
      vaultKeeperBtcPubkeys: vaultKeepers.map((vk) => vk.btcPubKey),
      universalChallengerBtcPubkeys: universalChallengers.map(
        (uc) => uc.btcPubKey,
      ),
    };
  }, [selectedProviders, vaultProviders, vaultKeepers, universalChallengers]);
}
