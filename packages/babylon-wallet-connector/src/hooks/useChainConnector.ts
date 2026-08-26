import { type Connectors, useChainProviders } from "@/context/Chain.context";

export type SupportedChains = keyof Connectors;

export function useChainConnector<K extends SupportedChains>(chainId: K) {
  const connectors = useChainProviders();

  return connectors?.[chainId] ?? null;
}
