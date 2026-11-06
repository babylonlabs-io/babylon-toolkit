import { useEffect } from "react";
import { useLocation } from "react-router";

import { ANALYTICS_EVENT } from "./analyticsEvents";
import { routeTemplate } from "./routeTemplate";
import { trackEvent } from "./trackEvent";

/** Sends page views. Renders nothing; mount once inside the router. */
export function AnalyticsTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    const template = routeTemplate(pathname);
    // A redirect renders no page; the page it lands on sends its own view.
    if (template === null) return;
    trackEvent(ANALYTICS_EVENT.PAGEVIEW, { $pathname: template });
  }, [pathname]);

  return null;
}
