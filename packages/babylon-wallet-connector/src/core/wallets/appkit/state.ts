import type { createAppKit } from "@reown/appkit/react";

export type AppKitModal = ReturnType<typeof createAppKit>;

let appKitModal: AppKitModal | null = null;

export function getAppKitModal(): AppKitModal | null {
  return appKitModal;
}

export function setAppKitModal(modal: AppKitModal): void {
  appKitModal = modal;
}
