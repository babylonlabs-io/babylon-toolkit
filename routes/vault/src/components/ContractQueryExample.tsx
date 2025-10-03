import { useState, useEffect } from 'react';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';
import { ethQueryClient } from '../clients/eth-contract';
import type { Hex } from 'viem';

export default function ContractQueryExample() {
  const ethConnector = useChainConnector('ETH');
  const [vaults, setVaults] = useState<Hex[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Test configuration - replace with actual contract address
  const TEST_CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000' as Hex; // Replace with actual contract address
  const connectedAddress = ethConnector?.connectedWallet?.account?.address as Hex | undefined;

  useEffect(() => {
    console.log('ETH Connector state changed:', {
      ethConnector,
      connectedWallet: ethConnector?.connectedWallet,
      connectedAddress,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allWallets: ethConnector?.wallets?.map((w: any) => ({ id: w.id, name: w.name })),
    });
  }, [ethConnector, connectedAddress]);

  const testGetUserVaults = async () => {
    console.log('Button clicked!');
    console.log('ethConnector:', ethConnector);
    console.log('connectedAddress:', connectedAddress);

    if (!connectedAddress) {
      setError('Please connect your ETH wallet first');
      return;
    }
    console.log('Proceeding with connected address:', connectedAddress);

    setLoading(true);
    setError('');
    try {
      const userVaults = await ethQueryClient.getUserVaults(
        TEST_CONTRACT_ADDRESS,
        connectedAddress
      );
      setVaults(userVaults);
      console.log('User vaults:', userVaults);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      console.error('Failed to get user vaults:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold">Test ETH Contract Query</h2>

      <div className="mb-4 space-y-2">
        <p className="text-sm text-gray-600">Contract: {TEST_CONTRACT_ADDRESS}</p>
        <p className="text-sm text-gray-600">
          Connected Address: {connectedAddress || 'Not connected'}
        </p>
        {ethConnector?.connectedWallet && (
          <p className="text-xs text-green-600">
            ✓ Wallet connected: {ethConnector.connectedWallet.name}
          </p>
        )}
        <p className="text-xs text-gray-500">
          Button disabled: {loading || !connectedAddress ? 'Yes' : 'No'}
        </p>
      </div>

      <button
        onClick={testGetUserVaults}
        disabled={loading || !connectedAddress}
        className="rounded bg-blue-500 px-4 py-2 font-semibold text-white hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {loading ? 'Loading...' : 'Test getUserVaults()'}
      </button>

      {error && (
        <div className="mt-4 rounded bg-red-50 p-4 text-red-700">
          <p className="font-semibold">Error:</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {vaults.length > 0 && (
        <div className="mt-4 rounded bg-green-50 p-4">
          <p className="font-semibold text-green-700">Found {vaults.length} vault(s):</p>
          <ul className="mt-2 space-y-1">
            {vaults.map((vault, index) => (
              <li key={index} className="text-xs font-mono text-gray-700">
                {vault}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!loading && vaults.length === 0 && !error && (
        <div className="mt-4 rounded bg-gray-50 p-4 text-gray-600">
          <p className="text-sm">No vaults loaded. Click the button to test.</p>
        </div>
      )}
    </div>
  );
}
