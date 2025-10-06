/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from 'react';
import { useChainConnector } from '@babylonlabs-io/wallet-connector';
import { VaultController, VaultControllerTx, BTCVaultsManager, Morpho } from '../../clients/eth-contract';
import type { Hex } from 'viem';
import type { MarketParams } from '../../clients/eth-contract';

// Test configuration
const MORPHO_MARKET_ID = '74452254177513794647796445278347016294878377877693199253750000625994101441252';
const VAULT_CONTRACT_ADDRESS = '0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6' as Hex;
const BTC_VAULTS_MANAGER_ADDRESS = '0x0165878A594ca255338adfa4d48449f69242Eb8F' as Hex;
// Deployment info:
// BTCVault: 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
// Controller: 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6
// Manager: 0x0165878A594ca255338adfa4d48449f69242Eb8F
// Morpho: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

export default function ContractQueryExample() {
  const ethConnector = useChainConnector('ETH');
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [txHashInput, setTxHashInput] = useState<string>('');

  // MintAndBorrow inputs
  const [depositorBtcPubkey, setDepositorBtcPubkey] = useState<string>('');
  const [borrowAmount, setBorrowAmount] = useState<string>('');
  const [marketId, setMarketId] = useState<string>(MORPHO_MARKET_ID);

  // Try multiple paths to get the connected address - memoize to prevent unnecessary re-renders
  const connectedAddress = useMemo(() => {
    return (
      ethConnector?.connectedWallet?.account?.address ||
      (ethConnector as any)?.connectedWallet?.accounts?.[0]?.address || // only this works now
      (ethConnector as any)?.address
    ) as Hex | undefined;
  }, [ethConnector]);

  useEffect(() => {
    console.log('ETH Connector state changed:', {
      ethConnector,
      connectedWallet: ethConnector?.connectedWallet,
      account: ethConnector?.connectedWallet?.account,
      connectedAddress,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allWallets: ethConnector?.wallets?.map((w: any) => ({ id: w.id, name: w.name })),
    });

    // Auto-switch to local network when wallet is connected
    if (connectedAddress) {
      switchToLocalNetwork();
    }
  }, [ethConnector, connectedAddress]);

  useEffect(() => {
    console.log('Loading state changed:', loading);
  }, [loading]);

  const executeQuery = async (queryName: string, queryFn: () => Promise<unknown>, requiresWallet = false) => {
    if (requiresWallet && !connectedAddress) {
      setError('Please connect your ETH wallet first');
      return;
    }

    console.log('Starting query:', queryName);
    setLoading(queryName);
    setError('');
    setResult(null);

    try {
      const data = await queryFn();
      console.log('Query result:', queryName, data);
      setResult(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('Query failed:', queryName, err);
      setError(errorMessage);
    }

    // Always reset loading state
    console.log('Resetting loading state for:', queryName);
    setLoading(null);
  };

  // VaultController queries
  const testGetUserVaults = () =>
    executeQuery('getUserVaults', () => VaultController.getUserVaults(VAULT_CONTRACT_ADDRESS, connectedAddress!), true);

  const testGetVaultMetadata = () => {
    if (!txHashInput) {
      setError('Please enter a transaction hash');
      return;
    }
    executeQuery('getVaultMetadata', () => VaultController.getVaultMetadata(VAULT_CONTRACT_ADDRESS, txHashInput as Hex));
  };

  const testArePeginAssetsMinted = () => {
    if (!txHashInput) {
      setError('Please enter a transaction hash');
      return;
    }
    executeQuery('arePeginAssetsMinted', () => VaultController.arePeginAssetsMinted(VAULT_CONTRACT_ADDRESS, txHashInput as Hex));
  };

  const testIsPeginReadyToMint = () => {
    if (!txHashInput) {
      setError('Please enter a transaction hash');
      return;
    }
    executeQuery('isPeginReadyToMint', () => VaultController.isPeginReadyToMint(VAULT_CONTRACT_ADDRESS, txHashInput as Hex));
  };

  // BTCVaultsManager queries
  const testGetDepositorPeginRequests = () =>
    executeQuery('getDepositorPeginRequests', () => BTCVaultsManager.getDepositorPeginRequests(BTC_VAULTS_MANAGER_ADDRESS, connectedAddress!), true);

  const testGetPeginRequest = () => {
    if (!txHashInput) {
      setError('Please enter a transaction hash');
      return;
    }
    executeQuery('getPeginRequest', () => BTCVaultsManager.getPeginRequest(BTC_VAULTS_MANAGER_ADDRESS, txHashInput as Hex));
  };

  const testIsPeginVerified = () => {
    if (!txHashInput) {
      setError('Please enter a transaction hash');
      return;
    }
    executeQuery('isPeginVerified', () => BTCVaultsManager.isPeginVerified(BTC_VAULTS_MANAGER_ADDRESS, txHashInput as Hex));
  };

  const testIsLiquidator = () =>
    executeQuery('isLiquidator', () => BTCVaultsManager.isLiquidator(BTC_VAULTS_MANAGER_ADDRESS, connectedAddress!), true);

  // Morpho queries
  const testGetMarketById = () =>
    executeQuery('getMarketById', () => Morpho.getMarketById(MORPHO_MARKET_ID));

  const testGetUserPosition = () =>
    executeQuery('getUserPosition', () => Morpho.getUserPosition(MORPHO_MARKET_ID, connectedAddress!), true);

  // Switch to local network
  const switchToLocalNetwork = async () => {
    try {
      // Request wallet to switch to local network
      await (window as any).ethereum?.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x7a69' }], // 31337 in hex
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to the wallet
      if (switchError.code === 4902) {
        try {
          await (window as any).ethereum?.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x7a69',
              chainName: 'Local Anvil',
              rpcUrls: ['http://localhost:8545'],
              nativeCurrency: {
                name: 'Ether',
                symbol: 'ETH',
                decimals: 18,
              },
            }],
          });
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (addError) {
          setError('Failed to add local network to wallet');
        }
      } else {
        setError('Failed to switch network');
      }
    }
  };

  // VaultController transactions
  const testMintAndBorrow = async () => {
    if (!connectedAddress) {
      setError('Please connect your ETH wallet first');
      return;
    }

    if (!txHashInput || !depositorBtcPubkey || !borrowAmount || !marketId) {
      setError('Please fill in all required fields for mintAndBorrow');
      return;
    }

    setLoading('mintAndBorrow');
    setError('');
    setResult(null);

    try {
      // Check if wallet is on the correct network
      const publicClient = (await import('../../clients/eth-contract')).ethClient.getPublicClient();
      const walletChainId = await publicClient.getChainId();
      console.log('Wallet chain ID:', walletChainId);

      // Expected local network chain IDs
      const expectedChainIds = [31337, 1337, 3151908]; // Anvil, Hardhat, or custom local
      if (!expectedChainIds.includes(walletChainId)) {
        setError(`Wrong network! Wallet is on chain ${walletChainId}. Please switch to local Anvil network (chainId: 31337 or 3151908)`);
        setLoading(null);
        return;
      }

      // First, fetch market parameters from Morpho
      console.log('Fetching market parameters from Morpho...');
      const market = await Morpho.getMarketById(marketId);

      // Construct market params from fetched data
      const marketParams: MarketParams = {
        loanToken: market.loanToken.address,
        collateralToken: market.collateralToken.address,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
      };

      console.log('Market params:', marketParams);

      // Execute transaction
      const txResult = await VaultControllerTx.mintAndBorrow(
        VAULT_CONTRACT_ADDRESS,
        txHashInput as Hex,
        depositorBtcPubkey as Hex,
        marketParams,
        BigInt(borrowAmount)
      );

      console.log('Transaction result:', txResult);
      setResult(txResult);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('mintAndBorrow failed:', err);
      setError(errorMessage);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-semibold">Test ETH Contract Query</h2>

      {/* Configuration Info */}
      <div className="mb-4 space-y-1 text-sm">
        <p className="text-gray-600">Controller: <span className="font-mono text-xs">{VAULT_CONTRACT_ADDRESS}</span></p>
        <p className="text-gray-600">Connected: {connectedAddress ? <span className="font-mono text-xs">{connectedAddress}</span> : 'Not connected'}</p>
        {ethConnector?.connectedWallet && (
          <p className="text-xs text-green-600">✓ Wallet: {ethConnector.connectedWallet.name}</p>
        )}
      </div>

      {/* Input for transaction hash */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Transaction Hash (for specific queries):
        </label>
        <input
          type="text"
          value={txHashInput}
          onChange={(e) => setTxHashInput(e.target.value)}
          placeholder="0x..."
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
          disabled={loading !== null}
        />
      </div>

      {/* Query Buttons */}
      <div className="space-y-3">
        {/* VaultController - User queries */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">VaultController - User Queries (require wallet):</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={testGetUserVaults} disabled={loading === 'getUserVaults' || !connectedAddress} className="btn-query">
              {loading === 'getUserVaults' ? 'Loading...' : 'getUserVaults()'}
            </button>
          </div>
        </div>

        {/* VaultController - Transaction hash queries */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">VaultController - Transaction Hash Queries:</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={testGetVaultMetadata} disabled={loading === 'getVaultMetadata' || !txHashInput} className="btn-query">
              {loading === 'getVaultMetadata' ? 'Loading...' : 'getVaultMetadata()'}
            </button>
            <button onClick={testArePeginAssetsMinted} disabled={loading === 'arePeginAssetsMinted' || !txHashInput} className="btn-query">
              {loading === 'arePeginAssetsMinted' ? 'Loading...' : 'arePeginAssetsMinted()'}
            </button>
            <button onClick={testIsPeginReadyToMint} disabled={loading === 'isPeginReadyToMint' || !txHashInput} className="btn-query">
              {loading === 'isPeginReadyToMint' ? 'Loading...' : 'isPeginReadyToMint()'}
            </button>
          </div>
        </div>

        {/* BTCVaultsManager - User queries */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">BTCVaultsManager - User Queries (require wallet):</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={testGetDepositorPeginRequests} disabled={loading === 'getDepositorPeginRequests' || !connectedAddress} className="btn-query">
              {loading === 'getDepositorPeginRequests' ? 'Loading...' : 'getDepositorPeginRequests()'}
            </button>
            <button onClick={testIsLiquidator} disabled={loading === 'isLiquidator' || !connectedAddress} className="btn-query">
              {loading === 'isLiquidator' ? 'Loading...' : 'isLiquidator()'}
            </button>
          </div>
        </div>

        {/* BTCVaultsManager - Transaction hash queries */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">BTCVaultsManager - Transaction Hash Queries:</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={testGetPeginRequest} disabled={loading === 'getPeginRequest' || !txHashInput} className="btn-query">
              {loading === 'getPeginRequest' ? 'Loading...' : 'getPeginRequest()'}
            </button>
            <button onClick={testIsPeginVerified} disabled={loading === 'isPeginVerified' || !txHashInput} className="btn-query">
              {loading === 'isPeginVerified' ? 'Loading...' : 'isPeginVerified()'}
            </button>
          </div>
        </div>

        {/* Morpho queries */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">Morpho Queries:</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={testGetMarketById} disabled={loading === 'getMarketById'} className="btn-query">
              {loading === 'getMarketById' ? 'Loading...' : 'getMarketById()'}
            </button>
            <button onClick={testGetUserPosition} disabled={loading === 'getUserPosition' || !connectedAddress} className="btn-query">
              {loading === 'getUserPosition' ? 'Loading...' : 'getUserPosition()'}
            </button>
          </div>
        </div>

        {/* VaultController transactions */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2">
            VaultController - Transactions (require wallet):
            {!connectedAddress && <span className="text-red-600 ml-2">⚠️ Connect wallet first</span>}
          </p>
          <button
            onClick={switchToLocalNetwork}
            className="mb-2 px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            🔄 Switch to Local Network (31337)
          </button>
          <div className="space-y-2 mb-2">
            <input
              type="text"
              value={depositorBtcPubkey}
              onChange={(e) => setDepositorBtcPubkey(e.target.value)}
              placeholder="Depositor BTC Pubkey (0x...)"
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
              disabled={loading !== null}
            />
            <input
              type="text"
              value={borrowAmount}
              onChange={(e) => setBorrowAmount(e.target.value)}
              placeholder="Borrow Amount (in wei)"
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
              disabled={loading !== null}
            />
            <input
              type="text"
              value={marketId}
              onChange={(e) => setMarketId(e.target.value)}
              placeholder="Morpho Market ID"
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
              disabled={loading !== null}
            />
            <p className="text-xs text-gray-500 italic">Market params (loanToken, collateralToken, oracle, IRM, LLTV) will be fetched from Morpho</p>
          </div>
          <div className="space-y-2">
            <button
              onClick={testMintAndBorrow}
              disabled={loading === 'mintAndBorrow' || !connectedAddress || !txHashInput || !depositorBtcPubkey || !borrowAmount || !marketId}
              className="btn-query btn-transaction w-full"
            >
              {loading === 'mintAndBorrow' ? 'Processing...' : 'mintAndBorrow()'}
            </button>
            {/* Debug info */}
            <div className="text-xs text-gray-500">
              Status: {connectedAddress ? '✓ Ready' : '✗ Missing:'}
              {!connectedAddress && ' Wallet'}
              {!txHashInput && ' TxHash'}
              {!depositorBtcPubkey && ' BTC-Pubkey'}
              {!borrowAmount && ' Amount'}
              {!marketId && ' MarketID'}
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {error && (
        <div className="mt-4 rounded bg-red-50 p-3 text-red-700">
          <p className="font-semibold text-sm">Error:</p>
          <p className="text-xs">{error}</p>
        </div>
      )}

      {result !== null && (
        <div className="mt-4 rounded bg-green-50 p-3">
          <p className="font-semibold text-green-700 text-sm mb-2">Result:</p>
          <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-all">
            {JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)}
          </pre>
        </div>
      )}

      {!loading && result === null && !error && (
        <div className="mt-4 rounded bg-gray-50 p-3 text-gray-600">
          <p className="text-xs">No data loaded. Click a button to test.</p>
        </div>
      )}

      <style>{`
        .btn-query {
          padding: 0.375rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: white;
          background-color: #3b82f6;
          border-radius: 0.375rem;
          transition: background-color 0.2s;
        }
        .btn-query:hover:not(:disabled) {
          background-color: #2563eb;
        }
        .btn-query:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }
        .btn-transaction {
          background-color: #f59e0b;
        }
        .btn-transaction:hover:not(:disabled) {
          background-color: #d97706;
        }
      `}</style>
    </div>
  );
}
