/**
 * Cookie storage for the Ethereum wallet's connection state (wagmi), gated on
 * the visitor's cookie consent.
 *
 * The connection cookies are essential: they reconnect the wallet on the next
 * visit, so they are written before the visitor answers the banner and kept
 * for `all` and `essential`. On `denied` they are deleted, when the answer is
 * given and on every page load after it, and never written again; the wallet
 * then connects again on each visit.
 */
import { cookieStorage, type CreateStorageParameters } from "wagmi";

import {
  getCookieConsent,
  subscribeCookieConsent,
} from "@/storage/cookieConsentStorage";

type WalletCookieStorage = NonNullable<CreateStorageParameters["storage"]>;

/** wagmi's default key prefix, which `createStorage` puts before every key. */
const WALLET_COOKIE_PREFIX = "wagmi.";

const COOKIE_SEPARATOR = "; ";

function isDenied(): boolean {
  return getCookieConsent() === "denied";
}

export const walletCookieStorage: WalletCookieStorage = {
  getItem: (key) => (isDenied() ? null : cookieStorage.getItem(key)),
  setItem: (key, value) => {
    if (!isDenied()) cookieStorage.setItem(key, value);
  },
  removeItem: (key) => cookieStorage.removeItem(key),
};

function removeWalletCookies(): void {
  for (const pair of document.cookie.split(COOKIE_SEPARATOR)) {
    const name = pair.slice(0, pair.indexOf("="));
    if (name.startsWith(WALLET_COOKIE_PREFIX)) cookieStorage.removeItem(name);
  }
}

// On load too: a page opened with Deny already stored still holds the cookies
// written before it, or by a tab that ran an older build.
if (isDenied()) removeWalletCookies();
subscribeCookieConsent(() => {
  if (isDenied()) removeWalletCookies();
});
