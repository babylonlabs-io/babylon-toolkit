import { useEffect } from "react";

import { getAppKitModal } from "@/core/wallets/appkit/appKitModal";
import { APPKIT_OPEN_EVENT } from "@/core/wallets/appkit/constants";

/**
 * Unified AppKit modal open listener
 *
 * Listens for AppKit open events and opens the unified AppKit modal.
 * Both ETH and BTC connectors dispatch the same event to open the modal.
 *
 * If AppKit modal is not initialized, the hook will silently ignore open requests.
 */
export const useAppKitOpenListener = () => {
  useEffect(() => {
    const handleOpenRequest = () => {
      try {
        const modal = getAppKitModal();

        if (modal) {
          modal.open();
        }
      } catch (error) {
        // AppKit not initialized or not available - log warning for diagnostics
        console.warn("AppKit modal not available:", error);
      }
    };

    window.addEventListener(APPKIT_OPEN_EVENT, handleOpenRequest);
    return () => window.removeEventListener(APPKIT_OPEN_EVENT, handleOpenRequest);
  }, []);
};
