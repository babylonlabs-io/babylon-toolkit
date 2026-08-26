import React, { ReactNode } from "react";
import { twJoin } from "tailwind-merge";
import { Text } from "@/components/Text";

export interface SettingMenuTitleProps {
  children: ReactNode;
  className?: string;
}

export const SettingMenuTitle: React.FC<SettingMenuTitleProps> = ({ children, className = "" }) => (
  <Text variant="body1" className={twJoin("px-7 pb-6 text-accent-primary md:hidden", className)}>
    {children}
  </Text>
); 