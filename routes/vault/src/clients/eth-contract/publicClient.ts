import { createPublicClient, http } from 'viem';
import { foundry } from 'viem/chains';
import { RPC_URL } from './config';

export const publicClient = createPublicClient({
  chain: foundry,
  transport: http(RPC_URL)
});

export default publicClient;


