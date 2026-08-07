import { LogoMark } from "@babylonlabs-io/core-ui";
import { NavLink } from "react-router";

/**
 * Entry-screen navbar mark: the Babylon wordmark in brand orange (white in
 * dark), a divider, then the Aave wordmark. Aave is an image rather than a
 * `currentColor` glyph so it keeps its own brand colours instead of inheriting
 * Babylon's — per Figma comments #113 / #121, which rejected the all-black
 * lockup.
 */
export function BrandLockup() {
  return (
    <NavLink to="/" className="flex items-center gap-3">
      <LogoMark className="h-8 w-auto text-secondary-main dark:text-accent-primary" />
      <div className="h-8 w-px bg-secondary-strokeLight" />
      <img
        src="/images/aave-wordmark.svg"
        alt="Aave"
        className="h-[18px] w-[109px]"
      />
    </NavLink>
  );
}
