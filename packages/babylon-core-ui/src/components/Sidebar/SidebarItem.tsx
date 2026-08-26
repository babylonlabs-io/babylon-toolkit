import { ReactNode } from "react";
import { twJoin } from "tailwind-merge";

export interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  isActive?: boolean;
  className?: string;
}

// Exact row from Figma Sidebar nav items (node 10084:23112): 40px row height,
// 24px icon, 16px/0.15px-tracking label, 8px gap. Active state is a text-color
// change only (text/primary vs text/secondary) — Figma defines no background
// or border treatment for the active row.
export const SidebarItem = ({
  icon,
  label,
  isActive = false,
  className,
}: SidebarItemProps) => (
  <div
    className={twJoin(
      "flex h-10 items-center gap-2 rounded py-2 text-base tracking-[0.15px] transition-colors",
      isActive
        ? "text-accent-primary"
        : "text-accent-secondary hover:text-accent-primary",
      className,
    )}
  >
    <span className="flex size-6 shrink-0 items-center justify-center">
      {icon}
    </span>
    <span>{label}</span>
  </div>
);
