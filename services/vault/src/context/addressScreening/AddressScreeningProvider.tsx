import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { logger } from "@/infrastructure";
import {
  getAddressScreeningResult,
  removeAddressScreeningResult,
  setAddressScreeningResult,
} from "@/storage/addressScreeningStorage";

import {
  AddressScreeningNetworkError,
  verifyAddress,
} from "../../clients/address-screening";
import { useBTCWallet, useETHWallet } from "../wallet";

import type { AddressScreeningContextType } from "./types";

const AddressScreeningContext = createContext<AddressScreeningContextType>({
  isBlocked: false,
  isLoading: false,
});

/**
 * Checks whether an address is blocked, consulting the localStorage cache
 * first. Resolves to `true` when the address failed risk assessment or when
 * the screening API is unreachable (hard-block on error is intentional; the
 * result is not cached so a later retry can succeed).
 */
async function isAddressBlocked(address: string | undefined): Promise<boolean> {
  if (!address) return false;

  const cached = getAddressScreeningResult(address);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const allowed = await verifyAddress(address);
    const blocked = !allowed;
    setAddressScreeningResult(address, blocked);
    return blocked;
  } catch (error) {
    if (error instanceof AddressScreeningNetworkError) {
      logger.warn("Address screening network error — hard-blocking", {
        data: { address, error: error.message },
      });
    } else {
      logger.error(error instanceof Error ? error : new Error(String(error)), {
        data: { context: "Address screening unexpected error", address },
      });
    }
    return true;
  }
}

export function AddressScreeningProvider({ children }: PropsWithChildren) {
  const { address: btcAddress } = useBTCWallet();
  const { address: ethAddress } = useETHWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [btcBlocked, setBtcBlocked] = useState(false);
  const [ethBlocked, setEthBlocked] = useState(false);

  const prevBtcRef = useRef<string | undefined>(undefined);
  const prevEthRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Evict cache entries for addresses that just disconnected or changed,
    // per-wallet — BTC disconnect clears BTC only, ETH disconnect clears ETH only.
    if (prevBtcRef.current && prevBtcRef.current !== btcAddress) {
      removeAddressScreeningResult(prevBtcRef.current);
    }
    if (prevEthRef.current && prevEthRef.current !== ethAddress) {
      removeAddressScreeningResult(prevEthRef.current);
    }
    prevBtcRef.current = btcAddress;
    prevEthRef.current = ethAddress;

    if (!btcAddress && !ethAddress) {
      setBtcBlocked(false);
      setEthBlocked(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    // Clear previous results immediately so a stale "blocked" banner from
    // the prior wallet doesn't remain visible during re-screening.
    setBtcBlocked(false);
    setEthBlocked(false);
    setIsLoading(true);

    Promise.all([
      isAddressBlocked(btcAddress),
      isAddressBlocked(ethAddress),
    ]).then(([btcIsBlocked, ethIsBlocked]) => {
      if (cancelled) return;
      setBtcBlocked(btcIsBlocked);
      setEthBlocked(ethIsBlocked);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [btcAddress, ethAddress]);

  const value = useMemo<AddressScreeningContextType>(
    () => ({
      isBlocked: btcBlocked || ethBlocked,
      isLoading,
    }),
    [btcBlocked, ethBlocked, isLoading],
  );

  return (
    <AddressScreeningContext.Provider value={value}>
      {children}
    </AddressScreeningContext.Provider>
  );
}

export const useAddressScreening = () => useContext(AddressScreeningContext);
