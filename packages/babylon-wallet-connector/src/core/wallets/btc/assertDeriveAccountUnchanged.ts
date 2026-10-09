/**
 * Post-call account check for BTC adapters that forward `deriveContextHash`
 * to a browser extension.
 *
 * These adapters answer `getPublicKeyHex()` from the identity cached at
 * connect, while the extension derives under whichever account is selected
 * when it runs. The output does not show which account that was, so an
 * account switch during the approval popup would hand the caller a value
 * bound to a key it never saw. Run this after the extension resolves and
 * before the value is returned.
 */

import { ERROR_CODES, WalletError } from "@/error";

export interface LiveBtcIdentity {
  address: string | undefined;
  publicKeyHex: string | undefined;
}

export interface DeriveAccountCheck {
  walletName: string;
  /** Cached key the adapter reported when the derive started. */
  expectedPublicKeyHex: string;
  /** Identity-event counter value when the derive started. */
  identityVersionAtStart: number;
  currentIdentityVersion: () => number;
  /** Non-interactive read of the account the extension has selected now. */
  readLiveIdentity: () => Promise<LiveBtcIdentity>;
}

/**
 * Throws {@link ERROR_CODES.WALLET_ACCOUNT_CHANGED} unless no identity event
 * fired since the derive started and the extension still has the expected
 * key selected. Strict on events: an account, network or disconnect event
 * during the derive leaves the derivation account unknown, so the result is
 * refused even if the expected key is selected again by the time it is read.
 * The counter only moves for a wallet whose provider reports those events.
 * Without an event, the live key read is the whole check: it shows only the
 * account selected now, so a switch away and back before the read, or a
 * network switch that keeps the same key, goes unnoticed. Only a wallet that
 * attests the key it derived under can close that.
 */
export async function assertDeriveAccountUnchanged(check: DeriveAccountCheck): Promise<void> {
  const noIdentityEvent = () => check.currentIdentityVersion() === check.identityVersionAtStart;

  if (noIdentityEvent()) {
    const live = await check.readLiveIdentity();
    if (noIdentityEvent() && live.address && live.publicKeyHex?.toLowerCase() === check.expectedPublicKeyHex.toLowerCase()) {
      return;
    }
  }

  throw new WalletError({
    code: ERROR_CODES.WALLET_ACCOUNT_CHANGED,
    message: `${check.walletName} wallet account or network changed while deriving the context hash. Switch back to the connected account and network, then try again.`,
    wallet: check.walletName,
  });
}
