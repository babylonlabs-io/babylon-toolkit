import { useEffect } from "react";
import { useAppKit } from "@reown/appkit/react";

/**
 * Listens for the custom "babylon:open-appkit" event and opens the AppKit modal
 *
 * This hook enables the wallet-connector library to trigger the AppKit modal
 * from the host application without direct coupling.
 */
export const useAppKitOpenListener = () => {
    const { open } = useAppKit();

    useEffect(() => {
        const handleOpenRequest = () => {
            open?.();
        };

        window.addEventListener("babylon:open-appkit", handleOpenRequest);
        return () => window.removeEventListener("babylon:open-appkit", handleOpenRequest);
    }, [open]);
};
