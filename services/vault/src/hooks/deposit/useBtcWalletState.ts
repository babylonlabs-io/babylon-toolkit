import { useChainConnector } from "@babylonlabs-io/wallet-connector";

import { useUTXOs } from "@/hooks/useUTXOs";

export function useBtcWalletState() {
  const btcConnector = useChainConnector("BTC");
  const btcAddress = btcConnector?.connectedWallet?.account?.address;
  const {
    spendableUTXOs,
    isLoading: isUTXOsLoading,
    error: utxoError,
  } = useUTXOs(btcAddress);

  return { btcAddress, spendableUTXOs, isUTXOsLoading, utxoError };
}
