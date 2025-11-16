import { useEffect } from "react";

import { getAppKitModal } from "@/core/wallets/appkit/appKitModal";

/**
 * Listens for the custom "babylon:open-appkit" event and opens the AppKit modal
 *
 * This hook enables external code to trigger the AppKit modal opening
 * without direct coupling to the AppKit implementation.
 *
 * If AppKit is not initialized, the hook will silently ignore open requests.
 */
export const useAppKitOpenListener = () => {
    useEffect(() => {
        const handleOpenRequest = () => {
            try {
                const modal = getAppKitModal();
                if (modal) {
                    modal.open();
                } else {
                    console.debug("AppKit modal not initialized");
                }
            } catch (error) {
                // AppKit not initialized or not available - silently ignore
                console.debug("AppKit modal not available:", error);
            }
        };

        window.addEventListener("babylon:open-appkit", handleOpenRequest);
        return () => window.removeEventListener("babylon:open-appkit", handleOpenRequest);
    }, []);
};