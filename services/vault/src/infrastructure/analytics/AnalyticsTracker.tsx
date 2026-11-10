import { useEffect } from "react";
import { useLocation } from "react-router";

import { useGeoFencing } from "@/context/geofencing";

import { ANALYTICS_EVENT } from "./analyticsEvents";
import { routeTemplate } from "./routeTemplate";
import { trackEvent } from "./trackEvent";

/**
 * Sends page views. Renders nothing; mount once inside the router and the
 * geofencing provider.
 *
 * A page view is sent only for a page the visitor is shown: not while the
 * geofence check runs, and never for a blocked visitor, who sees only the
 * geo-block screen. A path visited while the check runs is sent once it
 * passes.
 */
export function AnalyticsTracker() {
  const { pathname } = useLocation();
  const { isGeoBlocked, isLoading: isGeoLoading } = useGeoFencing();

  useEffect(() => {
    if (isGeoLoading || isGeoBlocked) return;
    const template = routeTemplate(pathname);
    // A redirect renders no page; the page it lands on sends its own view.
    if (template === null) return;
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: template });
  }, [pathname, isGeoLoading, isGeoBlocked]);

  return null;
}
