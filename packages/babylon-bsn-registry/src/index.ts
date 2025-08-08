import testnetRegistry from './testnet.json';
import mainnetRegistry from './mainnet.json';

export interface BSNEntry {
  logoUrl: string;
  rpcUrl: string;
}

export interface BSNRegistry {
  [bsnId: string]: BSNEntry;
}

export { testnetRegistry, mainnetRegistry };

// Default export for backward compatibility (mainnet)
export default mainnetRegistry as BSNRegistry;

// Environment-specific exports
export const getRegistry = (environment: 'testnet' | 'mainnet'): BSNRegistry => {
  switch (environment) {
    case 'testnet':
      return testnetRegistry as BSNRegistry;
    case 'mainnet':
      return mainnetRegistry as BSNRegistry;
    default:
      throw new Error(`Unknown environment: ${environment}`);
  }
};
