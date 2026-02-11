import { ChainConfigArr } from '@/context/Chain.context';
import { ExternalWallets } from '@/components/ExternalWallets';
import type { BTCConfig, BBNConfig, ETHConfig } from '@/core/types';

export interface WalletConfigOptions {
  chains: ('BTC' | 'BBN' | 'ETH')[];
  networkConfigs: {
    BTC?: BTCConfig;
    BBN?: BBNConfig;
    ETH?: ETHConfig;
  };
  supportedWallets?: string[];
}

export function createWalletConfig({ chains, networkConfigs, supportedWallets }: WalletConfigOptions): ChainConfigArr {
  const config: ChainConfigArr = [];

  if (chains.includes('BTC') && networkConfigs.BTC) {
    config.push({
      chain: "BTC",
      connectors: [
        {
          id: "tomo-btc-connector",
          widget: ({ onError }: { onError?: (e: Error) => void }) => (
            <ExternalWallets chainName="bitcoin" onError={onError} supportedWallets={supportedWallets} />
          ),
        },
      ],
      config: networkConfigs.BTC,
    });
  }

  if (chains.includes('BBN') && networkConfigs.BBN) {
    config.push({
      chain: "BBN",
      connectors: [
        {
          id: "tomo-bbn-connector",
          widget: ({ onError }: { onError?: (e: Error) => void }) => (
            <ExternalWallets chainName="cosmos" onError={onError} supportedWallets={supportedWallets} />
          ),
        },
      ],
      config: networkConfigs.BBN,
    });
  }
  
  if (chains.includes('ETH') && networkConfigs.ETH) {
    config.push({
      chain: "ETH",
      config: networkConfigs.ETH,
    });
  }
  
  return config;
}

