import { useState } from "react";
import { MdOutlineMenu } from "react-icons/md";
import { twMerge } from "tailwind-merge";

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

  /** Right-side actions (e.g., Connect button, settings) */
  rightActions?: React.ReactNode;

  /** Optional className for header container */
  className?: string;

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
  rightActions,
  className,
  showMobileMenu = true,
  size = "md",
}: HeaderProps) => {
  const isMobileView = useIsMobile();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className={twMerge(sizeStyles[size], className)}>
      <Container className="relative flex h-20 items-center justify-between">
        <div className="flex items-center gap-4">
          {isMobileView ? (
            <>
              {mobileLogo || <MobileLogo />}
              {showMobileMenu && mobileNavigation && (
                <button
                  type="button"
                  aria-label="Open menu"
                  className="cursor-pointer text-accent-primary"
                  onClick={() => setIsMobileMenuOpen(true)}
                >
                  <MdOutlineMenu size={32} />
                </button>
              )}
            </>
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

      {showMobileMenu && mobileNavigation && (
        <MobileNavOverlay
          open={isMobileView && isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        >
          {mobileNavigation}
        </MobileNavOverlay>
      )}
    </header>
  );
};


