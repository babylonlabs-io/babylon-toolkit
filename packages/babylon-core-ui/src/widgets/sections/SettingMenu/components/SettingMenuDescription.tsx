import React, { ReactNode } from "react";

export interface SettingMenuDescriptionProps {
  children: ReactNode;
  className?: string;
}

export const SettingMenuDescription: React.FC<SettingMenuDescriptionProps> = ({ children }) => {
  return <>{children}</>;
}; 