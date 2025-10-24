import { VaultOverviewPanel, VaultStats } from "@/components";
import { VaultDepositState } from "@/state/VaultDepositState";
import { VaultRedeemState } from "@/state/VaultRedeemState";

const isVaultEnabled = process.env.NEXT_PUBLIC_FF_VAULT === "true";

export function VaultLayout() {
  if (!isVaultEnabled) {
    return null;
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-6 px-1 pb-6 max-md:flex-none max-md:gap-4 max-md:px-0 max-md:pb-4 max-md:pt-0 md:mx-auto md:max-w-3xl">
      <VaultStats />
      <VaultDepositState>
        <VaultRedeemState>
          <VaultOverviewPanel />
        </VaultRedeemState>
      </VaultDepositState>
    </div>
  );
}
