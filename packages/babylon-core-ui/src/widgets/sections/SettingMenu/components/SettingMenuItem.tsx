import React, { ReactNode } from "react";
import { MenuItem } from "@/components/Menu/MenuItem";
import { ChevronRightIcon } from "@/elements/Icons";
import { SettingMenuDescription } from "./SettingMenuDescription";

interface SettingMenuItemToggleProps {
  /** Current toggle value */
  value?: boolean;
  /** Default toggle value */
  defaultValue?: boolean;
  /** Toggle change handler */
  onChange?: (value: boolean) => void;
  /** Icon to show when toggle is active */
  activeIcon?: React.ReactNode;
  /** Icon to show when toggle is inactive */
  inactiveIcon?: React.ReactNode;
}

export interface SettingMenuItemProps {
  /** Icon element */
  icon?: ReactNode;
  /** Suffix element (e.g., chevron, external link icon) */
  suffix?: ReactNode;
  /** Click handler */
  onClick?: () => void;
  /** Disabled state */
  disabled?: boolean;
  /** Selected/active state */
  selected?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Toggle configuration - when provided, renders a toggle switch as suffix */
  toggle?: SettingMenuItemToggleProps;
  /** Children (label and description) */
  children: ReactNode;
}

export const SettingMenuItem: React.FC<SettingMenuItemProps> = ({
  icon,
  suffix,
  onClick,
  disabled = false,
  selected = false,
  className = "",
  toggle,
  children,
}) => {
  const childrenArray = React.Children.toArray(children);
  const label = childrenArray.find(
    (child) => typeof child === "string" || (React.isValidElement(child) && child.type !== SettingMenuDescription),
  );
  const description = childrenArray.find(
    (child) => React.isValidElement(child) && child.type === SettingMenuDescription,
  );

  const labelText = typeof label === "string" ? label : "";
  const defaultSuffix = onClick && !toggle ? <ChevronRightIcon /> : undefined;

  return (
    <MenuItem
      icon={icon}
      name={labelText}
      description={description ? (description as React.ReactElement).props.children : undefined}
      onClick={onClick}
      disabled={disabled}
      selected={selected}
      className={className}
      suffix={suffix || defaultSuffix}
      toggle={toggle}
    />
  );
}; 