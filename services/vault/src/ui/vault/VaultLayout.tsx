import { VaultStats, VaultOverviewPanel } from "./components";
import { VaultDepositState } from "./state/VaultDepositState";
import { VaultRedeemState } from "./state/VaultRedeemState";

const isVaultEnabled = process.env.NEXT_PUBLIC_FF_VAULT === "true";

export function VaultLayout() {
  if (!isVaultEnabled) {
    return null;
  }

  return (
    <div className="w-full md:mx-auto md:max-w-3xl flex flex-1 flex-col gap-6 px-1 pb-6 max-md:gap-4 max-md:px-0 max-md:pt-0 max-md:pb-4 max-md:flex-none">
      <VaultStats />
      <VaultDepositState>
        <VaultRedeemState>
          <VaultOverviewPanel />
        </VaultRedeemState>
      </VaultDepositState>
    </div>
  );
}
