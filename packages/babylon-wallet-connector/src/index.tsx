import "./index.css";

export { ExternalWallets } from "@/components/ExternalWallets";
export { WalletProvider } from "@/components/WalletProvider";
export { createWalletConfig } from "@/utils/configBuilder";
export type { WalletConfigOptions } from "@/utils/configBuilder";

export * from "@/providers";

export { useChainConnector } from "@/hooks/useChainConnector";
export { useWalletConnect } from "@/hooks/useWalletConnect";
export { useWidgetState } from "@/hooks/useWidgetState";
export { useAppKitBridge } from "@/hooks/useAppKitBridge";
export { useAppKitOpenListener } from "@/hooks/useAppKitOpenListener";
export { useAppKitBtcBridge } from "@/hooks/useAppKitBtcBridge";
export { useAppKitBtcOpenListener } from "@/hooks/useAppKitBtcOpenListener";

export { type ChainConfigArr } from "@/context/Chain.context";
export { useInscriptionProvider } from "@/context/Inscriptions.context";
export * from "@/context/State.context";

export { createExternalWallet } from "@/core";
export * from "@/core/types";
export { type ETHTypedData } from "@/core/wallets/eth/appkit/types";

// Export AppKit shared config helpers
export { setSharedWagmiConfig, getSharedWagmiConfig, hasSharedWagmiConfig } from "@/core/wallets/eth/appkit/sharedConfig";

// Export ETH AppKit modal utilities
export {
    initializeAppKitModal,
    getAppKitModal,
    getAppKitWagmiConfig,
    hasAppKitModal,
    openAppKitModal,
    closeAppKitModal,
    type AppKitModalConfig,
} from "@/core/wallets/eth/appkit/appKitModal";

// Export BTC AppKit modal utilities
export {
    initializeAppKitBtcModal,
    getAppKitBtcModal,
    getBitcoinAdapter,
    hasAppKitBtcModal,
    openAppKitBtcModal,
    closeAppKitBtcModal,
    type AppKitBtcModalConfig,
} from "@/core/wallets/btc/appkit/appKitBtcModal";

// Export BTC AppKit shared config helpers
export {
    setSharedBtcAppKitConfig,
    getSharedBtcAppKitConfig,
    hasSharedBtcAppKitConfig,
} from "@/core/wallets/btc/appkit/sharedConfig";

// Re-export wagmi hooks to ensure single instance across all consumers
export * from "@/wagmiExports";
