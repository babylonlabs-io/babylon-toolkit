/**
 * PendingDepositSection Component
 *
 * Orchestrator for the "Pending Deposit" dashboard section.
 *
 * Responsibilities (thin glue layer):
 *  - Pull pending-deposit data via usePendingDeposits (business logic)
 *  - Provide PeginPollingProvider so child cards can resolve their state
 *  - Render the card list and modals (delegated to sub-components)
 *  - Hide itself when there are no pending deposits
 */

import { PeginPollingProvider } from "@/context/deposit/PeginPollingContext";
import { usePendingDeposits } from "@/hooks/usePendingDeposits";

import { PendingDepositCard } from "./PendingDepositCard";
import { PendingDepositModals } from "./PendingDepositModals";

export function PendingDepositSection() {
  const {
    pendingActivities,
    allActivities,
    pendingPegins,
    vaultProviders,
    btcPublicKey,
    btcAddress,
    ethAddress,
    hasPendingDeposits,
    signModal,
    broadcastModal,
    lamportKeyModal,
  } = usePendingDeposits();

  if (!hasPendingDeposits) return null;

  return (
    <PeginPollingProvider
      activities={allActivities}
      pendingPegins={pendingPegins}
      btcPublicKey={btcPublicKey}
      btcAddress={btcAddress}
      vaultProviders={vaultProviders}
    >
      <div className="w-full space-y-4">
        {/* Section header */}
        <div className="flex items-center gap-3">
          <h2 className="text-[24px] font-normal text-accent-primary">
            Pending Deposit
          </h2>
          <div className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
        </div>

        {/* Pending deposit cards – scrollable when list is long */}
        <div className="flex max-h-[400px] flex-col gap-2 overflow-y-auto">
          {pendingActivities.map((activity) => (
            <PendingDepositCard
              key={activity.id}
              depositId={activity.id}
              amount={activity.collateral.amount}
              onSignClick={signModal.handleSignClick}
              onBroadcastClick={broadcastModal.handleBroadcastClick}
              onLamportKeyClick={lamportKeyModal.handleLamportKeyClick}
            />
          ))}
        </div>
      </div>

      {/* Sign / Broadcast / Lamport Key / Success modals */}
      <PendingDepositModals
        signModal={signModal}
        broadcastModal={broadcastModal}
        lamportKeyModal={lamportKeyModal}
        vaultProviders={vaultProviders}
        btcPublicKey={btcPublicKey}
        ethAddress={ethAddress}
      />
    </PeginPollingProvider>
  );
}
