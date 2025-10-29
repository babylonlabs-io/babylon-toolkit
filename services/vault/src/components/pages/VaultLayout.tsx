import { VaultOverviewPanel, VaultStats } from "@/components";

export function VaultLayout() {
  return (
    <div className="mx-auto flex max-w-[1104px] flex-1 flex-col gap-6 px-1 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0">
      <VaultStats />
      <VaultOverviewPanel />
    </div>
  );
}
