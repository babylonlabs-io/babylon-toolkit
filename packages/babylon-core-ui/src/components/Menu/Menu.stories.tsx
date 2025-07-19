import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Menu } from "./Menu";
import { MenuItem } from "./MenuItem";
import { SubMenu } from "./SubMenu";
import { SubMenuItem } from "./SubMenuItem";
import { Button } from "../Button";
import { Text } from "../Text";

const meta: Meta<typeof Menu> = {
  title: "Components/Menu",
  component: Menu,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: "A menu component with support for nested submenus.",
      },
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

const SettingIcon = () => (
  <svg width="29" height="28" viewBox="0 0 29 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M24.9127 15.3708C24.9711 14.9333 25.0002 14.4812 25.0002 14C25.0002 13.5333 24.9711 13.0667 24.8982 12.6292L27.8586 10.325C28.1211 10.1208 28.194 9.72708 28.0336 9.43542L25.2336 4.59375C25.0586 4.27292 24.694 4.17083 24.3732 4.27292L20.8877 5.67292C20.1586 5.11875 19.3857 4.65208 18.5252 4.30208L18.0002 0.597916C17.9419 0.247916 17.6502 0 17.3002 0H11.7002C11.3502 0 11.0732 0.247916 11.0148 0.597916L10.4898 4.30208C9.62941 4.65208 8.84191 5.13333 8.12732 5.67292L4.64191 4.27292C4.32107 4.15625 3.95649 4.27292 3.78149 4.59375L0.996075 9.43542C0.821075 9.74167 0.879408 10.1208 1.17107 10.325L4.13149 12.6292C4.05857 13.0667 4.00024 13.5479 4.00024 14C4.00024 14.4521 4.02941 14.9333 4.10232 15.3708L1.14191 17.675C0.879408 17.8792 0.806491 18.2729 0.966908 18.5646L3.76691 23.4062C3.94191 23.7271 4.30649 23.8292 4.62732 23.7271L8.11274 22.3271C8.84191 22.8812 9.61482 23.3479 10.4752 23.6979L11.0002 27.4021C11.0732 27.7521 11.3502 28 11.7002 28H17.3002C17.6502 28 17.9419 27.7521 17.9857 27.4021L18.5107 23.6979C19.3711 23.3479 20.1586 22.8812 20.8732 22.3271L24.3586 23.7271C24.6794 23.8438 25.044 23.7271 25.219 23.4062L28.019 18.5646C28.194 18.2437 28.1211 17.8792 27.844 17.675L24.9127 15.3708ZM14.5002 19.25C11.6127 19.25 9.25024 16.8875 9.25024 14C9.25024 11.1125 11.6127 8.75 14.5002 8.75C17.3877 8.75 19.7502 11.1125 19.7502 14C19.7502 16.8875 17.3877 19.25 14.5002 19.25Z"
      fill="#9E9E9E"
    />
  </svg>
);

const ThemeIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="20" fill="#387085" fill-opacity="0.12" />
    <path
      d="M20 30C25.52 30 30 25.52 30 20C30 14.48 25.52 10 20 10C14.48 10 10 14.48 10 20C10 25.52 14.48 30 20 30ZM21 12.07C24.94 12.56 28 15.92 28 20C28 24.08 24.95 27.44 21 27.93V12.07Z"
      fill="#387085"
    />
  </svg>
);

const ReportABugIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="20" fill="#387085" fill-opacity="0.12" />
    <path
      d="M23.73 11H16.27L11 16.27V23.73L16.27 29H23.73L29 23.73V16.27L23.73 11ZM20 25.3C19.28 25.3 18.7 24.72 18.7 24C18.7 23.28 19.28 22.7 20 22.7C20.72 22.7 21.3 23.28 21.3 24C21.3 24.72 20.72 25.3 20 25.3ZM21 21H19V15H21V21Z"
      fill="#387085"
    />
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

export const Default: Story = {
  render: () => {
    const [selectedTheme, setSelectedTheme] = useState("auto");
    const themes = [
      { id: "auto", label: "Auto", description: undefined },
      { id: "light", label: "Light", description: undefined },
      { id: "dark", label: "Dark", description: undefined },
    ];
    return (
      <div className="p-4">
        <Menu
          trigger={
            <button>
              <SettingIcon />
            </button>
          }
        >
          <Text variant="body1" className="px-7 pb-6 text-accent-primary md:hidden">
            Settings
          </Text>
          <div className="mx-[21px] rounded-lg md:mx-0">
            <SubMenu
              name="Theme"
              description={selectedTheme}
              icon={<ThemeIcon />}
              suffix={<ChevronRightIcon />}
              className="bg-secondary-highlight md:bg-transparent"
            >
              <div className="flex flex-col">
                {themes.map((theme) => (
                  <SubMenuItem
                    key={theme.id}
                    label={theme.label}
                    description={theme?.description ?? ""}
                    selected={selectedTheme === theme.id}
                    onClick={() => {
                      setSelectedTheme(theme.id);
                      console.log(`Theme selected: ${theme.id}`);
                    }}
                  />
                ))}
              </div>
            </SubMenu>
            <MenuItem
              name="Report a bug"
              icon={<ReportABugIcon />}
              suffix={<ChevronRightIcon />}
              className="mb-4 bg-secondary-highlight md:mb-0 md:bg-transparent"
            />
            <MenuItem
              name="Terms of Use"
              suffix={<ChevronRightIcon />}
              className="bg-secondary-highlight md:bg-transparent"
            />
            <MenuItem
              name="Privacy Policy"
              suffix={<ChevronRightIcon />}
              className="bg-secondary-highlight md:bg-transparent"
            />
          </div>
          <div className="my-4 flex justify-center">
            <Button className="!bg-[#D5FCE8] !text-black" variant="contained">
              Switch to BABY Staking
            </Button>
          </div>
        </Menu>
      </div>
    );
  },
};
