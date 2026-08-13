import "./index.css";

export {
  ETHWalletConnectorProvider,
  ETHWalletConnectorProvider as WalletProvider,
  type ETHWalletConnectorProviderProps,
} from "@/components/ETHWalletConnectorProvider";
export { ETHWalletProvider, useETHWallet } from "@/providers/ETHWalletProvider";
export type { ETHWalletLifecycleCallbacks, ETHWalletProviderProps } from "@/providers/ETHWalletProvider";

export {
  createETHWalletConfig,
  createETHWalletConfig as createWalletConfig,
  type ETHChainConfigArr,
  type ETHWalletConfigOptions,
} from "@/utils/ethConfigBuilder";

export { useChainConnector } from "@/hooks/useChainConnector";
export { useVisibilityCheck } from "@/hooks/useVisibilityCheck";
export { useWalletConnect } from "@/hooks/useWalletConnect";
export { useWidgetState } from "@/hooks/useWidgetState";

export { APPKIT_ETH_CONNECTOR_ID } from "@/core/wallets/appkit/constants";
export {
  initializeETHAppKitModal as initializeAppKitModal,
  initializeETHAppKitModal,
  type ETHAppKitModalConfig as AppKitModalConfig,
  type ETHAppKitModalConfig,
} from "@/core/wallets/eth/appkit/modal";
export {
  getSharedWagmiConfig,
  hasSharedWagmiConfig,
  setSharedWagmiConfig,
} from "@/core/wallets/eth/appkit/sharedConfig";

export type {
  LifeCycleHooksProps,
  TermsOfServiceParams,
  WalletLifecycleConnection,
} from "@/context/LifecycleHooks.context";
export type {
  Account,
  ChainId,
  ETHConfig,
  ETHTransactionRequest,
  ETHTypedData,
  IETHProvider,
  IProvider,
  IWallet,
  NetworkInfo,
  ProgressReporter,
} from "@/core/types";
export { ERROR_CODES, WalletError, isUserRejectionMessage } from "@/error";
