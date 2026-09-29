/**
 * Where a Ledger vault-wallet user is in a device operation that a modal is
 * showing. The states are mutually exclusive, so one value carries them:
 * - `awaiting-app`: an operation is held until the named device app is open
 *   (the modal shows the wait panel, and its cancel ends the wait);
 * - `awaiting-continue`: the HTLC secret was retrieved and the flow pauses for
 *   the depositor to open the Ethereum app, then select Continue;
 * - `reconnect-required`: the last attempt lost the device session, so the
 *   next click reconnects the device first.
 */
export type LedgerDeviceStep =
  | { readonly kind: "awaiting-app"; readonly appName: string }
  | { readonly kind: "awaiting-continue" }
  | { readonly kind: "reconnect-required" };
