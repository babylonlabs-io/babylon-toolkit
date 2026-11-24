/**
 * The visitor's answer to the cookie consent banner.
 *
 * - `all`: analytics runs and the wallet keeps its connection cookies.
 * - `essential`: no analytics; the wallet keeps its connection cookies.
 * - `denied`: no analytics and no cookies, the wallet's included.
 *
 * Kept in localStorage, not in a cookie: consent covers cookies only, and the
 * answer must outlive a `denied`. Not namespaced by network: it belongs to the
 * browser, not to a chain. No record, an unknown version or unreadable storage
 * all mean the visitor has not answered, so analytics stays off. An answer
 * given in another tab arrives through the `storage` event, so every open tab
 * follows it.
 */

export type CookieConsent = "all" | "essential" | "denied";

const STORAGE_KEY = "tbv-cookie-consent";
const RECORD_VERSION = 1;
const CONSENT_VALUES: readonly CookieConsent[] = ["all", "essential", "denied"];

function load(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const record: unknown = JSON.parse(raw);
    if (typeof record !== "object" || record === null) return null;
    if (Reflect.get(record, "version") !== RECORD_VERSION) return null;
    const choice: unknown = Reflect.get(record, "choice");
    return CONSENT_VALUES.find((value) => value === choice) ?? null;
  } catch {
    return null;
  }
}

let current: CookieConsent | null = load();
const listeners = new Set<() => void>();

/** The visitor's answer, or null when they have not answered. */
export function getCookieConsent(): CookieConsent | null {
  return current;
}

export function setCookieConsent(choice: CookieConsent): void {
  current = choice;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: RECORD_VERSION, choice }),
    );
  } catch {
    /* quota / disabled - the answer still holds for this visit */
  }
  listeners.forEach((listener) => listener());
}

// `key` is null when another tab clears all of the origin's storage.
window.addEventListener("storage", (event) => {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  current = load();
  listeners.forEach((listener) => listener());
});

export function subscribeCookieConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
