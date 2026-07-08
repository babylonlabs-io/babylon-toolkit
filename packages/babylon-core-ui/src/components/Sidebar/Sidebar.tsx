import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export interface SidebarProps {
  /** Brand lockup rendered at the top of the rail */
  brand: ReactNode;
  /** Nav item rows (see SidebarItem) */
  children: ReactNode;
  className?: string;
}

export const Sidebar = ({ brand, children, className }: SidebarProps) => (
  <aside
    className={twMerge(
      "flex w-[240px] shrink-0 flex-col gap-8 border-r border-secondary-strokeLight bg-surface px-4 py-6",
      className,
    )}
  >
    <div className="px-2">{brand}</div>
    <nav className="flex flex-col gap-1">{children}</nav>
  </aside>
);
