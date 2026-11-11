import type { PropsWithChildren } from "react";

import { TomoConnectionProvider } from "@/context/TomoProvider";
import chainMetadata from "@/core/wallets";
import { TomoBBNConnector } from "@/widgets/tomo/BBNConnector";
import { TomoBTCConnector } from "@/widgets/tomo/BTCConnector";

import { WalletProviderShell, type WalletProviderShellProps } from "./WalletProviderShell";

export interface WalletProviderProps extends Omit<WalletProviderShellProps, "metadata" | "connectors"> {
  theme?: string;
  disableTomo?: boolean;
}

/**
 * The package root's wallet-dialog shell: Bitcoin, Babylon chain and Ethereum
 * wallets, with Tomo Connect unless `disableTomo` is set. Its module graph
 * carries every wallet SDK the package supports; `./eth` and `./btc-eth`
 * exist for consumers that must not ship some of them.
 */
export function WalletProvider({
  theme,
  disableTomo = false,
  children,
  config,
  ...props
}: PropsWithChildren<WalletProviderProps>) {
  const tree = (
    <WalletProviderShell
      {...props}
      config={config}
      metadata={chainMetadata}
      connectors={
        disableTomo
          ? undefined
          : ({ persistent, storage }) => (
              <>
                <TomoBTCConnector persistent={persistent} storage={storage} />
                <TomoBBNConnector persistent={persistent} storage={storage} />
              </>
            )
      }
    >
      {children}
    </WalletProviderShell>
  );

  if (disableTomo) {
    return tree;
  }

  return (
    <TomoConnectionProvider theme={theme} config={config}>
      {tree}
    </TomoConnectionProvider>
  );
}
