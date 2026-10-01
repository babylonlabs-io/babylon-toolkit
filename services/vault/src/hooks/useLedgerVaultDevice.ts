/**
 * Device state for the Ledger vault wallet: whether the BTC
 * wallet is the Ledger, whether a device operation is holding for the user to
 * open the vault app, and the two actions a depositor needs while it does —
 * cancel the wait, or reconnect a lost device session. Unmounting while a
 * wait is held cancels it.
 */

import {
  type DeviceAppState,
  useChainConnector,
} from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isLedgerVaultConnector } from "@/context/wallet/ledgerVaultConnector";
import { supportsCancelSigning } from "@/utils/cancelSigning";
import { observeDeviceAppState } from "@/utils/deviceAppWait";

const READY: DeviceAppState = { status: "ready" };

export interface LedgerVaultDevice {
  /** True when the connected BTC wallet is the Ledger vault app. */
  isLedgerVault: boolean;
  /** The device-app wait; `ready` for every other wallet. */
  appWait: DeviceAppState;
  /**
   * Ends a device-app wait. The held operation rejects with the wrong-app
   * outcome (DEVICE_WRONG_APP), since the device app was still not open.
   */
  cancelAppWait: () => void;
  /**
   * Re-opens the device session. MUST run inside a click handler: the WebHID
   * picker needs a user gesture.
   */
  reconnect: () => Promise<void>;
}

export function useLedgerVaultDevice(): LedgerVaultDevice {
  const btcConnector = useChainConnector("BTC");
  const isLedgerVault = isLedgerVaultConnector(btcConnector);
  const provider = btcConnector?.connectedWallet?.provider;
  const [appWait, setAppWait] = useState<DeviceAppState>(READY);

  useEffect(() => {
    setAppWait(READY);
    let awaiting = false;
    const stop = observeDeviceAppState(provider, (state) => {
      awaiting = state.status === "awaiting-app";
      setAppWait(state);
    });
    return () => {
      stop();
      // A held operation belongs to the view that shows it. Leaving that view
      // (closing the modal) must not leave the wait holding the device lock,
      // or every later device call fails as busy and a device prompt appears
      // for a flow nobody is watching once the app opens.
      if (awaiting && supportsCancelSigning(provider)) provider.cancelSigning();
    };
  }, [provider]);

  const cancelAppWait = useCallback(() => {
    if (supportsCancelSigning(provider)) provider.cancelSigning();
  }, [provider]);

  const reconnect = useCallback(async () => {
    if (!provider) {
      throw new Error("Cannot reconnect: no Bitcoin wallet is connected.");
    }
    await provider.connectWallet();
  }, [provider]);

  return useMemo(
    () => ({ isLedgerVault, appWait, cancelAppWait, reconnect }),
    [isLedgerVault, appWait, cancelAppWait, reconnect],
  );
}
