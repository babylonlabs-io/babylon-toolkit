/**
 * The application's single `PeginPollingProvider` mount.
 *
 * Every deposit surface reads its polling state from here: the v2 and v3
 * dashboard sections, and the deposit-flow modal's post-deposit continuation
 * view. Those three previously mounted providers of their own, two of which
 * nested — so an optimistic completion recorded inside the continuation modal
 * landed in state the dashboard row behind it could not read, and the row went
 * on offering an action the user had already performed.
 *
 * It must sit at this level and not inside the router: `RootLayout` renders
 * `<Outlet>` and `<SimpleDeposit>` as siblings, so a provider mounted on any
 * route would miss the deposit flow entirely.
 *
 * Composition only — it owns no logic beyond sourcing the provider's inputs,
 * which keeps the VP service layer out of `RootLayout`'s module graph and
 * gives the topology tests something mountable.
 */

import type { PropsWithChildren } from "react";
import type { Address } from "viem";

import { useBTCWallet, useETHWallet } from "@/context/wallet";
import { useBtcPublicKey } from "@/hooks/useBtcPublicKey";
import { useVaultDeposits } from "@/hooks/useVaultDeposits";

import { PeginPollingProvider } from "./PeginPollingContext";

export function AppPeginPollingProvider({ children }: PropsWithChildren) {
  const { connected: btcConnected } = useBTCWallet();
  const { address: ethAddress } = useETHWallet();
  const { publicKey: btcPublicKey } = useBtcPublicKey(btcConnected);
  // Shares the address-keyed React Query entry with every other
  // `useVaultDeposits` caller, so mounting app-wide adds no extra fetch.
  const { activities, pendingPegins } = useVaultDeposits(
    ethAddress as Address | undefined,
  );

  return (
    <PeginPollingProvider
      activities={activities}
      pendingPegins={pendingPegins}
      btcPublicKey={btcPublicKey}
    >
      {children}
    </PeginPollingProvider>
  );
}
