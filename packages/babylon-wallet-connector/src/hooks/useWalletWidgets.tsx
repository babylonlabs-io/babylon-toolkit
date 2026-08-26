import { useCallback, useMemo } from "react";

import { createExternalWallet } from "@/core";
import { ExternalConnector } from "@/core/types";

export function useWalletWidgets(connectors: any, config: any, onError?: (e: Error) => void) {
  const createChainWidget = useCallback(
    (chainId: string, externalConnectors: ExternalConnector[]) => (
      <>
        {externalConnectors.map(({ id, widget: Component }) => (
          <Component
            key={id}
            id={id}
            connector={connectors[chainId]}
            createWallet={createExternalWallet}
            onError={onError}
          />
        ))}
      </>
    ),
    [connectors, onError],
  );

  return useMemo(
    () =>
      config.reduce(
        (acc: Record<string, JSX.Element>, config: any) => ({
          ...acc,
          [config.chain]: createChainWidget(config.chain, config.connectors ?? []),
        }),
        {},
      ) as Record<string, JSX.Element>,
    [createChainWidget, config],
  );
}
