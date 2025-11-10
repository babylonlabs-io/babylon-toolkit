import { useEffect } from "react";

import { openAppKitBtcModal, hasAppKitBtcModal } from "@/core/wallets/btc/appkit/appKitBtcModal";

/**
 * Listens for the custom "babylon:open-appkit-btc" event and opens the AppKit BTC modal
 *
 * This hook enables external code to trigger the AppKit Bitcoin modal opening
 * without direct coupling to the AppKit implementation.
 */
export const useAppKitBtcOpenListener = () => {
  useEffect(() => {
    const handleOpenRequest = () => {
      if (hasAppKitBtcModal()) {
        try {
          openAppKitBtcModal();
        } catch (error) {
          console.error("Failed to open AppKit BTC modal:", error);
        }
      } else {
        console.warn("AppKit BTC modal not initialized. Cannot open modal.");
      }
    };

    window.addEventListener("babylon:open-appkit-btc", handleOpenRequest);
    return () => window.removeEventListener("babylon:open-appkit-btc", handleOpenRequest);
  }, []);
};
