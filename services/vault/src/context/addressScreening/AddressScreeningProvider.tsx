import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import { logger } from "@/infrastructure";
import {
  getAddressScreeningResult,
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
 * Screens an address, consulting the localStorage cache first.
 * Resolves to `true` when the address is blocked (failed risk assessment).
 *
 * TODO FOR REVIEW: network-error policy is hard-block (returns `true` on any
 * utils-api failure). Confirm this is the desired behavior — alternative is
 * soft-allow to avoid locking users out on transient outages.
 */
async function screen(address: string): Promise<boolean> {
  const cached = getAddressScreeningResult(address);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const allowed = await verifyAddress(address);
    const failed = !allowed;
    setAddressScreeningResult(address, failed);
    return failed;
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
    // Hard-block on any failure. Not cached so a later retry can succeed.
    return true;
  }
}

export function AddressScreeningProvider({ children }: PropsWithChildren) {
  const { address: btcAddress } = useBTCWallet();
  const { address: ethAddress } = useETHWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [btcBlocked, setBtcBlocked] = useState(false);
  const [ethBlocked, setEthBlocked] = useState(false);

  useEffect(() => {
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
      btcAddress ? screen(btcAddress) : Promise.resolve(false),
      ethAddress ? screen(ethAddress) : Promise.resolve(false),
    ]).then(([btcFailed, ethFailed]) => {
      if (cancelled) return;
      setBtcBlocked(btcFailed);
      setEthBlocked(ethFailed);
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
