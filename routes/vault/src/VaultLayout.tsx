import { useAppKitBridge } from '@babylonlabs-io/wallet-connector';
import { VaultDeposit } from './components/VaultDeposit';

// TODO: Uncomment this when we have a way to test the contract queries
// import { PegInTest } from './components/examples/PegInTest';
// import ContractQueryExample from "./components/examples/ContractQueryExample";

interface VaultLayoutProps {
  ethAddress?: string;
  btcAddress?: string;
  isWalletConnected?: boolean;
}

export default function VaultLayout({ 
  ethAddress, 
  btcAddress, 
  isWalletConnected = false 
}: VaultLayoutProps) {
  // Initialize AppKit bridge for ETH wallet connection
  useAppKitBridge();

  return (
    <div>
      <VaultDeposit 
        ethAddress={ethAddress}
        btcAddress={btcAddress}
        isWalletConnected={isWalletConnected}
      />
    </div>
  );
}
