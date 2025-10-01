import { ETHConfig, getNetworkConfigETH } from './eth';

export interface NetworkConfig {
  eth: ETHConfig;
}

// Get all network configs
export const getNetworkConfig = (): NetworkConfig => {
  return {
    eth: getNetworkConfigETH(),
  };
};

export { getNetworkConfigETH, type ETHConfig };
