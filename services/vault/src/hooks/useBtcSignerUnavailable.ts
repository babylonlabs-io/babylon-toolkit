import { useIsTouchFirst } from "@babylonlabs-io/core-ui";
import { useWidgetState, type IWallet } from "@babylonlabs-io/wallet-connector";

export function hasUsableBtcSigner(wallets: readonly IWallet[]): boolean {
  return wallets.some((wallet) => wallet.installed && !wallet.hardware);
}

export function useBtcSignerUnavailable(): boolean {
  const isTouchFirst = useIsTouchFirst();
  const { chains } = useWidgetState();
  const btcChain = chains?.BTC;

  return (
    isTouchFirst &&
    btcChain !== undefined &&
    !hasUsableBtcSigner(btcChain.wallets)
  );
}
