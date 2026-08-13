import type { createAppKit } from "@reown/appkit/react";

export type AppKitModal = ReturnType<typeof createAppKit>;

let appKitModal: AppKitModal | null = null;

/**
 * Get the AppKit modal instance (if initialized)
 * @returns The AppKit modal instance or null if not initialized
 */
export function getAppKitModal(): AppKitModal | null {
  return appKitModal;
}

export function setAppKitModal(modal: AppKitModal): void {
  appKitModal = modal;
}
