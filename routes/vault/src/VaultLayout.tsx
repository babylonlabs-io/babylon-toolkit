import { useAppKitBridge } from '@babylonlabs-io/wallet-connector';
import { VaultDeposit } from './components/VaultDeposit';

interface VaultLayoutProps {
  ethAddress?: string;
  btcAddress?: string;
  btcPublicKey?: string;
  isWalletConnected?: boolean;
}

export default function VaultLayout({
  ethAddress,
  btcAddress,
  btcPublicKey,
  isWalletConnected = false
}: VaultLayoutProps) {
  // Initialize AppKit bridge for ETH wallet connection
  useAppKitBridge();

  return (
    <div>
      <VaultDeposit
        ethAddress={ethAddress}
        btcAddress={btcAddress}
        btcPublicKey={btcPublicKey}
        isWalletConnected={isWalletConnected}
      />
    </div>
  );
}
