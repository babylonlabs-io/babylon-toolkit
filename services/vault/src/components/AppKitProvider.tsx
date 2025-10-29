import {
  getAppKitWagmiConfig,
  hasAppKitModal,
} from "@babylonlabs-io/wallet-connector";
import { useEffect, useState, type PropsWithChildren } from "react";
import { WagmiProvider } from "wagmi";

/**
 * AppKitProvider wraps the app with WagmiProvider using the wagmi config from AppKit
 * This enables wallet reconnection on page reload
 */
export const AppKitProvider = ({ children }: PropsWithChildren) => {
  const [wagmiConfig, setWagmiConfig] = useState<ReturnType<
    typeof getAppKitWagmiConfig
  > | null>(null);

  useEffect(() => {
    // Wait for AppKit to be initialized
    if (hasAppKitModal()) {
      try {
        const config = getAppKitWagmiConfig();
        setWagmiConfig(config);
      } catch (error) {
        console.warn("Failed to get AppKit wagmi config:", error);
      }
    } else {
      // Poll until AppKit is initialized (with timeout)
      let attempts = 0;
      const maxAttempts = 10;
      const interval = setInterval(() => {
        attempts++;
        if (hasAppKitModal()) {
          try {
            const config = getAppKitWagmiConfig();
            setWagmiConfig(config);
            clearInterval(interval);
          } catch (error) {
            console.warn("Failed to get AppKit wagmi config:", error);
          }
        } else if (attempts >= maxAttempts) {
          console.warn(
            "AppKit not initialized after multiple attempts, wallet reconnection may not work",
          );
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, []);

  // Render without WagmiProvider until wagmiConfig is available
  if (!wagmiConfig) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      {children}
    </WagmiProvider>
  );
};
