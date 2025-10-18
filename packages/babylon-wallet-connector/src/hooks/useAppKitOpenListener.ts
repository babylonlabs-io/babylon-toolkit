import { useEffect } from "react";
import { openAppKitModal, hasAppKitModal } from "@/core/wallets/eth/appkit/appKitModal";

/**
 * Listens for the custom "babylon:open-appkit" event and opens the AppKit modal
 *
 * This hook enables external code to trigger the AppKit modal opening
 * without direct coupling to the AppKit implementation.
 */
export const useAppKitOpenListener = () => {
    useEffect(() => {
        const handleOpenRequest = () => {
            if (hasAppKitModal()) {
                try {
                    openAppKitModal();
                } catch (error) {
                    console.error("Failed to open AppKit modal:", error);
                }
            } else {
                console.warn("AppKit modal not initialized. Cannot open modal.");
            }
        };

        window.addEventListener("babylon:open-appkit", handleOpenRequest);
        return () => window.removeEventListener("babylon:open-appkit", handleOpenRequest);
    }, []);
};
