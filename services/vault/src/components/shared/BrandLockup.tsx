import { LogoMark } from "@babylonlabs-io/core-ui";
import { NavLink } from "react-router";

import { AaveWordmark } from "@/components/shared/AaveWordmark";

/**
 * Entry-screen navbar mark: the Babylon wordmark in brand orange (white in
 * dark), a divider, then the Aave wordmark. Both are `currentColor` glyphs, so
 * Aave reads black on light and white on dark alongside Babylon's mark rather
 * than keeping its own brand purple.
 */
export function BrandLockup() {
  return (
    <NavLink to="/" className="flex items-center gap-3">
      <LogoMark className="h-8 w-auto text-secondary-main dark:text-accent-primary" />
      <div className="h-8 w-px bg-secondary-strokeLight" />
      <AaveWordmark className="text-accent-primary" />
    </NavLink>
  );
}
