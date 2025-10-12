import { VaultStats, VaultOverviewPanel } from "./components";

const isVaultEnabled = process.env.NEXT_PUBLIC_FF_VAULT === "true";

export default function VaultLayout() {
  if (!isVaultEnabled) {
    return null;
  }

  return (
    <div className="container mx-auto flex max-w-[760px] flex-1 flex-col gap-6 px-4 py-6 max-md:gap-4 max-md:px-0 max-md:pt-0 max-md:pb-4">
      <VaultStats />
      <VaultOverviewPanel />
    </div>
  );
}
