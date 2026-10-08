import { useCallback, useEffect, useId, useRef, useState } from "react";
import { MdClose, MdOutlineMenu } from "react-icons/md";
import { twJoin, twMerge } from "tailwind-merge";

import { useIsMobile } from "../../hooks";
import { Container } from "../Container/Container";
import { MobileLogo } from "../Logo/MobileLogo";
import { SmallLogo } from "../Logo/SmallLogo";
import { MobileNavOverlay } from "../Nav/MobileNavOverlay";

export type HeaderSize = "sm" | "md" | "lg";

export interface HeaderProps {
  /** Navigation component - allows apps to use their own router (e.g., react-router NavLink) */
  navigation?: React.ReactNode;

  /** Mobile navigation component - content for mobile menu */
  mobileNavigation?: React.ReactNode;

  /** Logo component - allows service to customize branding if needed */
  logo?: React.ReactNode;

  /** Mobile logo component */
  mobileLogo?: React.ReactNode;

  /** Mobile page title, shown after the menu button in place of the mobile logo */
  mobileTitle?: React.ReactNode;

  /** Right-side actions (e.g., Connect button, settings) */
  rightActions?: React.ReactNode;

  /** Optional className for header container */
  className?: string;

  /** Optional className for the inner Container - controls max-width, padding, etc. */
  containerClassName?: string;

  /** Whether to show mobile menu button */
  showMobileMenu?: boolean;

  /** Size of the header - controls spacing and height
   * @default "md"
   * - sm: compact spacing (mb-8)
   * - md: default spacing (mb-20)
   * - lg: spacious spacing (mb-32)
   */
  size?: HeaderSize;
}

const sizeStyles: Record<HeaderSize, string> = {
  sm: "mb-8",
  md: "mb-20",
  lg: "mb-32",
};

export const Header = ({
  navigation,
  mobileNavigation,
  logo,
  mobileLogo,
  mobileTitle,
  rightActions,
  className,
  containerClassName,
  showMobileMenu = true,
  size = "md",
}: HeaderProps) => {
  const isMobileView = useIsMobile();
  const [mobileMenuTop, setMobileMenuTop] = useState<number | null>(null);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const hasMobileMenu = showMobileMenu && Boolean(mobileNavigation);
  const mobileMenuId = useId();
  const isMobileMenuOpen = isMobileView && mobileMenuTop !== null;

  const measureHeaderBottom = useCallback(
    () => headerRef.current?.getBoundingClientRect().bottom ?? 0,
    [],
  );

  const openMobileMenu = () => setMobileMenuTop(measureHeaderBottom());

  useEffect(() => {
    if (!isMobileView) setMobileMenuTop(null);
  }, [isMobileView]);

  // Rotation, or a banner above the header that mounts, unmounts or wraps its
  // text, can move the header's bottom edge while the menu is open. No single
  // observer sees all of these, so each frame re-measures and updates the
  // menu position only when the edge moved.
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    let frame = requestAnimationFrame(function track() {
      const bottom = measureHeaderBottom();
      setMobileMenuTop((top) =>
        top === null || top === bottom ? top : bottom,
      );
      frame = requestAnimationFrame(track);
    });
    return () => cancelAnimationFrame(frame);
  }, [isMobileMenuOpen, measureHeaderBottom]);

  // The header stays interactive under the open menu, so a tap or focus move
  // outside the panel and its button dismisses the menu, like a popover.
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const dismissOutside = (event: Event) => {
      const target = event.target as Node;
      const panel = document.getElementById(mobileMenuId);
      if (panel?.contains(target) || menuButtonRef.current?.contains(target)) return;
      setMobileMenuTop(null);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [isMobileMenuOpen, mobileMenuId]);

  const closeMobileMenu = () => {
    setMobileMenuTop(null);
    menuButtonRef.current?.focus();
  };

  const menuButton = hasMobileMenu && (
    <button
      ref={menuButtonRef}
      type="button"
      aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
      aria-expanded={isMobileMenuOpen}
      aria-controls={mobileMenuId}
      data-testid="header-menu-button"
      className="cursor-pointer text-accent-primary"
      onClick={isMobileMenuOpen ? closeMobileMenu : openMobileMenu}
    >
      {isMobileMenuOpen ? <MdClose size={32} /> : <MdOutlineMenu size={32} />}
    </button>
  );

  return (
    <header
      ref={headerRef}
      className={twMerge(
        sizeStyles[size],
        className,
        isMobileMenuOpen && "bg-surface",
      )}
    >
      <Container
        className={twMerge(
          "relative flex h-20 items-center justify-between",
          containerClassName,
        )}
      >
        <div
          className={twJoin(
            "flex min-w-0 items-center",
            isMobileView && mobileTitle ? "gap-2" : "gap-4",
          )}
        >
          {isMobileView ? (
            mobileTitle ? (
              <>
                {menuButton}
                {mobileTitle}
              </>
            ) : (
              <>
                {mobileLogo || <MobileLogo />}
                {menuButton}
              </>
            )
          ) : (
            logo || <SmallLogo />
          )}
        </div>

        {!isMobileView && navigation && (
          <div className="absolute left-1/2 -translate-x-1/2 transform">
            {navigation}
          </div>
        )}

        <div className="flex items-center gap-4">{rightActions}</div>
      </Container>

      {isMobileMenuOpen && (
        <MobileNavOverlay
          id={mobileMenuId}
          top={mobileMenuTop}
          onClose={closeMobileMenu}
        >
          {mobileNavigation}
        </MobileNavOverlay>
      )}
    </header>
  );
};
