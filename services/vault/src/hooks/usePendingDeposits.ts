/**
 * usePendingDeposits hook
 *
 * Fetches vault deposits and splits them into two lists:
 *  - pendingActivities: in-flight deposits (contractStatus 0=PENDING or 1=VERIFIED).
 *  - expiredActivities: refundable expired deposits (contractStatus 7=EXPIRED with
 *    unsignedPrePeginTx — the only indexer-sourced field required to build the
 *    refund PSBT; hashlock and htlcVout come from the on-chain contract).
 * Provides polling infrastructure, wallet state, and modal handlers for
 * broadcast/refund actions on pending and expired deposits. The post-broadcast
 * actions (WOTS, payout signing, activation, artifact download) are owned by
 * the deposit multistepper opened from the card body, not per-action modals.
 */

import { useMemo } from "react";
import type { Address } from "viem";

import { useDemoDeposit } from "@/components/dev/demoDeposit";
import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { useAllDepositProviders } from "@/hooks/deposit/useAllDepositProviders";
import { useBroadcastModal } from "@/hooks/deposit/useBroadcastModal";
import { useRefundModal } from "@/hooks/deposit/useRefundModal";
import { useBtcPublicKey } from "@/hooks/useBtcPublicKey";
import { useVaultDeposits } from "@/hooks/useVaultDeposits";
import { ContractStatus } from "@/models/peginStateMachine";

export function usePendingDeposits() {
  const { connected: btcConnected, address: btcAddress } = useBTCWallet();
  const { address: ethAddress } = useETHWallet();
  const btcPublicKey = useBtcPublicKey(btcConnected);

  const { activities, pendingPegins, refetchActivities } = useVaultDeposits(
    ethAddress as Address | undefined,
  );

  const { vaultProviders } = useAllDepositProviders(activities);

  // God-mode demo deposit (dev only; null unless NEXT_PUBLIC_FF_GOD_MODE_PANEL
  // is on and enabled). Injected into the render lists below — but NOT into
  // `allActivities` — so the real section renders it while it is never polled
  // and every click handler no-ops for it (they resolve ids against
  // `allActivities`). When `demo.hideReal` is set, the real deposits are
  // dropped from the render lists so only the demo shows. Inert in production.
  const demo = useDemoDeposit();

  const pendingActivities = useMemo(() => {
    const real = activities.filter(
      (a) =>
        a.contractStatus === ContractStatus.PENDING ||
        a.contractStatus === ContractStatus.VERIFIED,
    );
    if (!demo) return real;
    return [...demo.pendingActivities, ...(demo.hideReal ? [] : real)];
  }, [activities, demo]);

  const expiredActivities = useMemo(() => {
    const real = activities.filter(
      (a) =>
        a.contractStatus === ContractStatus.EXPIRED && !!a.unsignedPrePeginTx,
    );
    if (!demo) return real;
    return [...demo.expiredActivities, ...(demo.hideReal ? [] : real)];
  }, [activities, demo]);

  const mergedVaultProviders = useMemo(
    () => (demo ? [demo.provider, ...vaultProviders] : vaultProviders),
    [demo, vaultProviders],
  );

  const broadcastModal = useBroadcastModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  const refundModal = useRefundModal({
    allActivities: activities,
    onSuccess: refetchActivities,
  });

  return {
    pendingActivities,
    expiredActivities,
    allActivities: activities,
    pendingPegins,
    vaultProviders: mergedVaultProviders,
    btcPublicKey,
    btcAddress,
    btcConnected,
    ethAddress,
    hasPendingDeposits: btcConnected && pendingActivities.length > 0,
    hasExpiredDeposits: btcConnected && expiredActivities.length > 0,
    refetchActivities,
    broadcastModal,
    refundModal,
  };
}
