import { useEffect } from "react";
import { useLocation } from "react-router";

import { useGeoFencing } from "@/context/geofencing";

import { ANALYTICS_EVENT } from "./analyticsEvents";
import { routeTemplate } from "./routeTemplate";
import { settleGeofence, trackEvent } from "./trackEvent";

/**
 * Sends page views, and settles the geofence for every analytics event.
 * Renders nothing; mount once inside the router and the geofencing provider.
 *
 * Events are held while the geofence check runs, sent once it passes, and
 * dropped for a blocked visitor, who sees only the geo-block screen, and
 * whenever the visitor's region is unknown: the health endpoint did not answer,
 * or a blocking configuration error stopped the check before it ran.
 */
export function AnalyticsTracker() {
  const { pathname } = useLocation();
  const { isGeoBlocked, isLoading, isGeoChecked } = useGeoFencing();

  useEffect(() => {
    if (isLoading) return;
    settleGeofence(isGeoChecked && !isGeoBlocked ? "passed" : "failed");
  }, [isLoading, isGeoChecked, isGeoBlocked]);

  useEffect(() => {
    const template = routeTemplate(pathname);
    // A redirect renders no page; the page it lands on sends its own view.
    if (template === null) return;
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: template });
  }, [pathname]);

  return null;
}
