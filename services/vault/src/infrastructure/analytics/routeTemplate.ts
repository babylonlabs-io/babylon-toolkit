import { matchPath } from "react-router";

import { getFlagDisabledV3SectionPaths } from "@/config/v3Navigation";
import { MARKET_RESERVE_PARAM, ROUTES } from "@/routes";

/**
 * The routes the router renders. `/markets` alone has no page (it renders
 * NotFound), so only its reserve route is listed.
 */
const ROUTE_TEMPLATES: readonly string[] = [
  ...Object.values(ROUTES).filter((route) => route !== ROUTES.MARKETS),
  `${ROUTES.MARKETS}/:${MARKET_RESERVE_PARAM}`,
];

/** Reported for any path that is not one of the app's routes. */
const UNKNOWN_ROUTE = "/other";

/**
 * Whether the router only redirects this path to the overview: a section
 * whose own feature flag is off, or any path inside one.
 */
function isRedirectedSection(pathname: string): boolean {
  return getFlagDisabledV3SectionPaths().some(
    (segment) =>
      matchPath(`/${segment}`, pathname) !== null ||
      matchPath(`/${segment}/*`, pathname) !== null,
  );
}

/**
 * The route template a pathname matches, so a page view never carries a
 * concrete parameter (a reserve id) or an arbitrary mistyped path. Null for a
 * path the router redirects without rendering a page, which is no page view.
 */
export function routeTemplate(pathname: string): string | null {
  if (isRedirectedSection(pathname)) return null;
  return (
    ROUTE_TEMPLATES.find(
      (template) => matchPath(template, pathname) !== null,
    ) ?? UNKNOWN_ROUTE
  );
}
