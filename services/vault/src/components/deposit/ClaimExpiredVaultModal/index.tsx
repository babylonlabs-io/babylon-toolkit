/**
 * ClaimExpiredVaultModal — redeem an expired BTCVault whose deposit the PegIn
 * spent (`claimExpiredVault`), as a single self-contained modal: confirmation
 * with the grace-window deadline, in-place progress on the confirm button,
 * then a terminal success screen. Opened from the expired row's Redeem CTA.
 *
 * The secret is derived from the BTC wallet exactly as for activation
 * (`deriveHtlcSecretHex`: on-chain inputs only, buffers zero-wiped), then
 * handed to `useClaimExpiredVault`, which re-reads the vault, the window and
 * the Bitcoin spend and re-validates `sha256(secret) === hashlock` against the
 * on-chain registry before any calldata is assembled.
 *
 * On a Ledger the derivation and the submission are two clicks, as in the
 * withdraw modal: the secret is retrieved on the Babylon Vault app and held
 * (`useStagedHtlcSecret`) until the depositor, having opened the Ethereum app
 * if their Ethereum account is on the same device, selects Continue.
 */

import type { BitcoinWallet } from "@babylonlabs-io/ts-sdk/shared";
import { useChainConnector } from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { V3ModalShell } from "@/components/shared/V3ModalShell";
import { useDepositPollingResult } from "@/context/deposit/PeginPollingContext";
import { useETHWallet } from "@/context/wallet";
import { COPY } from "@/copy";
import { useClaimExpiredVault } from "@/hooks/deposit/useClaimExpiredVault";
import { useStagedHtlcSecret } from "@/hooks/deposit/useStagedHtlcSecret";
import { useBtcAction } from "@/hooks/useBtcAction";
import { useLedgerVaultDevice } from "@/hooks/useLedgerVaultDevice";
import { logger } from "@/infrastructure";
import {
  captureFunnelFailure,
  TELEMETRY_STAGE,
} from "@/infrastructure/telemetryEvents";
import { getClaimExpiredModalWindow } from "@/models/peginStateMachine";
import { deriveHtlcSecretHex } from "@/services/vault/htlcSecretDerivation";
import type { VaultActivity } from "@/types/activity";
import type { LedgerDeviceStep } from "@/types/ledgerDeviceStep";
import { postRegistrationWalletErrorMessage } from "@/utils/errors";
import { isDeviceDisconnectedError } from "@/utils/errors/deviceErrors";

import { ClaimExpiredVaultConfirmContent } from "./ClaimExpiredVaultConfirmContent";
import { ClaimExpiredVaultSuccessContent } from "./ClaimExpiredVaultSuccessContent";

interface ClaimExpiredVaultModalProps {
  open: boolean;
  activity: VaultActivity;
  onClose: () => void;
  onSuccess: () => void;
}

export function ClaimExpiredVaultModal({
  open,
  activity,
  onClose,
  onSuccess,
}: ClaimExpiredVaultModalProps) {
  const { requireBtcWallet } = useBtcAction();
  const btcConnector = useChainConnector("BTC");
  const btcWalletProvider =
    (btcConnector?.connectedWallet?.provider as BitcoinWallet | undefined) ??
    null;
  const connectedBtcAddress = btcConnector?.connectedWallet?.account?.address;
  const btcWalletId = btcConnector?.connectedWallet?.id;
  const { address: depositorEthAddress } = useETHWallet();
  const ledgerDevice = useLedgerVaultDevice();
  const claimWindow = getClaimExpiredModalWindow(
    useDepositPollingResult(activity.id)?.peginState,
  );
  const {
    isStaged: secretStaged,
    stage: stageSecret,
    take: takeStagedSecret,
    clear: clearStagedSecret,
  } = useStagedHtlcSecret(
    `${activity.id}|${connectedBtcAddress ?? ""}|${btcWalletId ?? ""}`,
  );

  // Derivation phase (wallet popup) — the submission phase is `submitting`
  // from the redeem hook below.
  const [deriving, setDeriving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // The last attempt failed on a lost hardware-device session: the next
  // click reconnects the device before trying again.
  const [deviceDisconnected, setDeviceDisconnected] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true; // reset on remount (StrictMode setup→cleanup→setup)
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    claiming: submitting,
    claimed,
    error: claimError,
    errorTerminal,
    handleClaim,
  } = useClaimExpiredVault({
    activity,
    depositorEthAddress: depositorEthAddress ?? "",
  });

  const claiming = deriving || submitting;
  const errors = COPY.deposit.claimExpired.errors;

  // Guards a second click (of either button) that lands before the re-render
  // disables it, as in the withdraw modal.
  const actionInFlightRef = useRef(false);

  // Second click of the Ledger split: hand the held secret to the redeem.
  const handleContinue = useCallback(async () => {
    if (claiming || actionInFlightRef.current) return;
    if (!depositorEthAddress) {
      setLocalError(errors.ethWalletNotConnected);
      return;
    }
    actionInFlightRef.current = true;
    setDeriving(true);
    setLocalError(null);
    try {
      await handleClaim(takeStagedSecret());
    } catch (err) {
      captureFunnelFailure(
        TELEMETRY_STAGE.EXPIRED_VAULT_REDEEM,
        err,
        activity.id,
      );
      if (mountedRef.current) {
        setLocalError(err instanceof Error ? err.message : errors.claimFailed);
      }
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) setDeriving(false);
    }
  }, [
    claiming,
    depositorEthAddress,
    errors,
    handleClaim,
    takeStagedSecret,
    activity.id,
  ]);

  const handleConfirm = useCallback(async () => {
    if (claiming || actionInFlightRef.current) return;
    clearStagedSecret();
    if (!depositorEthAddress) {
      setLocalError(errors.ethWalletNotConnected);
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
          logger.warn("Ledger reconnect before expired vault redeem failed", {
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
      if (!requireBtcWallet()) {
        setLocalError(COPY.wallet.btcAction.error);
        return;
      }
      if (!btcWalletProvider || !connectedBtcAddress) {
        setLocalError(errors.btcWalletNotConnected);
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
      await handleClaim(secretHex);
    } catch (err) {
      // The error message carries only tx hashes (regex-scrubbed) and
      // derivation errors, never secret bytes.
      captureFunnelFailure(
        TELEMETRY_STAGE.EXPIRED_VAULT_REDEEM,
        err,
        activity.id,
      );
      if (mountedRef.current) {
        const disconnected = isDeviceDisconnectedError(err);
        setDeviceDisconnected(disconnected);
        setLocalError(
          disconnected
            ? COPY.deposit.errors.deviceDisconnected.body
            : postRegistrationWalletErrorMessage(err, errors.claimFailed),
        );
      }
    } finally {
      actionInFlightRef.current = false;
      if (mountedRef.current) setDeriving(false);
    }
  }, [
    requireBtcWallet,
    claiming,
    activity,
    btcWalletProvider,
    connectedBtcAddress,
    depositorEthAddress,
    btcWalletId,
    errors,
    handleClaim,
    ledgerDevice,
    deviceDisconnected,
    stageSecret,
    clearStagedSecret,
  ]);

  const handleClose = useCallback(() => {
    clearStagedSecret();
    onClose();
  }, [clearStagedSecret, onClose]);

  const awaitingAppName =
    deriving && ledgerDevice.appWait.status === "awaiting-app"
      ? ledgerDevice.appWait.expectedAppName
      : null;
  const ledgerStep = useMemo<LedgerDeviceStep | null>(
    () =>
      awaitingAppName !== null
        ? { kind: "awaiting-app", appName: awaitingAppName }
        : secretStaged && !claiming
          ? { kind: "awaiting-continue" }
          : deviceDisconnected && !claiming
            ? { kind: "reconnect-required" }
            : null,
    [awaitingAppName, secretStaged, claiming, deviceDisconnected],
  );

  // Fire onSuccess only after the user acknowledges the result so the parent
  // refetch doesn't race the success screen.
  if (claimed) {
    const handleDone = () => {
      onSuccess();
      onClose();
    };
    return (
      <V3ModalShell open={open} onClose={handleDone}>
        <ClaimExpiredVaultSuccessContent onDone={handleDone} />
      </V3ModalShell>
    );
  }

  // A new attempt makes the previous redeem error stale; a terminal one still
  // stands.
  const staleClaimError = (secretStaged || deriving) && !errorTerminal;
  const error = localError ?? (staleClaimError ? null : claimError);
  const isTerminal = localError == null && errorTerminal;

  // Block close while the redeem is in flight; a held derive's cancel ends
  // the wait instead.
  return (
    <V3ModalShell open={open} onClose={claiming ? undefined : handleClose}>
      <ClaimExpiredVaultConfirmContent
        claimWindow={claimWindow}
        claiming={claiming}
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
