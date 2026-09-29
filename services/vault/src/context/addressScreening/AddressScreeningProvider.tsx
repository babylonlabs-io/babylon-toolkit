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
  isUnavailable: false,
  isLoading: false,
});

type ScreeningOutcome = "allowed" | "ineligible" | "unavailable";

/**
 * Screens an address, consulting the localStorage cache first. Resolves to
 * "ineligible" when the address failed risk assessment, and to "unavailable"
 * when the screening API is unreachable (hard-block on error is intentional;
 * the result is not cached so a later retry can succeed).
 */
async function screenAddress(
  address: string | undefined,
): Promise<ScreeningOutcome> {
  if (!address) return "allowed";

  const cached = getAddressScreeningResult(address);
  if (cached !== undefined) {
    return cached ? "ineligible" : "allowed";
  }

  try {
    const allowed = await verifyAddress(address);
    setAddressScreeningResult(address, !allowed);
    return allowed ? "allowed" : "ineligible";
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
    return "unavailable";
  }
}

export function AddressScreeningProvider({ children }: PropsWithChildren) {
  const { address: btcAddress } = useBTCWallet();
  const { address: ethAddress } = useETHWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [btcOutcome, setBtcOutcome] = useState<ScreeningOutcome>("allowed");
  const [ethOutcome, setEthOutcome] = useState<ScreeningOutcome>("allowed");

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
      setBtcOutcome("allowed");
      setEthOutcome("allowed");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    // Clear previous results immediately so a stale "blocked" banner from
    // the prior wallet doesn't remain visible during re-screening.
    setBtcOutcome("allowed");
    setEthOutcome("allowed");
    setIsLoading(true);

    Promise.all([screenAddress(btcAddress), screenAddress(ethAddress)]).then(
      ([btcResult, ethResult]) => {
        if (cancelled) return;
        setBtcOutcome(btcResult);
        setEthOutcome(ethResult);
        setIsLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [btcAddress, ethAddress]);

  const value = useMemo<AddressScreeningContextType>(() => {
    const outcomes = [btcOutcome, ethOutcome];
    const isIneligible = outcomes.includes("ineligible");
    return {
      isBlocked: isIneligible || outcomes.includes("unavailable"),
      // A definitive "ineligible" result takes precedence over a failed check.
      isUnavailable: !isIneligible && outcomes.includes("unavailable"),
      isLoading,
    };
  }, [btcOutcome, ethOutcome, isLoading]);

  return (
    <AddressScreeningContext.Provider value={value}>
      {children}
    </AddressScreeningContext.Provider>
  );
}

export const useAddressScreening = () => useContext(AddressScreeningContext);
