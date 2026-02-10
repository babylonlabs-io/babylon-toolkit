import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from "react";

import { useBTCWallet } from "@/context/wallet";

import type { AddressTypeContextType } from "./types";

const AddressTypeContext = createContext<AddressTypeContextType>({
  isSupportedAddress: true,
  isCheckingAddress: false,
});

/**
 * Checks if a BTC address is a Taproot (P2TR) address.
 * Taproot addresses start with bc1p (mainnet) or tb1p (testnet/signet).
 * Bech32/Bech32m addresses are case-insensitive per spec, so we normalize to lowercase.
 */
function isTaprootAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase();
  return normalized.startsWith("bc1p") || normalized.startsWith("tb1p");
}

export function AddressTypeProvider({ children }: PropsWithChildren) {
  const { connected, address } = useBTCWallet();

  const value = useMemo<AddressTypeContextType>(() => {
    // If not connected, we consider it supported (no restriction yet)
    if (!connected || !address) {
      return {
        isSupportedAddress: true,
        isCheckingAddress: false,
      };
    }

    // Check if the connected address is Taproot
    const isTaproot = isTaprootAddress(address);

    return {
      isSupportedAddress: isTaproot,
      isCheckingAddress: false,
    };
  }, [connected, address]);

  return (
    <AddressTypeContext.Provider value={value}>
      {children}
    </AddressTypeContext.Provider>
  );
}

export const useAddressType = () => useContext(AddressTypeContext);
