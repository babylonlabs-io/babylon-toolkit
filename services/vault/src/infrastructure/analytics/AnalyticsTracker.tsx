import { useWalletConnect } from "@babylonlabs-io/wallet-connector";
import { useEffect } from "react";
import { useLocation } from "react-router";

import { useGeoFencing } from "@/context/geofencing";
import { useETHWallet } from "@/context/wallet";

import { ANALYTICS_EVENT } from "./analyticsEvents";
import { setWalletAddress } from "./analyticsSession";
import { routeTemplate } from "./routeTemplate";
import { settleGeofence, trackEvent } from "./trackEvent";
import { reportEthSessionConfirmed } from "./walletConnections";

/**
 * Sends page views and the Ethereum session, and settles the geofence for
 * every analytics event. Renders nothing; mount once inside the router, the
 * geofencing provider and the wallet providers.
 *
 * Events are held while the geofence check runs, sent once it passes, and
 * dropped for a blocked visitor, who sees only the geo-block screen, and
 * whenever the visitor's region is unknown: the health endpoint did not answer,
 * or a blocking configuration error stopped the check before it ran.
 *
 * Every event carries the address of the app's confirmed Ethereum session.
 * The session is confirmed after load, so the landing page view goes out
 * without it; `wallet_connected` is sent when it is confirmed, and carries it.
 * Bitcoin connections are sent from the wallet provider's callbacks.
 */
export function AnalyticsTracker() {
  const { pathname } = useLocation();
  const { isGeoBlocked, isLoading, isGeoChecked } = useGeoFencing();
  const { connected: sessionConfirmed } = useWalletConnect();
  const { address: ethAddress } = useETHWallet();
  // An address alone is no session: the wallet can report an account the app
  // holds no session for.
  const sessionAddress = sessionConfirmed && ethAddress ? ethAddress : null;

  useEffect(() => {
    if (isLoading) return;
    settleGeofence(isGeoChecked && !isGeoBlocked ? "passed" : "failed");
  }, [isLoading, isGeoChecked, isGeoBlocked]);

  useEffect(() => {
    setWalletAddress(sessionAddress);
    if (sessionAddress !== null) reportEthSessionConfirmed();
  }, [sessionAddress]);

  useEffect(() => {
    const template = routeTemplate(pathname);
    // A redirect renders no page; the page it lands on sends its own view.
    if (template === null) return;
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: template });
  }, [pathname]);

  return null;
}
