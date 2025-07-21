import { type JSX } from "react";

import type { IChain, IWallet } from "@/core/types";
import { useWidgetState } from "@/hooks/useWidgetState";

import { Wallets } from "./index";

interface WalletContainerProps {
  widgets?: Record<string, JSX.Element | undefined>;
  className?: string;
  onClose?: () => void;
  append?: JSX.Element;
  onSelectWallet?: (chain: IChain, wallet: IWallet) => void;
}

export function WalletsContainer({ widgets = {}, ...props }: WalletContainerProps) {
  const { chains, screen, displayChains } = useWidgetState();
  const chainId = screen.params?.chain ?? "";
  const currentChain = chains?.[chainId];
  const widget = widgets?.[chainId];

  return <Wallets append={widget} chain={currentChain} onBack={displayChains} {...props} />;
}
