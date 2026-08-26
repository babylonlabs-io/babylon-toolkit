/**
 * EmergencyWithdrawModal — the activate-and-redeem escape hatch as a single
 * self-contained modal (RefundModal pattern): confirmation with an explicit
 * risk acknowledgment, in-place progress on the confirm button, then a
 * terminal success screen. Opened directly from a deposit row's Withdraw CTA
 * (stuck state) or the activation dialog's advanced link — never through the
 * deposit multistepper.
 *
 * The reveal path is identical to normal activation: the secret is derived
 * from the BTC wallet (`deriveHtlcSecretHex`, on-chain inputs only, buffers
 * zero-wiped) and submitted via the activation state machine in
 * `redeemImmediately` mode, which re-validates `sha256(secret) === hashlock`
 * against the on-chain registry before any calldata is assembled.
 *
 * Ahead of the derivation, the confirm handler awaits the vault's application
 * registration status — the one registry precondition the confirm screen's
 * render-time gate cannot guarantee, because it reads the cache as it stood at
 * paint. See `useEnsureVaultApplicationActive`.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef, useState } from "react";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useActivationState } from "@/hooks/deposit/useActivationState";
import { useEnsureVaultApplicationActive } from "@/hooks/useVaultApplicationActive";
import {
  captureFunnelFailure,
  TELEMETRY_STAGE,
} from "@/infrastructure/telemetryEvents";
import { deriveHtlcSecretHex } from "@/services/vault/htlcSecretDerivation";
import type { VaultActivity } from "@/types/activity";

import { EmergencyWithdrawConfirmContent } from "./EmergencyWithdrawConfirmContent";
import { EmergencyWithdrawSuccessContent } from "./EmergencyWithdrawSuccessContent";

interface EmergencyWithdrawModalProps {
  open: boolean;
  activity: VaultActivity;
  /** True when the stuck state was detected on-chain — drives the body copy. */
  stuckStateDetected: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function EmergencyWithdrawModal({
  open,
  activity,
  stuckStateDetected,
  onClose,
  onSuccess,
}: EmergencyWithdrawModalProps) {
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;
  const { address: depositorEthAddress } = useETHWallet();
  const ensureApplicationActive = useEnsureVaultApplicationActive();

  // Derivation phase (wallet popup) — the submission phase is `activating`
  // from the activation state machine below.
  const [deriving, setDeriving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Track mount for setState guards after the long async chain below — the
  // hosting section can unmount mid-flight.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // reset on remount (StrictMode setup→cleanup→setup)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    activating,
    activated,
    error: activationError,
    errorTerminal,
    handleActivation,
  } = useActivationState({
    activity,
    depositorEthAddress: depositorEthAddress ?? "",
    redeemImmediately: true,
  });

  const withdrawing = deriving || activating;

  const handleConfirm = useCallback(async () => {
    if (withdrawing) return;
    if (!btcWalletProvider || !connectedBtcAddress) {
      setLocalError(
        COPY.deposit.emergencyWithdraw.errors.btcWalletNotConnected,
      );
      return;
    }
    if (!depositorEthAddress) {
      setLocalError(
        COPY.deposit.emergencyWithdraw.errors.ethWalletNotConnected,
      );
      return;
    }
    setDeriving(true);
    setLocalError(null);

    try {
      // Resolve the application registration BEFORE the wallet popup. The
      // confirm screen's own check reads whatever was cached at paint, which is
      // `undefined` for the whole first round-trip after the modal mounts — so
      // on its own it lets a fast click derive the secret for a redeem the
      // registry would reject. Fail-open is unchanged: only a CONFIRMED
      // non-Active status stops here, and `executeWrite`'s mandatory
      // pre-broadcast simulation remains the backstop for every other case.
      //
      // A bare return suffices: resolving populates the same cache entry the
      // confirm screen reads, so that gate re-renders with the explanation and
      // the button disabled. Setting `localError` would print it twice.
      if ((await ensureApplicationActive(activity.id)) === false) return;

      const secretHex = await deriveHtlcSecretHex({
        activity,
        btcWalletProvider,
        connectedBtcAddress,
        walletId: btcConnector?.connectedWallet?.id,
      });

      // Hand off to the activation state machine in escape-hatch mode. It
      // fetches the canonical hashlock from the on-chain registry and
      // rejects any mismatch — wrong-wallet derivation surfaces as a
      // structured error there, not a silent submission.
      await handleActivation(secretHex);
    } catch (err) {
      // Capture regardless of mount (no abort signal on this flow). The error
      // message carries only tx hashes (regex-scrubbed) and derivation errors,
      // never secret bytes. Only the UI update below is mount-gated.
      captureFunnelFailure(TELEMETRY_STAGE.ACTIVATION_SECRET, err, activity.id);
      if (mountedRef.current) {
        const msg =
          err instanceof Error
            ? err.message
            : COPY.deposit.emergencyWithdraw.errors.withdrawFailed;
        setLocalError(msg);
      }
    } finally {
      if (mountedRef.current) setDeriving(false);
    }
  }, [
    withdrawing,
    activity,
    btcWalletProvider,
    connectedBtcAddress,
    depositorEthAddress,
    btcConnector?.connectedWallet?.id,
    ensureApplicationActive,
    handleActivation,
  ]);

  // Fire onSuccess only after the user acknowledges the result so the parent
  // refetch doesn't race the success modal.
  if (activated) {
    const handleDone = () => {
      onSuccess();
      onClose();
    };
    return (
      <V3ModalShell open={open} onClose={handleDone}>
        <EmergencyWithdrawSuccessContent onDone={handleDone} />
      </V3ModalShell>
    );
  }

  const error = localError ?? activationError;
  // Terminal only applies to the on-chain failure (deadline passed), never a
  // local pre-flight error — which localError would override via `??` above.
  const isTerminal = localError == null && errorTerminal;

  // Block close while the reveal is in flight to avoid dismissing the dialog
  // mid-signing.
  return (
    <V3ModalShell open={open} onClose={withdrawing ? undefined : onClose}>
      <EmergencyWithdrawConfirmContent
        stuckStateDetected={stuckStateDetected}
        vaultId={activity.id}
        withdrawing={withdrawing}
        error={error}
        errorTerminal={isTerminal}
        onConfirm={handleConfirm}
        onCancel={onClose}
      />
    </V3ModalShell>
  );
}
