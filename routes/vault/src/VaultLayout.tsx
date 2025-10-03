import { useAppKitBridge } from "@babylonlabs-io/wallet-connector";
import { Borrow } from "./components/ui";

export default function VaultLayout() {
  // Initialize AppKit bridge for ETH wallet connection
  useAppKitBridge();

  return (
    <div className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-12 px-4">
      <Borrow />
    </div>
  );
}