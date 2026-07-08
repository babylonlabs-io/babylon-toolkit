import { ReactNode } from "react";
import { twJoin } from "tailwind-merge";

export interface SidebarItemProps {
  icon: ReactNode;
  label: string;
  isActive?: boolean;
  className?: string;
}

export const SidebarItem = ({
  icon,
  label,
  isActive = false,
  className,
}: SidebarItemProps) => (
  <div
    className={twJoin(
      "flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors",
      isActive
        ? "bg-accent-secondary/10 font-medium text-accent-primary"
        : "text-accent-secondary hover:bg-accent-secondary/5 hover:text-accent-primary",
      className,
    )}
  >
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      {icon}
    </span>
    <span>{label}</span>
  </div>
);
