import { CoreUIProvider, ScrollLocker } from "@babylonlabs-io/core-ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { Suspense, useEffect, useRef, useState } from "react";
import { WagmiProvider } from "wagmi";

import { NotificationContainer } from "@/components/shared/NotificationContainer";
import { createQueryClient } from "@/config/queryClient";
import { vaultWagmiConfig } from "@/config/wagmi";
import { ErrorProvider } from "@/context/error";
import { GeoFencingProvider } from "@/context/geofencing";
import { WalletConnectionProvider } from "@/context/wallet";
import { AppState } from "@/state/AppState";

function Providers({ children }: React.PropsWithChildren) {
  const [client] = useState(() => createQueryClient());
  const appRootRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );

  useEffect(() => {
    if (appRootRef.current) {
      setPortalContainer(appRootRef.current);
    }
  }, []);

  return (
    <Suspense>
      <ScrollLocker>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <CoreUIProvider portalContainer={portalContainer}>
            <div ref={appRootRef} className="min-h-screen">
              <QueryClientProvider client={client}>
                <ErrorProvider>
                  <GeoFencingProvider>
                    <WagmiProvider config={vaultWagmiConfig} reconnectOnMount>
                      <WalletConnectionProvider>
                        <AppState>{children}</AppState>
                      </WalletConnectionProvider>
                    </WagmiProvider>
                  </GeoFencingProvider>
                </ErrorProvider>
                <ReactQueryDevtools
                  buttonPosition="bottom-left"
                  initialIsOpen={false}
                />
              </QueryClientProvider>
              <NotificationContainer />
            </div>
          </CoreUIProvider>
        </ThemeProvider>
      </ScrollLocker>
    </Suspense>
  );
}

export default Providers;
