// BTC Vaults Manager - Read operations (requests)

import { type Address, type Hex, type Abi } from 'viem';
import { ethClient } from '../client';
import BTCVaultsManagerABI from './abis/BTCVaultsManager.abi.json';
import { type ManagerPeginRequestFull } from './types';

const ABI = BTCVaultsManagerABI as unknown as Abi;

/**
 * Get all pegin request IDs for a depositor (internal)
 */
async function getDepositorPeginRequests(
  managerAddress: Address,
  depositor: Address
): Promise<Hex[]> {
  const publicClient = ethClient.getPublicClient();
  const ids = await publicClient.readContract({
    address: managerAddress,
    abi: ABI,
    functionName: 'getDepositorPeginRequests',
    args: [depositor],
  });
  return ids as Hex[];
}

/**
 * Get all depositor tx hashes (internal)
 */
async function getDepositorTxHashes(
  managerAddress: Address,
  depositor: Address
): Promise<Hex[]> {
  const publicClient = ethClient.getPublicClient();
  const hashes = await publicClient.readContract({
    address: managerAddress,
    abi: ABI,
    functionName: 'getDepositorTxHashes',
    args: [depositor],
  });
  return hashes as Hex[];
}


/**
 * Read request via public mapping to include unsigned tx and provider (internal)
 */
async function getPeginRequestFull(
  managerAddress: Address,
  requestId: Hex
): Promise<ManagerPeginRequestFull> {
  const publicClient = ethClient.getPublicClient();
  const result = await publicClient.readContract({
    address: managerAddress,
    abi: ABI,
    functionName: 'peginRequests',
    args: [requestId],
  });

  const [depositor, unsignedBtcTx, amount, vaultProvider, status] =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (result as any) as [Address, Hex, bigint, Address, number];

  return { depositor, txHash: requestId, amount, status, unsignedBtcTx, vaultProvider };
}

/**
 * Get all request details for a depositor using multicall (internal)
 */
async function getDepositorRequestsDetails(
  managerAddress: Address,
  depositor: Address
): Promise<ManagerPeginRequestFull[]> {
  const publicClient = ethClient.getPublicClient();
  const ids = await getDepositorPeginRequests(managerAddress, depositor);
  if (!ids.length) return [];

  const calls = ids.map((id) => ({
    address: managerAddress,
    abi: ABI,
    functionName: 'peginRequests',
    args: [id],
  }));

  const results = await publicClient.multicall({ contracts: calls });

  return results.map((r, idx) => {
    const [rqDepositor, unsignedBtcTx, amount, vaultProvider, status] =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r.result as any) as [Address, Hex, bigint, Address, number];
    return {
      depositor: rqDepositor,
      txHash: ids[idx],
      amount,
      status,
      unsignedBtcTx,
      vaultProvider,
    };
  });
}

/**
 * 1) Return all btcTxHash for user
 */
export async function listUserBtcTxHashes(
  managerAddress: Address,
  userAddress: Address
): Promise<Hex[]> {
  return getDepositorTxHashes(managerAddress, userAddress);
}

/**
 * 2) Return request data for a given btcTxHash
 */
export async function getRequestByBtcTxHash(
  managerAddress: Address,
  btcTxHash: Hex
): Promise<ManagerPeginRequestFull> {
  return getPeginRequestFull(managerAddress, btcTxHash);
}

/**
 * 3) Return all requests data for a user
 */
export async function listUserRequests(
  managerAddress: Address,
  userAddress: Address
): Promise<ManagerPeginRequestFull[]> {
  const publicClient = ethClient.getPublicClient();
  const hasMulticall = Boolean(publicClient.chain?.contracts?.multicall3?.address);

  if (hasMulticall) {
    return getDepositorRequestsDetails(managerAddress, userAddress);
  }

  // Fallback for chains without multicall3 configured
  const ids = await getDepositorPeginRequests(managerAddress, userAddress);
  if (!ids.length) return [];

  const results = await Promise.all(
    ids.map((id) =>
      publicClient
        .readContract({
          address: managerAddress,
          abi: ABI,
          functionName: 'peginRequests',
          args: [id],
        })
        .then((res) => ({ ok: true as const, res, id }))
        .catch((err) => ({ ok: false as const, err, id }))
    )
  );

  return results
    .filter((r) => r.ok)
    .map((r) => {
      const result = (r as { ok: true; res: unknown; id: Hex }).res;
      const id = (r as { ok: true; res: unknown; id: Hex }).id;
      const [rqDepositor, unsignedBtcTx, amount, vaultProvider, status] =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result as any) as [Address, Hex, bigint, Address, number];
      return {
        depositor: rqDepositor,
        txHash: id,
        amount,
        status,
        unsignedBtcTx,
        vaultProvider,
      };
    });
}


