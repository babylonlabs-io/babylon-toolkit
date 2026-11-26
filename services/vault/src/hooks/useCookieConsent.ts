import { useSyncExternalStore } from "react";

import {
  getCookieConsent,
  subscribeCookieConsent,
  type CookieConsent,
} from "@/storage/cookieConsentStorage";

/** The visitor's cookie consent, or null before they answer the banner. */
export function useCookieConsent(): CookieConsent | null {
  return useSyncExternalStore(subscribeCookieConsent, getCookieConsent);
}
