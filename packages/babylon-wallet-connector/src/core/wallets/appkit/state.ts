import type { createAppKit } from "@reown/appkit/react";

export type AppKitModal = ReturnType<typeof createAppKit>;

/**
 * AppKit allows one modal instance per page. The instance is held here rather
 * than in either initializer so the unified (ETH+BTC) and Ethereum-only setups
 * observe the same singleton without the Ethereum-only one having to import
 * the Bitcoin adapter through its sibling.
 */
let appKitModal: AppKitModal | null = null;

export function getAppKitModal(): AppKitModal | null {
  return appKitModal;
}

export function setAppKitModal(modal: AppKitModal): void {
  appKitModal = modal;
}
