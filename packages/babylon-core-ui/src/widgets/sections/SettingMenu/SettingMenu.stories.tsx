import { Meta, StoryFn } from "@storybook/react";
import { useState } from "react";
import { SettingMenu } from "./SettingMenu";
import { Button } from "@/components/Button";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ThemeIcon } from "@/components/Icons";

export default {
  title: "Widgets/Menus/SettingMenu",
  component: SettingMenu,
  argTypes: {
    onOpenChange: { action: "open state changed" },
  },
  tags: ["autodocs"],
} as Meta<typeof SettingMenu>;


const ReportABugIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="40" height="40" rx="20" fill="#387085" fillOpacity="0.12" />
    <path
      d="M23.73 11H16.27L11 16.27V23.73L16.27 29H23.73L29 23.73V16.27L23.73 11ZM20 25.3C19.28 25.3 18.7 24.72 18.7 24C18.7 23.28 19.28 22.7 20 22.7C20.72 22.7 21.3 23.28 21.3 24C21.3 24.72 20.72 25.3 20 25.3ZM21 21H19V15H21V21Z"
      fill="#387085"
    />
  </svg>
);

export const Default: StoryFn = () => {
  const [selectedTheme, setSelectedTheme] = useState<"light" | "dark" | "auto">("auto");
  const isMobile = useIsMobile();

  const handleThemeChange = (theme: "light" | "dark" | "auto") => {
    setSelectedTheme(theme);
  };

  const getThemeDescription = () => {
    switch (selectedTheme) {
      case "light":
        return "Light";
      case "dark":
        return "Dark";
      case "auto":
        return "Auto";
      default:
        return "Auto";
    }
  };

  return (
    <div className="p-4">
      <SettingMenu>
        <SettingMenu.Title>Settings</SettingMenu.Title>

        <SettingMenu.Group background="secondary">
          <SettingMenu.SubMenu icon={<ThemeIcon />}>
            Theme
            <SettingMenu.Description>{getThemeDescription()}</SettingMenu.Description>
            <SettingMenu.Item selected={selectedTheme === "light"} onClick={() => handleThemeChange("light")}>
              Light
            </SettingMenu.Item>
            <SettingMenu.Item selected={selectedTheme === "dark"} onClick={() => handleThemeChange("dark")}>
              Dark
            </SettingMenu.Item>
            <SettingMenu.Item selected={selectedTheme === "auto"} onClick={() => handleThemeChange("auto")}>
              Auto
            </SettingMenu.Item>
          </SettingMenu.SubMenu>

          <SettingMenu.Item icon={<ReportABugIcon />} onClick={() => console.log("Report bug clicked")}>
            Report a Bug
          </SettingMenu.Item>
        </SettingMenu.Group>

        {isMobile && <SettingMenu.Spacer />}

        <SettingMenu.Group background="secondary">
          <SettingMenu.Item onClick={() => window.open("https://example.com/terms", "_blank")}>
            Terms of Use
          </SettingMenu.Item>

          <SettingMenu.Item onClick={() => window.open("https://example.com/privacy", "_blank")}>
            Privacy Policy
          </SettingMenu.Item>
        </SettingMenu.Group>

        <SettingMenu.Spacer />

        <SettingMenu.CustomContent className="my-4 flex justify-center">
          <Button className="!bg-[#D5FCE8] !text-black" variant="contained">
            Switch to BABY Staking
          </Button>
        </SettingMenu.CustomContent>
      </SettingMenu>
    </div>
  );
};

export const WithThemeToggle: StoryFn = () => {
  const [isLightMode, setIsLightMode] = useState(false);
  const isMobile = useIsMobile();

  return (
    <div className="p-4">
      <SettingMenu>
        <SettingMenu.Title>Settings</SettingMenu.Title>

        <SettingMenu.Group background="secondary">
          <SettingMenu.Item
            icon={<ThemeIcon />}
            toggle={{
              value: isLightMode,
              onChange: (value: boolean) => {
                setIsLightMode(value);
                console.log("Theme changed to:", value ? "Light" : "Dark");
              },
            }}
          >
            Theme
            <SettingMenu.Description>Light mode</SettingMenu.Description>
          </SettingMenu.Item>

          <SettingMenu.Item icon={<ReportABugIcon />} onClick={() => console.log("Report bug clicked")}>
            Report a Bug
          </SettingMenu.Item>
        </SettingMenu.Group>

        {isMobile && <SettingMenu.Spacer />}

        <SettingMenu.Group background="secondary">
          <SettingMenu.Item onClick={() => window.open("https://example.com/terms", "_blank")}>
            Terms of Use
          </SettingMenu.Item>

          <SettingMenu.Item onClick={() => window.open("https://example.com/privacy", "_blank")}>
            Privacy Policy
          </SettingMenu.Item>
        </SettingMenu.Group>

        <SettingMenu.Spacer />

        <SettingMenu.CustomContent className="my-4 flex justify-center">
          <Button className="!bg-[#D5FCE8] !text-black" variant="contained">
            Switch to BABY Staking
          </Button>
        </SettingMenu.CustomContent>
      </SettingMenu>
    </div>
  );
};
