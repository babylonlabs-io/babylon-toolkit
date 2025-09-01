import React, { ReactNode } from "react";
import { Menu } from "@/components/Menu";
import { Spacer } from "@/components/Spacer";
import { SettingsIcon } from "@/elements/Icons";
import { SpacerProps } from "@/components/Spacer/Spacer";
import {
  SettingMenuTitle,
  SettingMenuGroup,
  SettingMenuItem,
  SettingMenuSubMenu,
  SettingMenuDescription,
  SettingMenuCustomContent,
  type SettingMenuTitleProps,
  type SettingMenuGroupProps,
  type SettingMenuItemProps,
  type SettingMenuSubMenuProps,
  type SettingMenuDescriptionProps,
  type SettingMenuCustomContentProps,
} from "./components";
import { twJoin } from "tailwind-merge";

export interface SettingMenuProps {
  /** Custom trigger element (defaults to settings icon button) */
  trigger?: ReactNode;
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Placement of the menu relative to trigger */
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  /** Additional CSS classes for the menu container */
  className?: string;
  /** Offset from the trigger element */
  offset?: [number, number];
  /** Children components */
  children: ReactNode;
}

interface SettingMenuComponent extends React.FC<SettingMenuProps> {
  Title: React.FC<SettingMenuTitleProps>;
  Group: React.FC<SettingMenuGroupProps>;
  Item: React.FC<SettingMenuItemProps>;
  SubMenu: React.FC<SettingMenuSubMenuProps>;
  Description: React.FC<SettingMenuDescriptionProps>;
  CustomContent: React.FC<SettingMenuCustomContentProps>;
  Spacer: React.FC<SpacerProps>;
}

const SettingMenuBase: React.FC<SettingMenuProps> = ({
  trigger,
  open,
  onOpenChange,
  placement = "bottom-end",
  className,
  offset = [0, 8],
  children,
}) => {
  const defaultTrigger = (
    <button
      className="flex h-10 w-10 items-center justify-center rounded-lg transition-colors hover:bg-accent-primary/10"
      aria-label="Settings menu"
    >
      <SettingsIcon />
    </button>
  );

  return (
    <Menu
      trigger={trigger || defaultTrigger}
      open={open}
      onOpenChange={onOpenChange}
      placement={placement}
      className={twJoin("relative", className)}
      offset={offset}
      mobileMode="drawer"
    >
      {children}
    </Menu>
  );
};

export const SettingMenu = SettingMenuBase as SettingMenuComponent;

SettingMenu.Title = SettingMenuTitle;
SettingMenu.Group = SettingMenuGroup;
SettingMenu.Item = SettingMenuItem;
SettingMenu.SubMenu = SettingMenuSubMenu;
SettingMenu.Description = SettingMenuDescription;
SettingMenu.CustomContent = SettingMenuCustomContent;
SettingMenu.Spacer = Spacer;
