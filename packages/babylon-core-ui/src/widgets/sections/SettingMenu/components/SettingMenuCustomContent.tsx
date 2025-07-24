import React, { ReactNode } from "react";

export interface SettingMenuCustomContentProps {
  children: ReactNode;
  className?: string;
}

export const SettingMenuCustomContent: React.FC<SettingMenuCustomContentProps> = ({ children, className = "" }) => (
  <div className={className}>{children}</div>
); 