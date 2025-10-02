import type { Address } from 'viem';

export type TokenMetadata = {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
};


