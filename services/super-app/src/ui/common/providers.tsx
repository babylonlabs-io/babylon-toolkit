import { CoreUIProvider, ScrollLocker } from "@babylonlabs-io/core-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { Suspense, useEffect, useRef, useState } from "react";

import { PendingOperationsProvider } from "@services/simple-staking/ui/baby/hooks/services/usePendingOperationsService";
import { ErrorProvider } from "@services/simple-staking/ui/common/context/Error/ErrorProvider";
import { BbnRpcProvider } from "@services/simple-staking/ui/common/context/rpc/BbnRpcProvider";
import { BTCWalletProvider } from "@services/simple-staking/ui/common/context/wallet/BTCWalletProvider";
import { CosmosWalletProvider } from "@services/simple-staking/ui/common/context/wallet/CosmosWalletProvider";
import { WalletConnectionProvider } from "@services/simple-staking/ui/common/context/wallet/WalletConnectionProvider";
import { AppState } from "@services/simple-staking/ui/common/state";

function Providers({ children }: React.PropsWithChildren) {
    const [client] = useState(new QueryClient());
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
                                    <BbnRpcProvider>
                                        <WalletConnectionProvider>
                                            <BTCWalletProvider>
                                                <CosmosWalletProvider>
                                                    <PendingOperationsProvider>
                                                        <AppState>{children}</AppState>
                                                    </PendingOperationsProvider>
                                                </CosmosWalletProvider>
                                            </BTCWalletProvider>
                                        </WalletConnectionProvider>
                                    </BbnRpcProvider>
                                </ErrorProvider>
                                <ReactQueryDevtools
                                    buttonPosition="bottom-left"
                                    initialIsOpen={false}
                                />
                            </QueryClientProvider>
                        </div>
                    </CoreUIProvider>
                </ThemeProvider>
            </ScrollLocker>
        </Suspense>
    );
}

export default Providers;

