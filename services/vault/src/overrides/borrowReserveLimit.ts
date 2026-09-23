/**
 * God-mode override for the Spoke's borrow-reserve cap (dev / QA only).
 *
 * The cap is a Spoke immutable, so a tester cannot change it without a
 * redeploy — and the testnet spoke currently ships unlimited. Forcing it here
 * is how the single-borrow-asset surfaces (notices, greyed reserves, the
 * Borrowed Asset card) get exercised against a real position.
 */

import { createOverrideStore } from "./store";

const borrowReserveLimitOverrideStore = createOverrideStore<number>();

/** Force (a finite cap) or release (null) the borrow-reserve cap. */
export const useBorrowReserveLimitOverride =
  borrowReserveLimitOverrideStore.useValue;
export const setBorrowReserveLimitOverride =
  borrowReserveLimitOverrideStore.set;
