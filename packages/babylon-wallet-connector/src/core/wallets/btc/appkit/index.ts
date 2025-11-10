import type { BTCConfig, IBTCProvider, WalletMetadata } from "@/core/types";
import { Network } from "@/core/types";

import icon from "./icon.svg";
import { AppKitBTCProvider } from "./provider";

const WALLET_PROVIDER_NAME = "AppKit";

/**
 * AppKit wallet metadata for BTC chain
 */
const metadata: WalletMetadata<IBTCProvider, BTCConfig> = {
  id: "appkit-btc-connector",
  name: WALLET_PROVIDER_NAME,
  icon,
  docs: "https://docs.reown.com/appkit/networks/bitcoin",
  // Don't check for browser global - AppKit is modal-based, not extension-based
  wallet: undefined,
  createProvider: (_wallet: any, config: BTCConfig) => new AppKitBTCProvider(config),
  networks: [Network.MAINNET, Network.SIGNET],
  label: "Connect BTC Wallet",
};

export default metadata;
