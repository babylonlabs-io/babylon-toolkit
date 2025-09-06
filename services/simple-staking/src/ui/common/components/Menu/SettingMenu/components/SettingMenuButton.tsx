import type { HTMLAttributes } from "react";
import { forwardRef } from "react";
import { twJoin } from "tailwind-merge";

import cogIcon from "@/ui/common/assets/cog.svg";

interface SettingMenuButtonProps extends HTMLAttributes<HTMLButtonElement> {
  toggleMenu: () => void;
}
export const SettingMenuButton = forwardRef<
  HTMLButtonElement,
  SettingMenuButtonProps
>(({ className, toggleMenu, ...props }, ref) => {
  return (
    <button
      ref={ref}
      {...props}
      onClick={(e) => {
        toggleMenu();
        props.onClick?.(e);
      }}
      className={twJoin(
        "flex h-10 w-10 items-center justify-center border-secondary-contrast p-1 text-secondary-contrast",
        className,
      )}
    >
      <img src={cogIcon} alt="Settings" className="h-8 w-8" />
    </button>
  );
});

SettingMenuButton.displayName = "SettingMenuButton";
