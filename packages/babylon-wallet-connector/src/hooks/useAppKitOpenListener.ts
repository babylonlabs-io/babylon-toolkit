import { useAppKit } from "@reown/appkit/react";
import { useEffect } from "react";

/**
 * Listens for the custom "babylon:open-appkit" event and opens the AppKit modal
 *
 * This hook enables external code to trigger the AppKit modal opening
 * without direct coupling to the AppKit implementation.
 */
export const useAppKitOpenListener = () => {
    const { open } = useAppKit();

    useEffect(() => {
        const handleOpenRequest = () => {
            try {
                open();
            } catch (error) {
                console.error("Failed to open AppKit modal:", error);
            }
        };

        window.addEventListener("babylon:open-appkit", handleOpenRequest);
        return () => window.removeEventListener("babylon:open-appkit", handleOpenRequest);
    }, [open]);
};