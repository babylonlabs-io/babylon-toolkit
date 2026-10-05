import { useIsTouchFirst } from "@babylonlabs-io/core-ui";
import { useWidgetState, type IWallet } from "@babylonlabs-io/wallet-connector";

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
