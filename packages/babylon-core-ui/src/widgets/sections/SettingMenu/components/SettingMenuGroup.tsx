import React, { ReactNode } from "react";
import { twJoin } from "tailwind-merge";

export interface SettingMenuGroupProps {
  /** Background style for the group */
  background?: "none" | "secondary" | "custom";
  /** Custom background className when background="custom" */
  backgroundClassName?: string;
  /** Additional CSS classes */
  className?: string;
  /** Children components */
  children: ReactNode;
}

export const SettingMenuGroup: React.FC<SettingMenuGroupProps> = ({
  background = "none",
  backgroundClassName = "",
  className = "",
  children,
}) => {
  const getBackgroundClass = () => {
    switch (background) {
      case "secondary":
        return "mx-[21px] rounded-lg bg-secondary-highlight md:mx-0 md:bg-transparent";
      case "custom":
        return backgroundClassName;
      default:
        return "";
    }
  };

  return <div className={twJoin(getBackgroundClass(), className)}>{children}</div>;
}; 