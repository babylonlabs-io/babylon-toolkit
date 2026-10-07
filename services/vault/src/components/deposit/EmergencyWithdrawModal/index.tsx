/**
 * EmergencyWithdrawModal — the activate-and-redeem escape hatch as a single
 * self-contained modal (RefundModal pattern): confirmation with an explicit
 * risk acknowledgment, in-place progress on the confirm button, then a
 * terminal success screen. Opened directly from a deposit row's Withdraw CTA
 * (stuck state) — never through the deposit multistepper.
 *
 * The reveal path is identical to normal activation: the secret is derived
 * from the BTC wallet (`deriveHtlcSecretHex`, on-chain inputs only, buffers
 * zero-wiped) and submitted via the activation state machine in
 * `redeemImmediately` mode, which re-validates `sha256(secret) === hashlock`
 * against the on-chain registry before any calldata is assembled.
 *
 * On a Ledger the derivation and the submission are two clicks: the
 * secret is retrieved on the Babylon Vault app and held
 * (`useStagedHtlcSecret`) until the depositor, having opened the Ethereum app
 * if their Ethereum account is on the same device, selects Continue.
 *
 * Ahead of the derivation, the confirm handler awaits the vault's application
 * registration status — the one registry precondition the confirm screen's
 * render-time gate cannot guarantee, because it reads the cache as it stood at
 * paint. See `useEnsureVaultApplicationActive`.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useActivationState } from "@/hooks/deposit/useActivationState";
import { useStagedHtlcSecret } from "@/hooks/deposit/useStagedHtlcSecret";
import { useBtcAction } from "@/hooks/useBtcAction";
import { useLedgerVaultDevice } from "@/hooks/useLedgerVaultDevice";
import { useEnsureVaultApplicationActive } from "@/hooks/useVaultApplicationActive";
import { logger } from "@/infrastructure";
import {
  captureFunnelFailure,
  TELEMETRY_STAGE,
} from "@/infrastructure/telemetryEvents";
import { deriveHtlcSecretHex } from "@/services/vault/htlcSecretDerivation";
import type { VaultActivity } from "@/types/activity";
import type { LedgerDeviceStep } from "@/types/ledgerDeviceStep";
import { postRegistrationWalletErrorMessage } from "@/utils/errors";
import { isDeviceDisconnectedError } from "@/utils/errors/deviceErrors";

import { EmergencyWithdrawConfirmContent } from "./EmergencyWithdrawConfirmContent";
import { EmergencyWithdrawSuccessContent } from "./EmergencyWithdrawSuccessContent";

interface EmergencyWithdrawModalProps {
  open: boolean;
  activity: VaultActivity;
  onClose: () => void;
  onSuccess: () => void;
}

export function EmergencyWithdrawModal({
  open,
  activity,
  onClose,
  onSuccess,
}: EmergencyWithdrawModalProps) {
  const { requireBtcWallet } = useBtcAction();
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;
  const { address: depositorEthAddress } = useETHWallet();
  const ensureApplicationActive = useEnsureVaultApplicationActive();
  const ledgerDevice = useLedgerVaultDevice();
  const btcWalletId = btcConnector?.connectedWallet?.id;
  const {
    isStaged: secretStaged,
    stage: stageSecret,
    take: takeStagedSecret,
    clear: clearStagedSecret,
  } = useStagedHtlcSecret(
    `${activity.id}|${connectedBtcAddress ?? ""}|${btcWalletId ?? ""}`,
  );

  // Derivation phase (wallet popup) — the submission phase is `activating`
  // from the activation state machine below.
  const [deriving, setDeriving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // The last attempt failed on a lost hardware-device session: the next
  // click reconnects the device before trying again.
  const [deviceDisconnected, setDeviceDisconnected] = useState(false);

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
    outcome,
    error: activationError,
    errorTerminal,
    handleActivation,
  } = useActivationState({
    activity,
    depositorEthAddress: depositorEthAddress ?? "",
    redeemImmediately: true,
  });

  const withdrawing = deriving || activating;

  // Second click of the Ledger split: the same hand-off as the one-click path,
  // behind the same pre-flight checks — Continue can come long after the
  // derive, and the Ethereum wallet or the application may have changed. The
  // ref guards a second click (of either button) that lands before the
  // re-render disables it: Continue would find the secret already taken, and
  // Confirm would start a second derive and hand-off.
  const actionInFlightRef = useRef(false);
  const handleContinue = useCallback(async () => {
    if (withdrawing || actionInFlightRef.current) return;
    if (!depositorEthAddress) {
      setLocalError(
        COPY.deposit.emergencyWithdraw.errors.ethWalletNotConnected,
      );
      return;
    }
    actionInFlightRef.current = true;
    setDeriving(true);
    setLocalError(null);
    try {
      // Same bare return as handleConfirm: the confirm screen's gate shows why.
      if ((await ensureApplicationActive(activity.id)) === false) return;
      await handleActivation(takeStagedSecret());
    } catch (err) {
      captureFunnelFailure(TELEMETRY_STAGE.ACTIVATION_SECRET, err, activity.id);
      if (mountedRef.current) {
        setLocalError(
          err instanceof Error
            ? err.message
            : COPY.deposit.emergencyWithdraw.errors.withdrawFailed,
        );
      }
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) setDeriving(false);
    }
  }, [
    withdrawing,
    depositorEthAddress,
    ensureApplicationActive,
    handleActivation,
    takeStagedSecret,
    activity.id,
  ]);

  const handleConfirm = useCallback(async () => {
    if (withdrawing || actionInFlightRef.current) return;
    clearStagedSecret();
    if (!depositorEthAddress) {
      setLocalError(
        COPY.deposit.emergencyWithdraw.errors.ethWalletNotConnected,
      );
      return;
    }
    actionInFlightRef.current = true;
    setDeriving(true);
    setLocalError(null);

    try {
      // First await of the click: the WebHID picker a reconnect may open
      // needs the click's user activation.
      if (deviceDisconnected) {
        try {
          await ledgerDevice.reconnect();
        } catch (reconnectError) {
          logger.warn("Ledger reconnect before emergency withdraw failed", {
            reason:
              reconnectError instanceof Error
                ? reconnectError.message
                : String(reconnectError),
          });
          setLocalError(COPY.deposit.ledger.reconnectFailed);
          return;
        }
        setDeviceDisconnected(false);
      }
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
      if (!requireBtcWallet()) {
        setLocalError(COPY.wallet.btcAction.error);
        return;
      }
      if (!btcWalletProvider || !connectedBtcAddress) {
        setLocalError(
          COPY.deposit.emergencyWithdraw.errors.btcWalletNotConnected,
        );
        return;
      }

      const secretHex = await deriveHtlcSecretHex({
        activity,
        btcWalletProvider,
        connectedBtcAddress,
        walletId: btcWalletId,
      });

      if (ledgerDevice.isLedgerVault) {
        stageSecret(secretHex);
        return;
      }
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
        const disconnected = isDeviceDisconnectedError(err);
        setDeviceDisconnected(disconnected);
        setLocalError(
          disconnected
            ? COPY.deposit.errors.deviceDisconnected.body
            : postRegistrationWalletErrorMessage(
                err,
                COPY.deposit.emergencyWithdraw.errors.withdrawFailed,
              ),
        );
      }
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) setDeriving(false);
    }
  }, [
    requireBtcWallet,
    withdrawing,
    activity,
    btcWalletProvider,
    connectedBtcAddress,
    depositorEthAddress,
    btcWalletId,
    ensureApplicationActive,
    handleActivation,
    ledgerDevice,
    deviceDisconnected,
    stageSecret,
    clearStagedSecret,
  ]);

  const handleClose = useCallback(() => {
    clearStagedSecret();
    onClose();
  }, [clearStagedSecret, onClose]);

  // A derive held for the vault app can be cancelled: the cancel button
  // ends the wait (the derive then rejects with the wrong-app outcome, so
  // the retry reads "open the app") instead of staying disabled on a dialog
  // waiting for the depositor.
  const awaitingAppName =
    deriving && ledgerDevice.appWait.status === "awaiting-app"
      ? ledgerDevice.appWait.expectedAppName
      : null;
  const ledgerStep = useMemo<LedgerDeviceStep | null>(
    () =>
      awaitingAppName !== null
        ? { kind: "awaiting-app", appName: awaitingAppName }
        : secretStaged && !withdrawing
          ? { kind: "awaiting-continue" }
          : deviceDisconnected && !withdrawing
            ? { kind: "reconnect-required" }
            : null,
    [awaitingAppName, secretStaged, withdrawing, deviceDisconnected],
  );

  // Fire onSuccess only after the user acknowledges the result so the parent
  // refetch doesn't race the success modal. Any outcome lands here: the escape
  // hatch always redeems, and this screen already says so.
  if (outcome !== null) {
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

  // A new attempt — a derive in flight or a staged secret — makes the previous
  // activation error stale (the activation state keeps it until the next
  // hand-off); a terminal one (deadline passed) still stands.
  const staleActivationError = (secretStaged || deriving) && !errorTerminal;
  const error = localError ?? (staleActivationError ? null : activationError);
  // Terminal only applies to the on-chain failure (deadline passed), never a
  // local pre-flight error — which localError would override via `??` above.
  const isTerminal = localError == null && errorTerminal;

  // Block close while the reveal is in flight to avoid dismissing the dialog
  // mid-signing; a held derive's cancel ends the wait instead.
  return (
    <V3ModalShell open={open} onClose={withdrawing ? undefined : handleClose}>
      <EmergencyWithdrawConfirmContent
        vaultId={activity.id}
        withdrawing={withdrawing}
        error={error}
        errorTerminal={isTerminal}
        onConfirm={secretStaged ? handleContinue : handleConfirm}
        onCancel={
          awaitingAppName !== null ? ledgerDevice.cancelAppWait : handleClose
        }
        ledgerStep={ledgerStep}
      />
    </V3ModalShell>
  );
}
