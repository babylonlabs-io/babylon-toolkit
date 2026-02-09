import "./index.css";

export { ExternalWallets } from "@/components/ExternalWallets";
export { WalletProvider } from "@/components/WalletProvider";
export { createWalletConfig } from "@/utils/configBuilder";
export type { WalletConfigOptions } from "@/utils/configBuilder";

export * from "@/providers";

export { useChainConnector } from "@/hooks/useChainConnector";
export { useVisibilityCheck } from "@/hooks/useVisibilityCheck";
export { useWalletConnect } from "@/hooks/useWalletConnect";
export { useWidgetState } from "@/hooks/useWidgetState";
export { useAppKitBtcBridge } from "@/hooks/appkit/btc/useAppKitBtcBridge";
export { useAppKitOpenListener } from "@/hooks/appkit/useAppKitOpenListener";

export { type ChainConfigArr } from "@/context/Chain.context";
export { useInscriptionProvider } from "@/context/Inscriptions.context";
export * from "@/context/State.context";

export { createExternalWallet } from "@/core";
export * from "@/core/types";
export { type ETHTypedData } from "@/core/wallets/eth/appkit/types";

// Export AppKit shared config helpers
export { setSharedWagmiConfig, getSharedWagmiConfig, hasSharedWagmiConfig } from "@/core/wallets/eth/appkit/sharedConfig";

// Export AppKit connector IDs
export { APPKIT_ETH_CONNECTOR_ID } from "@/core/wallets/eth/appkit";
export { APPKIT_BTC_CONNECTOR_ID } from "@/core/wallets/btc/appkit";

// Export unified AppKit modal utilities (supports both ETH and BTC)
export {
    initializeAppKitModal,
    type AppKitModalConfig,
} from "@/core/wallets/appkit/appKitModal";

// Export BTC AppKit shared config helpers
export {
    setSharedBtcAppKitConfig,
    getSharedBtcAppKitConfig,
    hasSharedBtcAppKitConfig,
} from "@/core/wallets/btc/appkit/sharedConfig";

// Export UTXO filtering utilities
export {
    filterDust,
    filterInscriptionUtxos,
    getSpendableUtxos,
    createInscriptionMap,
    isInscriptionUtxo,
    LOW_VALUE_UTXO_THRESHOLD,
    type FilteredUtxos,
} from "@/utils/utxoFiltering";

// Export ordinals API and hook utilities
export {
    verifyUtxoOrdinals,
    toInscriptionIdentifiers,
    type UtxoOrdinalInfo,
} from "@/api/ordinals";

export {
    fetchOrdinals,
    getOrdinalsQueryKey,
    ORDINALS_QUERY_KEY,
    type FetchOrdinalsOptions,
} from "@/hooks/useOrdinals";

// Export React hooks for ordinals
export {
    useOrdinals,
    type UseOrdinalsOptions,
    type UseOrdinalsResult,
} from "@/hooks/useOrdinalsHook";

// Export wallet event constants
export { COSMOS_KEYSTORE_CHANGE_EVENTS } from "@/constants/walletEvents";
