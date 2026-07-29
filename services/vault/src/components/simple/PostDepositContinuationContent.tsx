/**
 * Scopes the post-deposit continuation view to one Pre-PegIn batch.
 *
 * Polling state comes from the app's single AppPeginPollingProvider — this
 * component used to mount a provider of its own, which meant an optimistic
 * completion recorded here landed in state the dashboard row behind it could
 * not read. `useVaultDeposits` stays for view scoping only; it shares the
 * address-keyed query entry, so it costs no extra fetch.
 */

import { useMemo } from "react";
import type { Address, Hex } from "viem";

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
  const { publicKey: btcPublicKey } = useBtcPublicKey(btcConnected);
  const { activities } = useVaultDeposits(depositorEthAddress);

  // God-mode demo aggregate (null in production). Its activities are never in
  // `useVaultDeposits` (never fetched), so merging them in for the viewed batch
  // is what lets PostDepositContinuationView find the demo VaultActivity and
  // mount the activation branch; the app provider resolves demo polling results
  // by id via `demo.resultsById`. Inert in production.
  const demo = useDemoDeposit();

  const scoped = useMemo(() => {
    const ids = new Set<string>(vaultIds);
    const demoActivities = demo
      ? demo.pendingActivities.filter((a) => ids.has(a.id))
      : [];
    const realActivities = activities.filter((a) => ids.has(a.id));
    return {
      // The view needs the demo VaultActivity to find it and mount the
      // activation branch. Demo activity ids can never collide with real ones
      // (distinct id space), so the concat introduces no duplicates. Demo
      // activities still never reach the polling provider — it is fed from
      // `useVaultDeposits` alone, which never contains them, so a simulated
      // ready-to-activate state cannot fire a real desktop notification.
      viewActivities: [...demoActivities, ...realActivities],
      demoVaultIds: new Set(demoActivities.map((a) => a.id)),
    };
  }, [vaultIds, activities, demo]);

  return (
    <>
      <ContinuationWarnings warnings={warnings} />
      <PostDepositContinuationView
        vaultIds={vaultIds}
        activities={scoped.viewActivities}
        depositorEthAddress={depositorEthAddress}
        btcPublicKey={btcPublicKey}
        demoVaultIds={scoped.demoVaultIds}
        onClose={onClose}
      />
    </>
  );
}
