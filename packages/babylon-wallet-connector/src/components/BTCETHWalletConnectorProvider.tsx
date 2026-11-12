import type { PropsWithChildren } from "react";

import { WalletProviderShell, type WalletProviderCommonProps } from "@/components/WalletProvider/WalletProviderShell";
import type { ChainMetadataMap } from "@/context/Chain.context";
import type { ChainId } from "@/core/types";
import btcMetadata from "@/core/wallets/btc";
import ethMetadata from "@/core/wallets/eth";
import type { BTCETHChainConfigArr } from "@/utils/btcEthConfigBuilder";

const metadata: ChainMetadataMap = { BTC: btcMetadata, ETH: ethMetadata };

type BTCETHChainId = Extract<ChainId, "BTC" | "ETH">;

export interface WalletProviderProps extends WalletProviderCommonProps {
  config: Readonly<BTCETHChainConfigArr>;
  /** Defaults to every configured chain. */
  requiredChains?: readonly BTCETHChainId[];
  /** A short line under each chain's name on the connect screen that says why the app needs that wallet. */
  chainDescriptions?: Partial<Record<BTCETHChainId, string>>;
}

/**
 * Wallet-dialog shell for Bitcoin and Ethereum consumers. Its static module
 * graph carries no Babylon-chain wallet and no Tomo Connect, so a product that
 * never offers a Cosmos wallet ships neither of them nor their dependencies.
 */
export function WalletProvider(props: PropsWithChildren<WalletProviderProps>) {
  return <WalletProviderShell {...props} metadata={metadata} />;
}
