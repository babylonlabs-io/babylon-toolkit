import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { networks } from "bitcoinjs-lib";

import { ACCOUNT_CHANGE_EVENTS, DISCONNECT_EVENT } from "@/constants/walletEvents";
import type { IBTCProvider, InscriptionIdentifier, Network, SignPsbtOptions } from "@/core/types";
import { toXOnlyPublicKeyHex } from "@/core/utils/publicKey";
import {
  BTC_WALLET_LOCK_POLL_INTERVAL_MS,
  classifyBtcAccountsProbe,
} from "@/core/utils/walletLock";
import { useChainConnector } from "@/hooks/useChainConnector";
import { useVisibilityCheck } from "@/hooks/useVisibilityCheck";
import { useWalletConnect } from "@/hooks/useWalletConnect";

export interface BTCWalletLifecycleCallbacks {
  onConnect?: (address: string, publicKeyNoCoord: string) => void | Promise<void>;
  onDisconnect?: () => void | Promise<void>;
  onAddressChange?: (newAddress: string, newPublicKeyNoCoord: string) => void | Promise<void>;
  onError?: (error: Error, context?: { address?: string; publicKeyNoCoord?: string }) => void;
}

interface BTCWalletContextProps {
  loading: boolean;
  network?: networks.Network;
  publicKeyNoCoord: string;
  address: string;
  connected: boolean;
  /**
   * True when a *connected* BTC wallet has gone silently locked — its
   * non-interactive accounts read (`getAccounts`) returned empty while a cached
   * session is still held. Distinct from `connected` (which stays true on a
   * cached session, since `getAddress()` returns a stale address) and from a
   * disconnect (which tears the session down). Drives an "unlock your wallet"
   * prompt; clears automatically once the wallet is unlocked (the poll sees the
   * account again) or after a successful `reconnect()`. Only ever set for
   * wallets that expose a non-interactive accounts read.
   */
  locked: boolean;
  disconnect: () => void;
  open: () => void;
  /**
   * Re-runs the underlying provider's `connectWallet()` flow against the
   * currently-selected BTC wallet without re-opening the wallet picker.
   * Triggers an unlock / re-authorization prompt if the extension has
   * lost permission for the dApp, then refreshes the cached address and
   * public key from the provider. Throws when no wallet is selected,
   * when the provider returns an empty address / pubkey, or when the
   * underlying `connectWallet()` call itself fails.
   */
  reconnect: () => Promise<void>;
  getAddress: () => Promise<string>;
  getPublicKeyHex: () => Promise<string>;
  signPsbt: (psbtHex: string, options?: SignPsbtOptions) => Promise<string>;
  signPsbts: (
    psbtsHexes: string[],
    options?: SignPsbtOptions[],
  ) => Promise<string[]>;
  getNetwork: () => Promise<Network>;
  signMessage: (
    message: string,
    type: "ecdsa" | "bip322-simple",
  ) => Promise<string>;
  getInscriptions: () => Promise<InscriptionIdentifier[]>;
  /**
   * Derives a deterministic 32-byte value from the wallet through its
   * `deriveContextHash` method. Throws `WalletError` with code
   * `WALLET_METHOD_NOT_SUPPORTED` for wallets that don't implement
   * the method — callers should branch on that error code to gate
   * features that require this capability.
   */
  deriveContextHash: (appName: string, context: string) => Promise<string>;
}

const BTCWalletContext = createContext<BTCWalletContextProps>({
  loading: true,
  network: undefined,
  connected: false,
  locked: false,
  publicKeyNoCoord: "",
  address: "",
  disconnect: () => {},
  open: () => {},
  reconnect: async () => {
    throw new Error("BTC Wallet not connected");
  },
  getAddress: async () => "",
  getPublicKeyHex: async () => "",
  signPsbt: async () => "",
  signPsbts: async () => [],
  getNetwork: async () => ({}) as Network,
  signMessage: async () => "",
  getInscriptions: async () => [],
  // Fail loud rather than silently returning "" — a 32-byte secret
  // derivation must never produce an invalid value. Outside a
  // BTCWalletProvider this throws like any other unmounted hook.
  deriveContextHash: async () => {
    throw new Error("BTC Wallet not connected");
  },
});

export interface BTCWalletProviderProps extends PropsWithChildren {
  callbacks?: BTCWalletLifecycleCallbacks;
}

export const BTCWalletProvider = ({ children, callbacks }: BTCWalletProviderProps) => {
  const [loading, setLoading] = useState(true);
  const [btcWalletProvider, setBTCWalletProvider] = useState<IBTCProvider>();
  const [network, setNetwork] = useState<networks.Network>();
  const [publicKeyNoCoord, setPublicKeyNoCoord] = useState("");
  const [address, setAddress] = useState("");
  const [locked, setLocked] = useState(false);

  // Each session has a new context object. Old lock probes cannot change it.
  const lockProbeContextRef = useRef<{ provider: IBTCProvider | undefined; address: string }>({
    provider: undefined,
    address: "",
  });

  const btcConnector = useChainConnector("BTC");
  const { open = () => {} } = useWalletConnect();

  const disconnect = useCallback(async () => {
    // Invalidate old probes before React commits the disconnected state.
    lockProbeContextRef.current = { provider: undefined, address: "" };
    setBTCWalletProvider(undefined);
    setNetwork(undefined);
    setPublicKeyNoCoord("");
    setAddress("");
    setLocked(false);

    try {
      await callbacks?.onDisconnect?.();
    } catch (error) {
      console.error("Error in onDisconnect callback:", error instanceof Error ? error.message : "Unknown error");
    }
  }, [callbacks]);

  const connectBTC = useCallback(
    async (walletProvider: IBTCProvider | null) => {
      if (!walletProvider) return;
      setLoading(true);

      try {
        const address = await walletProvider.getAddress();
        if (!address) {
          throw new Error("BTC wallet provider returned an empty address");
        }

        const publicKeyHex = await walletProvider.getPublicKeyHex();
        if (!publicKeyHex) {
          throw new Error("BTC wallet provider returned an empty public key");
        }

        const publicKeyNoCoordHex = toXOnlyPublicKeyHex(publicKeyHex);

        if (!publicKeyNoCoordHex) {
          throw new Error("Processed BTC public key (no coordinates) is empty");
        }

        setBTCWalletProvider(walletProvider);
        setAddress(address);
        setPublicKeyNoCoord(publicKeyNoCoordHex);
        setLocked(false);
        setLoading(false);
        // Invalidate old probes before React commits the new session.
        lockProbeContextRef.current = { provider: walletProvider, address };

        await callbacks?.onConnect?.(address, publicKeyNoCoordHex);
      } catch (error: any) {
        setLoading(false);
        callbacks?.onError?.(error, { address, publicKeyNoCoord });
        throw error;
      }
    },
    [callbacks, address, publicKeyNoCoord],
  );

  useEffect(() => {
    // Ensure loading is cleared even when BTC connector is not configured
    setLoading(false);
    if (!btcConnector) return;
    if (btcConnector.connectedWallet) {
      connectBTC(btcConnector?.connectedWallet.provider);
    }

    const unsubscribe = btcConnector?.on("connect", (wallet) => {
      if (wallet.provider) {
        connectBTC(wallet.provider);
      }
    });

    return unsubscribe;
  }, [btcConnector, connectBTC]);

  useEffect(() => {
    if (!btcConnector) return;

    const unsubscribe = btcConnector.on("disconnect", () => {
      disconnect();
    });

    return unsubscribe;
  }, [btcConnector, disconnect]);

  // Listen for BTC account changes
  useEffect(() => {
    if (!btcWalletProvider) return;

    const onAccountsChanged = async (accounts?: string[]) => {
      try {
        // If accounts array is provided and empty, treat as disconnect
        if (Array.isArray(accounts) && accounts.length === 0) {
          disconnect();
          return;
        }

        // Check if the provider already updated its state (e.g. AppKit updates
        // address/publicKey via its persistent listener before emitting accountChanged).
        // Only re-connect if the address hasn't changed yet — other providers
        // (OKX, Unisat) need connectWallet() to refresh their internal cache.
        const currentAddress = await btcWalletProvider.getAddress();
        if (currentAddress === address) {
          await btcWalletProvider.connectWallet();
        }

        const newAddress = await btcWalletProvider.getAddress();

        // If no address returned, treat as disconnect
        if (!newAddress) {
          disconnect();
          return;
        }

        if (newAddress !== address) {
          // Also fetch the new public key (different accounts have different keys)
          const newPublicKeyHex = await btcWalletProvider.getPublicKeyHex();
          if (!newPublicKeyHex) {
            throw new Error("BTC wallet provider returned an empty public key after account change");
          }

          const newPublicKeyNoCoord = toXOnlyPublicKeyHex(newPublicKeyHex);

          setAddress(newAddress);
          setPublicKeyNoCoord(newPublicKeyNoCoord);
          // An accountsChanged event is itself proof the wallet answered, so it
          // is unlocked. If it was previously flagged as silently locked and
          // the user unlocked into a *different* account, the poll's `checkLock`
          // leaves `locked` set on the "changed" verdict (it can't clear it
          // against a still-stale address). Clear it here, atomically with the
          // address refresh, instead of waiting a poll tick for it to re-read.
          setLocked(false);
          await callbacks?.onAddressChange?.(newAddress, newPublicKeyNoCoord);
        }
      } catch (error: any) {
        // Connection failure during account change likely means wallet disconnected
        console.error("Error handling BTC account change:", error instanceof Error ? error.message : "Unknown error");
        callbacks?.onError?.(error);
        disconnect();
      }
    };

    const onDisconnect = () => {
      disconnect();
    };

    const registeredAccountEvents: (typeof ACCOUNT_CHANGE_EVENTS)[number][] = [];
    let disconnectRegistered = false;

    if (typeof btcWalletProvider.on === "function") {
      ACCOUNT_CHANGE_EVENTS.forEach((event) => {
        try {
          btcWalletProvider.on(event, onAccountsChanged);
          registeredAccountEvents.push(event);
        } catch {
          // Some wallet providers reject event names that they do not support.
        }
      });

      try {
        btcWalletProvider.on(DISCONNECT_EVENT, onDisconnect);
        disconnectRegistered = true;
      } catch {
        // Some wallet providers reject event names that they do not support.
      }
    }

    return () => {
      if (typeof btcWalletProvider.off === "function") {
        registeredAccountEvents.forEach((event) => {
          btcWalletProvider.off(event, onAccountsChanged);
        });
        if (disconnectRegistered) {
          btcWalletProvider.off(DISCONNECT_EVENT, onDisconnect);
        }
      }
    };
  }, [btcWalletProvider, address, callbacks, disconnect]);

  // Account events also change the session. Connect, disconnect and reconnect
  // update this ref before their state changes commit.
  useEffect(() => {
    lockProbeContextRef.current = { provider: btcWalletProvider, address };
  }, [btcWalletProvider, address]);

  // Check wallet connection when tab becomes visible
  // This handles the case where user disconnects from extension while tab is in background
  const checkBTCConnection = useCallback(async () => {
    if (!btcWalletProvider) return;
    const probeContext = lockProbeContextRef.current;

    // A silent lock must not open an interactive prompt or disconnect the wallet.
    if (typeof btcWalletProvider.getAccounts === "function") {
      let accounts: string[] | undefined;
      try {
        accounts = await btcWalletProvider.getAccounts();
      } catch {
        // An unsupported read or transient failure needs the connection check.
        accounts = undefined;
      }
      // Discard old reads, including failures that would open a new prompt.
      if (
        lockProbeContextRef.current !== probeContext ||
        probeContext.provider !== btcWalletProvider ||
        probeContext.address !== address
      ) {
        return;
      }
      if (accounts !== undefined) {
        const probe = classifyBtcAccountsProbe(accounts, address);
        if (probe === "locked") {
          setLocked(true);
          return;
        }
        // Unlocked. Same account → nothing changed; skip the interactive
        // round-trip (and its popup risk) entirely. Different account
        // ("changed") → fall through to refresh the cached address/pubkey.
        setLocked(false);
        if (probe === "current") return;
      }
    }

    try {
      // Try to get the current accounts from the wallet
      // If disconnected, this will fail or return empty
      await btcWalletProvider.connectWallet();
      const currentAddress = await btcWalletProvider.getAddress();

      if (!currentAddress) {
        // Wallet is disconnected
        disconnect();
      } else if (currentAddress !== address) {
        // Account changed while tab was in background
        const pubKeyHex = await btcWalletProvider.getPublicKeyHex();
        if (!pubKeyHex) {
          // Missing public key is an error - disconnect to avoid inconsistent state
          const error = new Error("BTC wallet returned empty public key after account change");
          console.error(error.message);
          callbacks?.onError?.(error);
          disconnect();
          return;
        }
        const pubKeyNoCoord = toXOnlyPublicKeyHex(pubKeyHex);
        setAddress(currentAddress);
        setPublicKeyNoCoord(pubKeyNoCoord);
        await callbacks?.onAddressChange?.(currentAddress, pubKeyNoCoord);
      }
    } catch (error) {
      // Connection check failed - wallet likely disconnected
      console.error("BTC wallet connection check failed:", error instanceof Error ? error.message : "Unknown error");
      disconnect();
    }
  }, [btcWalletProvider, address, callbacks, disconnect]);

  // Never for hardware wallets: their `connectWallet()` is interactive (a
  // device session, a QR scan), and where it cannot complete outside a user
  // gesture — a Ledger whose session died needs the WebHID picker, and a tab
  // return is not a gesture — the catch below would turn the tab return into
  // a disconnect. For the Ledger vault connector a lost device session
  // surfaces as DEVICE_DISCONNECTED at the next device operation instead,
  // where the vault app offers a reconnect; other hardware wallets surface it
  // as their own next-operation failure.
  useVisibilityCheck(checkBTCConnection, {
    enabled: Boolean(btcWalletProvider && address) && !btcConnector?.connectedWallet?.hardware,
  });

  // Detect a *silent* wallet auto-lock. Injected extensions (notably UniSat)
  // re-lock on an idle timer and emit no event, while the cached `getAddress()`
  // keeps returning a stale address — so `connected` stays true and the UI
  // looks fine until the user hits a signing call. `getAccounts()` is the
  // non-interactive probe (it never prompts) and returns [] when locked.
  //
  // The "emits no event on lock" premise holds only for UniSat >=
  // MIN_UNISAT_VERSION (1.7.14). Older builds emit `accountsChanged([])` on
  // lock, which `onAccountsChanged` (above) turns into a disconnect — so this
  // detection silently depends on the connect-time version gate. Don't lower
  // that floor without revisiting this path.
  const checkLock = useCallback(async () => {
    const probedProvider = btcWalletProvider;
    const probedAddress = address;
    const probeContext = lockProbeContextRef.current;
    if (!probedProvider || !probedAddress) return;
    // Feature-detect: wallets without a non-interactive accounts read
    // (OKX, OneKey, AppKit, hardware) can't be probed silently, so never flag
    // them locked.
    if (typeof probedProvider.getAccounts !== "function") return;

    let accounts: unknown;
    try {
      accounts = await probedProvider.getAccounts();
    } catch {
      // A throw is ambiguous (transient RPC error / asleep extension) — leave
      // the current state rather than flapping the banner. The click-time
      // liveness probe still catches a truly unresponsive wallet at signing.
      return;
    }

    // Reconnect can replace the session without changing its provider or address.
    if (
      lockProbeContextRef.current !== probeContext ||
      probeContext.provider !== probedProvider ||
      probeContext.address !== probedAddress
    ) {
      return;
    }

    const probe = classifyBtcAccountsProbe(accounts, probedAddress);
    // A different active account is an account switch, not a lock: leave the
    // cached address/pubkey refresh to the accountsChanged event and the
    // visibility check. Clearing `locked` here would present an unlocked
    // session against a stale address — so if the wallet was locked and the
    // user unlocked into a new account, `locked` is cleared by the
    // accountsChanged handler (atomically with the address refresh) or the
    // visibility check, not here.
    if (probe === "changed") return;
    setLocked(probe === "locked");
  }, [btcWalletProvider, address]);

  // Poll for a silent lock while the tab is visible, plus immediately on tab
  // focus / return so it feels instant when the user interacts. A backgrounded
  // tab is not polled (it can't show the banner, and waking the extension for
  // nothing is wasteful) — it re-checks the moment it becomes visible.
  useEffect(() => {
    if (!btcWalletProvider || !address) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (typeof btcWalletProvider.getAccounts !== "function") return;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const startPolling = () => {
      if (intervalId !== undefined) return;
      void checkLock();
      intervalId = setInterval(() => void checkLock(), BTC_WALLET_LOCK_POLL_INTERVAL_MS);
    };

    const stopPolling = () => {
      if (intervalId === undefined) return;
      clearInterval(intervalId);
      intervalId = undefined;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startPolling();
      } else {
        stopPolling();
      }
    };

    const handleFocus = () => {
      // visibilitychange already covers the common tab-return case; only probe
      // on focus when the tab is actually visible so a focus event on a hidden
      // tab doesn't fire a redundant round-trip.
      if (document.visibilityState !== "visible") return;
      void checkLock();
    };

    if (document.visibilityState === "visible") {
      startPolling();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [btcWalletProvider, address, checkLock]);

  const reconnect = useCallback(async () => {
    if (!btcWalletProvider) {
      throw new Error("BTC Wallet not connected");
    }

    try {
      await btcWalletProvider.connectWallet();

      const refreshedAddress = await btcWalletProvider.getAddress();
      if (!refreshedAddress) {
        throw new Error("BTC wallet provider returned an empty address");
      }

      const refreshedPublicKeyHex = await btcWalletProvider.getPublicKeyHex();
      if (!refreshedPublicKeyHex) {
        throw new Error("BTC wallet provider returned an empty public key");
      }

      const refreshedPublicKeyNoCoord = toXOnlyPublicKeyHex(refreshedPublicKeyHex);
      if (!refreshedPublicKeyNoCoord) {
        throw new Error("Processed BTC public key (no coordinates) is empty");
      }

      // Always refresh the cached pubkey alongside the address. Wallets that
      // derive pubkeys lazily can return a different pubkey for the same
      // address after re-auth, and connectBTC sets both unconditionally.
      setAddress(refreshedAddress);
      setPublicKeyNoCoord(refreshedPublicKeyNoCoord);
      // A successful unlock invalidates every earlier lock probe.
      lockProbeContextRef.current = { provider: btcWalletProvider, address: refreshedAddress };
      setLocked(false);
      if (refreshedAddress !== address) {
        await callbacks?.onAddressChange?.(refreshedAddress, refreshedPublicKeyNoCoord);
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      callbacks?.onError?.(err, { address, publicKeyNoCoord });
      throw error;
    }
  }, [btcWalletProvider, address, publicKeyNoCoord, callbacks]);

  const connected = useMemo(
    () => Boolean(btcWalletProvider && address && publicKeyNoCoord),
    [btcWalletProvider, address, publicKeyNoCoord],
  );

  const getAddress = useCallback(async () => {
    if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
    return btcWalletProvider.getAddress();
  }, [btcWalletProvider]);

  const getPublicKeyHex = useCallback(async () => {
    if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
    return btcWalletProvider.getPublicKeyHex();
  }, [btcWalletProvider]);

  const signPsbt = useCallback(
    async (psbtHex: string, options?: SignPsbtOptions) => {
      if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
      return btcWalletProvider.signPsbt(psbtHex, options);
    },
    [btcWalletProvider],
  );

  const signPsbts = useCallback(
    async (psbtsHexes: string[], options?: SignPsbtOptions[]) => {
      if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
      return btcWalletProvider.signPsbts(psbtsHexes, options);
    },
    [btcWalletProvider],
  );

  const getNetwork = useCallback(async () => {
    if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
    return btcWalletProvider.getNetwork();
  }, [btcWalletProvider]);

  const signMessage = useCallback(
    async (message: string, type: "ecdsa" | "bip322-simple") => {
      if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
      return btcWalletProvider.signMessage(message, type);
    },
    [btcWalletProvider],
  );

  const getInscriptions = useCallback(async () => {
    if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
    return btcWalletProvider.getInscriptions();
  }, [btcWalletProvider]);

  const deriveContextHash = useCallback(
    async (appName: string, context: string) => {
      if (!btcWalletProvider) throw new Error("BTC Wallet not connected");
      return btcWalletProvider.deriveContextHash(appName, context);
    },
    [btcWalletProvider],
  );

  return (
    <BTCWalletContext.Provider
      value={{
        loading,
        network,
        connected,
        locked,
        publicKeyNoCoord,
        address,
        disconnect,
        open,
        reconnect,
        getAddress,
        getPublicKeyHex,
        signPsbt,
        signPsbts,
        getNetwork,
        signMessage,
        getInscriptions,
        deriveContextHash,
      }}
    >
      {children}
    </BTCWalletContext.Provider>
  );
};

export const useBTCWallet = () => useContext(BTCWalletContext);
