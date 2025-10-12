import { useState } from 'react';
import { Button } from '@babylonlabs-io/core-ui';
import { IoAdd } from 'react-icons/io5';
import { BorrowModal } from '../BorrowFlow/BorrowModal/BorrowModal';
import { useWalletConnect } from '@babylonlabs-io/wallet-connector';

export default function VaultPositions() {
  const [borrowModalOpen, setBorrowModalOpen] = useState(false);
  const { connected } = useWalletConnect();

  // Mock collateral data - replace with real data later
  const mockCollateral = {
    amount: '0.5',
    symbol: 'BTC',
  };

  const mockMarketData = {
    btcPriceUSD: 95000,
    lltvPercent: 75,
  };

  // Show message if wallet is not connected
  if (!connected) {
    return (
      <div className="container mx-auto flex max-w-[760px] flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="text-center">
          <h2 className="mb-4 text-2xl font-semibold">Connect Your Wallet</h2>
          <p className="text-gray-600">
            Please connect your wallet to borrow USDC or view your existing positions
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-8">
      <Button
        variant="contained"
        color="primary"
        onClick={() => setBorrowModalOpen(true)}
        className="min-w-[200px] flex items-center gap-2"
      >
        <IoAdd size={20} />
        Borrow USDC
      </Button>

      <BorrowModal
        open={borrowModalOpen}
        onClose={() => setBorrowModalOpen(false)}
        collateral={mockCollateral}
        marketData={mockMarketData}
      />
    </div>
  );
}
