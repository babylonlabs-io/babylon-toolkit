import { useAppKitBridge } from '@babylonlabs-io/wallet-connector';
import { VaultDeposit } from './components/VaultDeposit';

// TODO: Uncomment this when we have a way to test the contract queries
// import { PegInTest } from './components/examples/PegInTest';
// import ContractQueryExample from "./components/examples/ContractQueryExample";

export default function VaultLayout() {
  // Initialize AppKit bridge for ETH wallet connection
  useAppKitBridge();

  return (
    <div>
      <VaultDeposit />
    </div>
  );
}
