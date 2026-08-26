import React, { ReactNode } from "react";
import { SubMenu } from "@/components/Menu/SubMenu";
import { ChevronRightIcon } from "@/elements/Icons";
import { SettingMenuDescription } from "./SettingMenuDescription";
import { SettingMenuItem } from "./SettingMenuItem";

export interface SettingMenuSubMenuProps {
  /** Icon element */
  icon?: ReactNode;
  /** Click handler for the submenu trigger */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Children (label, description, and submenu items) */
  children: ReactNode;
}

export const SettingMenuSubMenu: React.FC<SettingMenuSubMenuProps> = ({ icon, className = "", children }) => {
  const childrenArray = React.Children.toArray(children);
  const label = childrenArray.find(
    (child) => typeof child === "string" || (React.isValidElement(child) && child.type !== SettingMenuDescription),
  );
  const description = childrenArray.find(
    (child) => React.isValidElement(child) && child.type === SettingMenuDescription,
  );
  const subMenuItems = childrenArray.filter((child) => React.isValidElement(child) && child.type === SettingMenuItem);

  const labelText = typeof label === "string" ? label : "";

  return (
    <SubMenu
      icon={icon}
      name={labelText}
      description={description ? (description as React.ReactElement).props.children : undefined}
      className={className}
      suffix={<ChevronRightIcon />}
    >
      {subMenuItems}
    </SubMenu>
  );
}; 