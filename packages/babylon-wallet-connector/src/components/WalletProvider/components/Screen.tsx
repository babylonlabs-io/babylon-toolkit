import { type JSX } from "react";

import { ChainsContainer as Chains } from "@/components/Chains/container";
import { ErrorContainer as Error } from "@/components/Error/container";
import { InscriptionsContainer as Inscriptions } from "@/components/Inscriptions/container";
import { LoaderScreen } from "@/components/Loader";
import { TermsOfServiceContainer as TermsOfService } from "@/components/TermsOfService/container";
import { WalletsContainer as Wallets } from "@/components/Wallets/container";
import type { Screen } from "@/context/State.context";
import type { IChain, IWallet } from "@/core/types";

interface ScreenProps {
  className?: string;
  current: Screen;
  lockInscriptions?: boolean;
  widgets?: Record<string, JSX.Element | undefined>;
  onSelectWallet?: (chain: IChain, wallet: IWallet) => void;
  onDisconnectWallet?: (chainId: string) => void;
  onAccepTermsOfService?: () => void;
  onToggleInscriptions?: (value: boolean, showAgain: boolean) => void;
  onClose?: () => void;
  onConfirm?: () => void;
}

const SCREENS = {
  TERMS_OF_SERVICE: ({ className, onClose, onAccepTermsOfService }: ScreenProps) => (
    <TermsOfService className={className} onClose={onClose} onSubmit={onAccepTermsOfService} />
  ),
  CHAINS: ({ className, onClose, onConfirm, onDisconnectWallet }: ScreenProps) => (
    <Chains className={className} onClose={onClose} onConfirm={onConfirm} onDisconnectWallet={onDisconnectWallet} />
  ),
  WALLETS: ({ className, widgets, onClose, onSelectWallet }: ScreenProps) => (
    <Wallets widgets={widgets} className={className} onClose={onClose} onSelectWallet={onSelectWallet} />
  ),
  INSCRIPTIONS: ({ className, onToggleInscriptions }: ScreenProps) => (
    <Inscriptions className={className} onSubmit={onToggleInscriptions} />
  ),
  LOADER: ({ className, current }: ScreenProps) => (
    <LoaderScreen className={className} title={current?.params?.message as string} />
  ),
  ERROR: () => <Error className="min-h-0 md:w-[600px]" />,
  EMPTY: ({ className }: ScreenProps) => <div className={className} />,
} as const;

export function Screen(props: ScreenProps) {
  const CurrentScreen = SCREENS[props.current.type as keyof typeof SCREENS] ?? SCREENS.EMPTY;

  return <CurrentScreen {...props} />;
}
