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

// Vault deposits require the connected BTC wallet to implement the
// `deriveContextHash` API (see docs/specs/derive-context-hash.md). Only
// UniSat exposes a conformant implementation today, so every other BTC
// adapter is gated off here. Re-enable an entry as soon as its wallet
// vendor ships `deriveContextHash`. Each non-conforming adapter still
// throws `WALLET_METHOD_NOT_SUPPORTED` at the connector layer; this
// list just keeps them out of the connection UI in the first place so
// users don't pick something that can't complete a deposit.
const DISABLED_WALLETS: string[] = [
  APPKIT_BTC_CONNECTOR_ID,
  "injectable",
  "keystone",
  "ledger_btc",
  "ledger_btc_v2",
  "okx",
  "onekey",
];

const context = typeof window !== "undefined" ? window : {};

// A late-injecting BTC extension (e.g. UniSat) can emit a transient `disconnect`
// while its service worker wakes right after a page (re)load, then immediately
// reconnect. That blip is the only thing distinguishing it from a real
// disconnect: a genuine disconnect is NOT followed by a reconnect. So instead of
// reacting to a BTC disconnect immediately (which calls `disconnectAll()` and
// wipes the persisted session for BOTH wallets), we wait this long; if a
// reconnect arrives within the window we cancel, otherwise the disconnect is
// real and we proceed. A real disconnect is therefore honoured, just delayed by
// this bounded amount — never dropped.
//
// The window has to outlast a slow Unisat wake-up + auto-reconnect handshake
// (which is fire-and-forget on reload and can take up to the provider's RPC
// timeout). 1500ms was shorter than that handshake, so a slow extension wake
// was being treated as a real disconnect and wiped both wallets. The
// `hasBtcConnectedRef` gate (below) is the primary guard against startup blips;
// this debounce + cancelBtcReset cover post-connect wake-up blips.
const BTC_DISCONNECT_DEBOUNCE_MS = 3000;

/**
 * Component that provides wallet-specific providers with cross-disconnect logic
 */
function WalletProviders({ children }: PropsWithChildren) {
  const { disconnect: disconnectAll } = useWalletConnect();
  // Guard against re-entrancy when disconnectAll triggers disconnect events
  const isDisconnectingRef = useRef(false);
  // Whether BTC has successfully connected at least once this session. A
  // disconnect before the first successful connect is, by definition, a
  // startup/reconnect blip — there is no live session to tear down — so we
  // never escalate it to disconnectAll() (which would wipe BOTH wallets).
  const hasBtcConnectedRef = useRef(false);
  // Pending debounced BTC reset (see BTC_DISCONNECT_DEBOUNCE_MS).
  const pendingBtcResetRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Disconnect every wallet. Used directly for events that are unambiguous
  // (account switch, ETH disconnect) and as the deferred action for the
  // debounced BTC disconnect path.
  const runWalletReset = useCallback(async () => {
    if (isDisconnectingRef.current) return;
    isDisconnectingRef.current = true;
    try {
      await disconnectAll?.();
    } finally {
      isDisconnectingRef.current = false;
    }
  }, [disconnectAll]);

  // BTC disconnected — but it might be a transient wake-up blip. Defer the
  // cascade; a reconnect within the debounce window cancels it (see
  // cancelBtcReset). No-op while a teardown is already running so the disconnect
  // events disconnectAll() itself emits don't re-arm the timer.
  const scheduleBtcReset = useCallback(() => {
    if (isDisconnectingRef.current) return;
    // A disconnect before BTC ever finished connecting this session is a
    // startup/reconnect blip, not a real disconnect — there is no live session
    // to tear down. Escalating it would wipe the persisted session for BOTH
    // wallets (including ETH) over a wallet that simply hasn't woken up yet.
    if (!hasBtcConnectedRef.current) return;
    if (pendingBtcResetRef.current !== undefined)
      clearTimeout(pendingBtcResetRef.current);
    pendingBtcResetRef.current = setTimeout(() => {
      pendingBtcResetRef.current = undefined;
      // A reconnect within the window cancels this timer via cancelBtcReset
      // (fired from the provider's onConnect). If we get here, no reconnect
      // arrived — treat it as a real disconnect. We deliberately do NOT consult
      // the connector's `connectedWallet` as a liveness signal: an
      // extension-initiated disconnect tears down BTCWalletProvider without
      // calling connector.disconnect(), so `connectedWallet` stays stale-set
      // and would wrongly suppress a genuine disconnect.
      void runWalletReset();
    }, BTC_DISCONNECT_DEBOUNCE_MS);
  }, [runWalletReset]);

  // BTC (re)connected. Mark the session as having connected at least once, and
  // if a reset is pending, the preceding disconnect was a transient blip —
  // cancel it and keep both wallets connected.
  const cancelBtcReset = useCallback(() => {
    hasBtcConnectedRef.current = true;
    if (pendingBtcResetRef.current === undefined) return;
    clearTimeout(pendingBtcResetRef.current);
    pendingBtcResetRef.current = undefined;
    logger.info(
      "Suppressed transient BTC disconnect (reconnect arrived within debounce)",
      {
        category: "Wallet connection",
      },
    );
  }, []);

  useEffect(
    () => () => {
      if (pendingBtcResetRef.current !== undefined)
        clearTimeout(pendingBtcResetRef.current);
    },
    [],
  );

  // BTC: debounce disconnect (blip-tolerant), cancel on reconnect, but reset
  // immediately on a real account switch (onAddressChange only fires for a
  // genuinely different address).
  const btcCallbacks = useMemo(
    () => ({
      onConnect: cancelBtcReset,
      onDisconnect: scheduleBtcReset,
      onAddressChange: runWalletReset,
    }),
    [cancelBtcReset, scheduleBtcReset, runWalletReset],
  );

  // ETH has no late-injection blip; react immediately. Keeping the cancel
  // per-chain also avoids a BTC reconnect wrongly cancelling an ETH disconnect.
  const ethCallbacks = useMemo(
    () => ({
      onDisconnect: runWalletReset,
      onAddressChange: runWalletReset,
    }),
    [runWalletReset],
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
  const { theme } = useTheme();

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
    // User rejections are expected, don't log them
    if (error?.message?.includes("rejected")) {
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
      requiredChains={["BTC", "ETH"]}
      simplifiedTerms={featureFlags.isSimplifiedTermsEnabled}
      disableTomo
    >
      <WalletProviders>{children}</WalletProviders>
    </WalletProvider>
  );
};
