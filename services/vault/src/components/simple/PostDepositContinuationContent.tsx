import { useMemo } from "react";
import type { Address, Hex } from "viem";

import { PeginPollingProvider } from "@/context/deposit/PeginPollingContext";
import { useBTCWallet } from "@/context/wallet";
import { useDemoDeposit } from "@/dev/demoDeposit";
import type { DepositWarning } from "@/hooks/deposit/depositWarnings";
import { useBtcPublicKey } from "@/hooks/useBtcPublicKey";
import { useVaultDeposits } from "@/hooks/useVaultDeposits";

import { ContinuationWarnings } from "./ContinuationWarnings";
import { PostDepositContinuationView } from "./PostDepositContinuationView";

interface PostDepositContinuationContentProps {
  vaultIds: Hex[];
  depositorEthAddress: Address;
  /**
   * Soft warnings carried over from the live deposit run. Absent on the
   * resume-from-pending-card path, which has no in-flight warnings.
   */
  warnings?: DepositWarning[];
  onClose: () => void;
}

export function PostDepositContinuationContent({
  vaultIds,
  depositorEthAddress,
  warnings = [],
  onClose,
}: PostDepositContinuationContentProps) {
  const { connected: btcConnected } = useBTCWallet();
  const btcPublicKey = useBtcPublicKey(btcConnected);
  const { activities, pendingPegins } = useVaultDeposits(depositorEthAddress);

  // God-mode demo aggregate (null in production). Its activities are never in
  // `useVaultDeposits` (never fetched), so merging them in for the viewed batch
  // is what lets PostDepositContinuationView find the demo VaultActivity and
  // mount the activation branch; the nested PeginPollingProvider already
  // resolves demo polling results by id. Inert in production.
  const demo = useDemoDeposit();

  const scoped = useMemo(() => {
    const ids = new Set<string>(vaultIds);
    const demoActivities = demo
      ? demo.pendingActivities.filter((a) => ids.has(a.id))
      : [];
    const realActivities = activities.filter((a) => ids.has(a.id));
    return {
      // Real activities only. The provider polls this list and drives the
      // signing-required notifications from it, so demo activities are kept OUT:
      // a simulated ready-to-activate state must never fire a real desktop
      // notification. `getPollingResult` still resolves demo ids by id
      // (demo.resultsById), so demo polling is unaffected — this restores
      // PeginPollingContext's invariant that "the demo is never in `activities`".
      providerActivities: realActivities,
      // The view additionally needs the demo VaultActivity to find it and mount
      // the activation branch. Demo activity ids can never collide with real ones
      // (distinct id space), so the concat introduces no duplicates.
      viewActivities: [...demoActivities, ...realActivities],
      pendingPegins: pendingPegins.filter((p) => ids.has(p.id)),
      demoVaultIds: new Set(demoActivities.map((a) => a.id)),
    };
  }, [vaultIds, activities, pendingPegins, demo]);

  return (
    <PeginPollingProvider
      activities={scoped.providerActivities}
      pendingPegins={scoped.pendingPegins}
      btcPublicKey={btcPublicKey}
    >
      <ContinuationWarnings warnings={warnings} />
      <PostDepositContinuationView
        vaultIds={vaultIds}
        activities={scoped.viewActivities}
        depositorEthAddress={depositorEthAddress}
        btcPublicKey={btcPublicKey}
        demoVaultIds={scoped.demoVaultIds}
        onClose={onClose}
      />
    </PeginPollingProvider>
  );
}
