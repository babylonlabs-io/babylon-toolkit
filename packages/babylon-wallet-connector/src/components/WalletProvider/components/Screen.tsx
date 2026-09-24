import { type JSX } from "react";

import { ChainsContainer as Chains } from "@/components/Chains/container";
import { ErrorContainer as Error } from "@/components/Error/container";
import { LoaderScreen } from "@/components/Loader";
import { WalletsContainer as Wallets } from "@/components/Wallets/container";
import type { Screen } from "@/context/State.context";
import type { ChainId, IChain, IWallet } from "@/core/types";

interface ScreenProps {
  current: Screen;
  widgets?: Record<string, JSX.Element | undefined>;
  onSelectWallet?: (chain: IChain, wallet: IWallet) => void;
  onConfirm?: () => void;
  chainDescriptions?: Partial<Record<ChainId, string>>;
}

const SCREENS = {
  CHAINS: ({ onConfirm, chainDescriptions }: ScreenProps) => (
    <Chains onConfirm={onConfirm} chainDescriptions={chainDescriptions} />
  ),
  WALLETS: ({ widgets, onSelectWallet }: ScreenProps) => <Wallets widgets={widgets} onSelectWallet={onSelectWallet} />,
  LOADER: ({ current }: ScreenProps) => (
    <LoaderScreen title={current?.params?.message as string} description={current?.params?.description as string} />
  ),
  ERROR: () => <Error />,
  EMPTY: () => <div />,
} as const;

export function Screen(props: ScreenProps) {
  const CurrentScreen = SCREENS[props.current.type as keyof typeof SCREENS] ?? SCREENS.EMPTY;

  return <CurrentScreen {...props} />;
}
