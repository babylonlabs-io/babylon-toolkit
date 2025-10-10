import { useEffect } from "react";
import { useAppKitAccount } from "@reown/appkit/react";
import { useChainConnector, type IWallet } from "@babylonlabs-io/wallet-connector";

const APPKIT_ETH_CONNECTOR_ID = "appkit-eth-connector";

/**
 * Bridge AppKit connection state with the ETH chain connector
 *
 * This hook syncs AppKit's connection/disconnection with the local ETH connector
 * in simple-staking, ensuring the wallet state is mirrored correctly.
 */
export const useEthConnectorBridge = () => {
    const { address, isConnected } = useAppKitAccount();
    const ethConnector = useChainConnector("ETH");

    useEffect(() => {
        if (!ethConnector) return;

        if (isConnected && address) {
            try {
                const isAppKitWalletConnected =
                    ethConnector.connectedWallet?.id === APPKIT_ETH_CONNECTOR_ID;
                const appkitWallet = ethConnector.wallets?.find(
                    (w: IWallet) => w.id === APPKIT_ETH_CONNECTOR_ID,
                );
                if (!isAppKitWalletConnected && appkitWallet) {
                    void ethConnector.connect(appkitWallet);
                }
            } catch {
                // Ignore connection errors
            }
        } else if (!isConnected && ethConnector?.connectedWallet) {
            void ethConnector.disconnect();
        }
    }, [isConnected, address, ethConnector]);
};

