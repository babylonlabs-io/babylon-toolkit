import "./index.css";

/**
 * Bitcoin and Ethereum entry point.
 *
 * Resolves no Babylon-chain wallet and no Tomo Connect, so it carries none of
 * their Cosmos dependencies. Every symbol here keeps the name the package root
 * uses. Compared with the root, a consumer drops the Tomo props (`theme`,
 * `disableTomo`, `supportedWallets`), takes `BTCETHChainConfigArr` in place of
 * `ChainConfigArr`, and gets no `ExternalWallets`, `createExternalWallet` or
 * `COSMOS_KEYSTORE_CHANGE_EVENTS`.
 */

export { WalletProvider, type WalletProviderProps } from "@/components/BTCETHWalletConnectorProvider";
export { BTCWalletProvider, useBTCWallet } from "@/providers/BTCWalletProvider";
export type { BTCWalletLifecycleCallbacks, BTCWalletProviderProps } from "@/providers/BTCWalletProvider";
export { ETHWalletProvider, useETHWallet } from "@/providers/ETHWalletProvider";
export type { ETHWalletLifecycleCallbacks, ETHWalletProviderProps } from "@/providers/ETHWalletProvider";

export { createWalletConfig, type BTCETHChainConfigArr, type WalletConfigOptions } from "@/utils/btcEthConfigBuilder";

export { useAppKitBtcBridge } from "@/hooks/appkit/btc/useAppKitBtcBridge";
export { useAppKitOpenListener } from "@/hooks/appkit/useAppKitOpenListener";
export { useChainConnector } from "@/hooks/useChainConnector";
export { useVisibilityCheck } from "@/hooks/useVisibilityCheck";
export { useWalletConnect } from "@/hooks/useWalletConnect";
export { useWidgetState } from "@/hooks/useWidgetState";

export { useInscriptionProvider } from "@/context/Inscriptions.context";
export * from "@/context/State.context";

export * from "@/core/types";
export { type ETHTypedData } from "@/core/wallets/eth/appkit/types";

export {
  getSharedWagmiConfig,
  hasSharedWagmiConfig,
  setSharedWagmiConfig,
} from "@/core/wallets/eth/appkit/sharedConfig";

export { APPKIT_BTC_CONNECTOR_ID } from "@/core/wallets/btc/appkit";
export { APPKIT_ETH_CONNECTOR_ID } from "@/core/wallets/eth/appkit";
export { ETH_EMPTY_ACCOUNT_GRACE_MS } from "@/core/wallets/eth/appkit/provider";

export { initializeAppKitModal, type AppKitModalConfig } from "@/core/wallets/appkit/appKitModal";

export {
  getSharedBtcAppKitConfig,
  hasSharedBtcAppKitConfig,
  setSharedBtcAppKitConfig,
} from "@/core/wallets/btc/appkit/sharedConfig";

export {
  LOW_VALUE_UTXO_THRESHOLD,
  createInscriptionMap,
  filterDust,
  filterInscriptionUtxos,
  getSpendableUtxos,
  inscriptionOutpointKey,
  isInscriptionUtxo,
  type FilteredUtxos,
} from "@/utils/utxoFiltering";

export { toInscriptionIdentifiers, verifyUtxoOrdinals, type UtxoOrdinalInfo } from "@/api/ordinals";

export {
  ORDINALS_QUERY_KEY,
  OrdinalsClassifierUnavailableError,
  fetchOrdinals,
  getOrdinalsQueryKey,
  type FetchOrdinalsOptions,
} from "@/hooks/useOrdinals";

export { useOrdinals, type UseOrdinalsOptions, type UseOrdinalsResult } from "@/hooks/useOrdinalsHook";

export { WALLET_MODAL_OPEN_EVENT } from "@/constants/walletEvents";

export { ERROR_CODES, WalletError, isSharedSessionRefusal, isUserRejectionMessage } from "@/error";
