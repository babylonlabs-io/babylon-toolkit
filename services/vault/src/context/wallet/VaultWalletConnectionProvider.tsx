import { StandardSettingsMenu } from "@babylonlabs-io/core-ui";
import {
  APPKIT_BTC_CONNECTOR_ID,
  BTCWalletProvider,
  ETHWalletProvider,
  WalletProvider,
  createWalletConfig,
  useWalletConnect,
} from "@babylonlabs-io/wallet-connector";
import { useTheme } from "next-themes";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from "react";

import { getNetworkConfigBTC } from "@/config";
import featureFlags from "@/config/featureFlags";
import { getNetworkConfigETH } from "@/config/network";
import { logger } from "@/infrastructure";
import { isUserCancellation } from "@/utils/errors/userCancellation";

// Vault deposits need the BTC wallet's `deriveContextHash` (docs/specs/derive-context-hash.md).
// ALWAYS_DISABLED_WALLETS keeps non-conforming adapters (appkit/injectable/ledger) permanently out
// of the connect UI. Every other wallet is on by default; which ones are hidden per environment —
// experimental wallets not yet ready for production (onekey, utila) and any wallet we need to pull
// during an incident — is controlled entirely by NEXT_PUBLIC_TBV_DISABLED_BTC_WALLETS, so no code
// change or redeploy is needed to toggle one.
const ALWAYS_DISABLED_WALLETS: string[] = [
  APPKIT_BTC_CONNECTOR_ID,
  "injectable",
  "ledger_btc",
  "ledger_btc_v2",
];

const DISABLED_WALLETS: string[] = [
  ...ALWAYS_DISABLED_WALLETS,
  ...featureFlags.disabledBtcWallets,
];

const context = typeof window !== "undefined" ? window : {};

// The wallet dialog is a full-viewport overlay, so its close/settings buttons
// position with `fixed left`/`right`, not inside the page's 1080px content
// box. These match that box's edge (per Figma: both inset 236px on the 1512px
// reference frame — (1512-1080)/2 + 20px) so the buttons line up with the
// rest of the page on desktop.
const WALLET_DIALOG_LEFT_INSET_CLASS =
  "md:!left-[max(20px,calc((100vw-1080px)/2+20px))]";
const WALLET_DIALOG_RIGHT_INSET_CLASS =
  "md:!right-[max(20px,calc((100vw-1080px)/2+20px))]";

// UniSat and other late-injecting extensions can briefly report a disconnect
// while waking. Preserve the proven debounce/startup guard, but its terminal
// action is now BTC-only so an optional-chain failure cannot erase ETH.
const BTC_DISCONNECT_DEBOUNCE_MS = 3000;

/**
 * Component that keeps each wallet lifecycle isolated to its own chain.
 *
 * BTC is optional. Losing or changing that account must never tear down a live
 * Ethereum application session. Conversely, changing the required ETH account
 * must invalidate only its confirmed connector session while preserving BTC.
 */
function WalletProviders({ children }: PropsWithChildren) {
  const { disconnect } = useWalletConnect();
  const isClearingBtcRef = useRef(false);
  const hasBtcConnectedRef = useRef(false);
  const pendingBtcResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const clearBtcConnector = useCallback(async () => {
    if (isClearingBtcRef.current) return;
    isClearingBtcRef.current = true;
    try {
      await disconnect("BTC");
    } finally {
      isClearingBtcRef.current = false;
    }
  }, [disconnect]);

  const scheduleBtcReset = useCallback(() => {
    if (isClearingBtcRef.current || !hasBtcConnectedRef.current) return;
    if (pendingBtcResetRef.current !== undefined) {
      clearTimeout(pendingBtcResetRef.current);
    }
    pendingBtcResetRef.current = setTimeout(() => {
      pendingBtcResetRef.current = undefined;
      void clearBtcConnector();
    }, BTC_DISCONNECT_DEBOUNCE_MS);
  }, [clearBtcConnector]);

  const cancelBtcReset = useCallback(() => {
    hasBtcConnectedRef.current = true;
    if (pendingBtcResetRef.current === undefined) return;
    clearTimeout(pendingBtcResetRef.current);
    pendingBtcResetRef.current = undefined;
    logger.info(
      "Suppressed transient BTC disconnect (reconnect arrived within debounce)",
      { category: "Wallet connection" },
    );
  }, []);

  useEffect(
    () => () => {
      if (pendingBtcResetRef.current !== undefined) {
        clearTimeout(pendingBtcResetRef.current);
      }
    },
    [],
  );

  const btcCallbacks = useMemo(
    () => ({
      onConnect: cancelBtcReset,
      onDisconnect: scheduleBtcReset,
      // A different BTC account invalidates depositor ownership assumptions.
      // Clear only BTC so the next signing action asks for an explicit wallet
      // selection while the ETH application session remains intact.
      onAddressChange: clearBtcConnector,
    }),
    [cancelBtcReset, clearBtcConnector, scheduleBtcReset],
  );

  const ethCallbacks = useMemo(
    () => ({
      // The connector confirmation belongs to the selected ETH account. A raw
      // provider account switch must require confirmation again, without
      // discarding an independently connected optional BTC wallet.
      onAddressChange: () => disconnect("ETH"),
    }),
    [disconnect],
  );

  return (
    <BTCWalletProvider callbacks={btcCallbacks}>
      <ETHWalletProvider callbacks={ethCallbacks}>{children}</ETHWalletProvider>
    </BTCWalletProvider>
  );
}

/**
 * WalletConnectionProvider
 *
 * NOTE: AppKit modal initialization is now handled in @/config/wagmi.ts
 * to ensure wagmi config is created before the app renders.
 */
export const WalletConnectionProvider = ({ children }: PropsWithChildren) => {
  const { theme, setTheme } = useTheme();

  const config = useMemo(
    () =>
      createWalletConfig({
        chains: ["BTC", "ETH"],
        networkConfigs: {
          BTC: getNetworkConfigBTC(),
          ETH: getNetworkConfigETH(),
        },
        disableTomo: true,
      }),
    [],
  );

  const onError = useCallback((error: Error) => {
    // Declining or dismissing a wallet prompt is routine drop-off, not a fault.
    if (isUserCancellation(error)) {
      return;
    }
    logger.error(error, { data: { context: "Wallet connection error" } });
  }, []);

  return (
    <WalletProvider
      persistent
      theme={theme}
      config={config}
      context={context}
      onError={onError}
      disabledWallets={DISABLED_WALLETS}
      requiredChains={["ETH"]}
      disableTomo
      dialogActions={<StandardSettingsMenu theme={theme} setTheme={setTheme} />}
      dialogCloseButtonClassName={WALLET_DIALOG_LEFT_INSET_CLASS}
      dialogActionsClassName={WALLET_DIALOG_RIGHT_INSET_CLASS}
    >
      <WalletProviders>{children}</WalletProviders>
    </WalletProvider>
  );
};
