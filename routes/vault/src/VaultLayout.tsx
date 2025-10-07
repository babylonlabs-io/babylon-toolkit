import { useAppKitBridge } from '@babylonlabs-io/wallet-connector';
import { VaultDashboard } from './components/VaultDashboard';

// TODO: Uncomment this when we have a way to test the contract queries
// import { PegInTest } from './components/examples/PegInTest';
// import ContractQueryExample from "./components/examples/ContractQueryExample";

export default function VaultLayout() {
  // Initialize AppKit bridge for ETH wallet connection
  useAppKitBridge();

  return (
    <div className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-12 px-4 py-8">
      {/* <ContractQueryExample /> */}
      {/* <PegInTest /> */}
      <VaultDashboard />
    </div>
  );
}
