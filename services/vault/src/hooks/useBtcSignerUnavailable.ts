import { useWidgetState, type IWallet } from "@babylonlabs-io/wallet-connector";
import { useEffect, useState } from "react";

import featureFlags from "@/config/featureFlags";

const TOUCH_FIRST_QUERY = "(pointer: coarse) and (hover: none)";

const supportsMatchMedia = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

export function isTouchFirstNow(): boolean {
  return supportsMatchMedia() && window.matchMedia(TOUCH_FIRST_QUERY).matches;
}

export function hasUsableBtcSigner(wallets: readonly IWallet[]): boolean {
  return wallets.some((wallet) => wallet.installed && !wallet.hardware);
}

function useIsTouchFirst(): boolean {
  const [touchFirst, setTouchFirst] = useState(isTouchFirstNow);

  useEffect(() => {
    if (!supportsMatchMedia()) return;

    const mql = window.matchMedia(TOUCH_FIRST_QUERY);
    const onChange = () => setTouchFirst(mql.matches);

    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return touchFirst;
}

export function useBtcSignerUnavailable(): boolean {
  const isTouchFirst = useIsTouchFirst();
  const { chains } = useWidgetState();
  const btcChain = chains?.BTC;

  return (
    featureFlags.isMobileEnabled &&
    isTouchFirst &&
    btcChain !== undefined &&
    !hasUsableBtcSigner(btcChain.wallets)
  );
}
