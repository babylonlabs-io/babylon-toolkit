import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export interface SidebarProps {
  /** Brand lockup rendered at the top of the rail */
  brand: ReactNode;
  /** Nav item rows (see SidebarItem) */
  children: ReactNode;
  /** Social links + legal text, pinned to the bottom of the rail */
  footer?: ReactNode;
  className?: string;
}

// Exact dimensions/spacing from Figma Sidebar (node 10084:23112): 242px wide,
// 24px padding on every side, brand+nav grouped with a 40px gap.
//
// `sticky top-0 h-svh` pins the rail to the viewport instead of stretching
// to match the main content column's height (RootLayout's row default
// `align-items: stretch`). Without it, on any page taller than one
// viewport the sidebar's own box grows past the fold too — nav scrolls
// out of reach and the footer (social + legal links) sits below the
// bottom of the page, invisible until the user scrolls all the way down.
// `nav` gets `flex-1 overflow-y-auto` so it — not the whole rail — is what
// scrolls if a future nav list ever exceeds the viewport height; brand and
// footer stay fixed in place.
export const Sidebar = ({ brand, children, footer, className }: SidebarProps) => (
  <aside
    className={twMerge(
      "sticky top-0 flex h-svh w-[242px] shrink-0 flex-col items-start border-r border-secondary-strokeLight bg-surface p-6",
      className,
    )}
  >
    <div className="w-full">{brand}</div>
    <nav className="mt-10 flex w-full flex-1 flex-col gap-10 overflow-y-auto">
      {children}
    </nav>
    {footer}
  </aside>
);
