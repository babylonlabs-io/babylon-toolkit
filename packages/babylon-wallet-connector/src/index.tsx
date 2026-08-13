import "./index.css";

export { ExternalWallets } from "@/components/ExternalWallets";
export { WalletProvider, type WalletProviderProps } from "@/components/WalletProvider";
export { createWalletConfig } from "@/utils/configBuilder";
export type { WalletConfigOptions } from "@/utils/configBuilder";

export * from "@/providers";

export { useAppKitBtcBridge } from "@/hooks/appkit/btc/useAppKitBtcBridge";
export { useAppKitOpenListener } from "@/hooks/appkit/useAppKitOpenListener";
export { useChainConnector } from "@/hooks/useChainConnector";
export { useVisibilityCheck } from "@/hooks/useVisibilityCheck";
export { useWalletConnect } from "@/hooks/useWalletConnect";
export { useWidgetState } from "@/hooks/useWidgetState";

export { type ChainConfigArr } from "@/context/Chain.context";
export { useInscriptionProvider } from "@/context/Inscriptions.context";
export type {
  LifeCycleHooksProps,
  TermsOfServiceParams,
  WalletLifecycleConnection,
} from "@/context/LifecycleHooks.context";
export * from "@/context/State.context";

export { createExternalWallet } from "@/core";
export * from "@/core/types";
export { type ETHTypedData } from "@/core/wallets/eth/appkit/types";

// Export AppKit shared config helpers
export {
  getSharedWagmiConfig,
  hasSharedWagmiConfig,
  setSharedWagmiConfig,
} from "@/core/wallets/eth/appkit/sharedConfig";

// Export AppKit connector IDs
export { APPKIT_BTC_CONNECTOR_ID } from "@/core/wallets/btc/appkit";
export { APPKIT_ETH_CONNECTOR_ID } from "@/core/wallets/eth/appkit";

// Export unified AppKit modal utilities (supports both ETH and BTC)
export { initializeAppKitModal, type AppKitModalConfig } from "@/core/wallets/appkit/appKitModal";

// Export BTC AppKit shared config helpers
export {
  getSharedBtcAppKitConfig,
  hasSharedBtcAppKitConfig,
  setSharedBtcAppKitConfig,
} from "@/core/wallets/btc/appkit/sharedConfig";

// Export UTXO filtering utilities
export {
  LOW_VALUE_UTXO_THRESHOLD,
  createInscriptionMap,
  filterDust,
  filterInscriptionUtxos,
  getSpendableUtxos,
  isInscriptionUtxo,
  type FilteredUtxos,
} from "@/utils/utxoFiltering";

// Export ordinals API and hook utilities
export { toInscriptionIdentifiers, verifyUtxoOrdinals, type UtxoOrdinalInfo } from "@/api/ordinals";

export {
  ORDINALS_QUERY_KEY,
  OrdinalsClassifierUnavailableError,
  fetchOrdinals,
  getOrdinalsQueryKey,
  type FetchOrdinalsOptions,
} from "@/hooks/useOrdinals";

// Export React hooks for ordinals
export { useOrdinals, type UseOrdinalsOptions, type UseOrdinalsResult } from "@/hooks/useOrdinalsHook";

// Export wallet event constants
export { COSMOS_KEYSTORE_CHANGE_EVENTS } from "@/constants/walletEvents";

// Export error types so consumers can match on typed error codes
export { ERROR_CODES, WalletError, isUserRejectionMessage } from "@/error";
