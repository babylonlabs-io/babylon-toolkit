import type { IChain, IWallet } from "@/core/types";
import { useWidgetState } from "@/hooks/useWidgetState";

import { ConnectGuide } from "./index";

interface ConnectGuideContainerProps {
  onConnect?: (chain: IChain, wallet: IWallet) => void;
}

export function ConnectGuideContainer({ onConnect }: ConnectGuideContainerProps) {
  const { chains, screen } = useWidgetState();
  const chain = chains[screen.params?.chain ?? ""];
  const wallet = chain?.wallets.find(({ id }) => id === screen.params?.wallet);

  if (!chain || !wallet?.connectGuide) return null;

  return (
    <ConnectGuide
      name={wallet.name}
      logo={wallet.icon}
      logoBackground={wallet.iconBackground}
      guide={wallet.connectGuide}
      onConnect={() => onConnect?.(chain, wallet)}
    />
  );
}
