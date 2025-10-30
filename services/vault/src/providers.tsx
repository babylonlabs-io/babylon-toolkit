import { CoreUIProvider, ScrollLocker } from "@babylonlabs-io/core-ui";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { Suspense, useEffect, useRef, useState } from "react";

import { createQueryClient } from "@/config/queryClient";
import { NotificationContainer } from "@/components/NotificationContainer";
import { VaultWalletConnectionProvider } from "@/context/wallet";
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
                <VaultWalletConnectionProvider>
                  <AppState>{children}</AppState>
                </VaultWalletConnectionProvider>
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
