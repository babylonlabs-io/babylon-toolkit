import {
  useWalletConnect,
  useWidgetState,
} from "@babylonlabs-io/wallet-connector";
import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router";

import { useGeoFencing } from "@/context/geofencing";
import { useBTCWallet, useETHWallet } from "@/context/wallet";

import { ANALYTICS_EVENT, type WalletChain } from "./analyticsEvents";
import { setWalletAddress } from "./analyticsSession";
import { routeTemplate } from "./routeTemplate";
import { settleGeofence, trackEvent } from "./trackEvent";

/**
 * Sends page views and wallet connections, and settles the geofence for every
 * analytics event. Renders nothing; mount once inside the router, the
 * geofencing provider and the wallet providers.
 *
 * Events are held while the geofence check runs, sent once it passes, and
 * dropped for a blocked visitor, who sees only the geo-block screen, and
 * whenever the visitor's region is unknown: the health endpoint did not answer,
 * or a blocking configuration error stopped the check before it ran.
 *
 * `wallet_connected` counts connections the user makes in the connect dialog,
 * each wallet at most once per page load:
 * - Ethereum when the wallet session is confirmed. The Ethereum address alone
 *   is no signal: it can be present while the app holds no session.
 * - Bitcoin when it connects.
 * Either counts only after the dialog has been opened on this page load, so a
 * session the app restores on load is not a connection.
 */
export function AnalyticsTracker() {
  const { pathname } = useLocation();
  const { isGeoBlocked, isLoading, isGeoChecked } = useGeoFencing();
  const { address: ethAddress } = useETHWallet();
  const { connected: btcConnected, address: btcAddress } = useBTCWallet();
  const { connected: sessionConfirmed } = useWalletConnect();
  const { visible: connectDialogVisible } = useWidgetState();

  const connectDialogOpened = useRef(false);
  const ethSessionHandled = useRef(false);
  const btcConnectionHandled = useRef(false);
  // `chain:address` of every connection sent on this page load. Held in memory
  // only; the Bitcoin address is never sent.
  const reported = useRef(new Set<string>());

  useEffect(() => {
    if (isLoading) return;
    settleGeofence(isGeoChecked && !isGeoBlocked ? "passed" : "failed");
  }, [isLoading, isGeoChecked, isGeoBlocked]);

  const reportConnection = useCallback(
    (chain: WalletChain, address: string) => {
      if (!connectDialogOpened.current) return;
      const key = `${chain}:${address.toLowerCase()}`;
      if (reported.current.has(key)) return;
      reported.current.add(key);
      trackEvent(ANALYTICS_EVENT.WALLET_CONNECTED, { chain });
    },
    [],
  );

  // Declared before the connection effects, so a connection that lands in the
  // same render as the dialog opening is counted.
  useEffect(() => {
    if (connectDialogVisible) connectDialogOpened.current = true;
  }, [connectDialogVisible]);

  // Declared before the page view effect, so a wallet that is already
  // connected on mount is on the first page view too.
  // Only with a confirmed session: an address alone is no connection.
  useEffect(() => {
    setWalletAddress(sessionConfirmed && ethAddress ? ethAddress : null);
  }, [sessionConfirmed, ethAddress]);

  useEffect(() => {
    if (!sessionConfirmed) {
      ethSessionHandled.current = false;
      return;
    }
    if (ethSessionHandled.current || !ethAddress) return;
    ethSessionHandled.current = true;
    reportConnection("eth", ethAddress);
  }, [sessionConfirmed, ethAddress, reportConnection]);

  useEffect(() => {
    if (!btcConnected) {
      btcConnectionHandled.current = false;
      return;
    }
    if (btcConnectionHandled.current || !btcAddress) return;
    btcConnectionHandled.current = true;
    reportConnection("btc", btcAddress);
  }, [btcConnected, btcAddress, reportConnection]);

  useEffect(() => {
    const template = routeTemplate(pathname);
    // A redirect renders no page; the page it lands on sends its own view.
    if (template === null) return;
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: template });
  }, [pathname]);

  return null;
}
