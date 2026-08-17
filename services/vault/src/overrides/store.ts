/**
 * Shared factory for the production-owned god-mode override seam
 * (dev / QA only — gated behind NEXT_PUBLIC_FF_GOD_MODE_PANEL).
 *
 * Each domain in `src/overrides/` builds its store from this factory, so the
 * god-mode flag is checked in exactly one place: here. No domain file
 * re-checks `featureFlags.isGodModePanelEnabled`.
 */

import { useSyncExternalStore } from "react";

import featureFlags from "@/config/featureFlags";

export interface OverrideStore<T> {
  /** Imperative, gated — read outside render (event handlers). */
  get(): T | null;
  /** Reactive, gated — useSyncExternalStore. */
  useValue(): T | null;
  /** Reference-guarded: setting an identical value is a no-op. */
  set(value: T | null): void;
}

export function createOverrideStore<T>(): OverrideStore<T> {
  let value: T | null = null;
  const listeners = new Set<() => void>();

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  // Never allocates a fresh object: the gate returns the stored reference
  // or null, so useSyncExternalStore never sees a "changed" snapshot from
  // the gate itself.
  function getSnapshot(): T | null {
    return featureFlags.isGodModePanelEnabled ? value : null;
  }

  return {
    get: getSnapshot,
    useValue(): T | null {
      return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    },
    set(next: T | null) {
      if (value === next) return;
      value = next;
      for (const listener of listeners) listener();
    },
  };
}
