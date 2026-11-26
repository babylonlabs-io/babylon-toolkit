/**
 * The vault provider a visitor arrived for through a vault provider link
 * (`?vp=`, read at startup by `captureReferredVaultProvider`).
 *
 * The deposit form pins this provider to the top of its picker and preselects
 * it while nothing is selected. Kept in localStorage so it survives a reload
 * and reaches every tab; a change made in another tab arrives through the
 * `storage` event. It applies for {@link REFERRAL_TTL_MS} after the visitor
 * last landed through a link, a newer link replaces it, and it is cleared when
 * the visitor starts a deposit with a different provider. A wallet disconnect
 * or switch leaves it: it belongs to the browser, not to a wallet.
 *
 * Untrusted, like everything in localStorage: only a versioned record holding
 * an address and a timestamp is accepted. The address only reorders and
 * preselects among the providers the picker already lists, so nothing
 * security-relevant reads it; the chosen provider is validated at submit like
 * any other choice.
 *
 * Not namespaced by network: each deployment is its own origin, and an address
 * from another network matches no listed provider. Not gated by cookie
 * consent: it is a functional preference that never leaves the browser.
 */

import { isAddress } from "viem";

const STORAGE_KEY = "tbv-referred-vault-provider";
const RECORD_VERSION = 1;

/** How long a link keeps applying after the visitor last landed through it. */
const REFERRAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface ReferralRecord {
  /** Lowercase, the form provider ids are compared in. */
  address: string;
  /** When the visitor last landed through a link, in epoch milliseconds. */
  savedAt: number;
}

function load(): ReferralRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const record: unknown = JSON.parse(raw);
    if (typeof record !== "object" || record === null) return null;
    if (Reflect.get(record, "version") !== RECORD_VERSION) return null;
    const address: unknown = Reflect.get(record, "address");
    const savedAt: unknown = Reflect.get(record, "savedAt");
    if (typeof address !== "string" || !isAddress(address, { strict: false })) {
      return null;
    }
    if (typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
    return { address: address.toLowerCase(), savedAt };
  } catch {
    return null;
  }
}

let current: ReferralRecord | null = load();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/**
 * The referred provider's address in lowercase, or null when there is none or
 * it has expired. Checked on every read, so a tab left open past the expiry
 * stops applying it. A timestamp in the future (a clock set back since) counts
 * as expired.
 */
export function getReferredVaultProvider(): string | null {
  if (current === null) return null;
  const age = Date.now() - current.savedAt;
  return age >= 0 && age < REFERRAL_TTL_MS ? current.address : null;
}

/** Store the provider a link named, replacing any earlier one. */
export function setReferredVaultProvider(address: string): void {
  current = { address: address.toLowerCase(), savedAt: Date.now() };
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: RECORD_VERSION, ...current }),
    );
  } catch {
    // Quota / disabled: the link still applies for this visit. Drop any older
    // record, or a reload would bring back the provider this link replaced.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* disabled storage - nothing was stored to remove */
    }
  }
  notify();
}

/**
 * Clear the referral when the visitor starts a deposit with a provider other
 * than the referred one: they have chosen. Kept when they deposit with the
 * referred provider, so their next deposit is preselected again.
 */
export function clearReferredVaultProviderIfOther(
  selectedProviderId: string,
): void {
  if (current === null) return;
  if (current.address === selectedProviderId.toLowerCase()) return;
  current = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* disabled storage - nothing was stored to remove */
  }
  notify();
}

// `key` is null when another tab clears all of the origin's storage.
window.addEventListener("storage", (event) => {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  current = load();
  notify();
});

export function subscribeReferredVaultProvider(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
