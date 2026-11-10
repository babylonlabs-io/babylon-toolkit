/**
 * Sends `wallet_connected`, driven by the wallet connector's lifecycle
 * callbacks. State is held in memory for this page load only.
 *
 * `restored` tells a connection the user makes in the connect dialog (false)
 * from a session the app restores on its own (true), so a returning depositor
 * still sends one event that ties the visit to their address.
 *
 * - Bitcoin comes from the BTC provider's `onConnect`. The provider calls it
 *   more than once for one connection (again once its own address state
 *   settles, and after a brief disconnect), so a repeat of the address already
 *   sent is ignored until the app clears the Bitcoin session.
 * - Ethereum is sent when the app's session is confirmed, not from the ETH
 *   provider's `onConnect`. That callback fires when wagmi restores an account
 *   the app holds no session for, and always before the session is confirmed,
 *   so its event could not carry the address. The dialog's `onConfirm` marks
 *   the next confirmation as the user's; any other confirmation is a restore.
 */
import { ANALYTICS_EVENT } from "./analyticsEvents";
import { trackEvent } from "./trackEvent";

let userConfirmationPending = false;
let sentBtcAddress: string | null = null;

/**
 * The wallet dialog's `onConfirm`: the user confirmed the dialog, so the
 * session confirmation that follows is theirs. If that confirmation is then
 * abandoned, the mark carries over to the next one.
 */
export function markUserConfirmation(): void {
  userConfirmationPending = true;
}

/** The app's Ethereum session became confirmed. */
export function reportEthSessionConfirmed(): void {
  const restored = !userConfirmationPending;
  userConfirmationPending = false;
  trackEvent(ANALYTICS_EVENT.WALLET_CONNECTED, { chain: "eth", restored });
}

/**
 * The BTC provider's `onConnect`. `restored` is true when the connect dialog
 * is closed: the provider restored a saved session without the user.
 */
export function reportBtcConnected(address: string, restored: boolean): void {
  if (address === sentBtcAddress) return;
  sentBtcAddress = address;
  trackEvent(ANALYTICS_EVENT.WALLET_CONNECTED, { chain: "btc", restored });
}

/** The app cleared the Bitcoin session; the next connection is a new one. */
export function forgetBtcConnection(): void {
  sentBtcAddress = null;
}
