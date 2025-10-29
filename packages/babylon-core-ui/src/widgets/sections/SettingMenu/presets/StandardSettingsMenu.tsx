import { useEffect, useState } from "react";
import { SettingMenu } from "../SettingMenu";
import { ThemeIcon } from "@/components/Icons";

type Theme = "light" | "dark" | "system";

export interface StandardSettingsMenuProps {
  /** Current theme from next-themes or similar */
  theme?: string;
  /** Function to update theme */
  setTheme: (theme: string) => void;
  /** Custom trigger element (defaults to settings icon button) */
  trigger?: React.ReactNode;
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
}

/**
 * StandardSettingsMenu - Standard settings menu for Babylon applications
 * 
 * Includes:
 * - Theme toggle (Light/Dark mode)
 * - Terms of Use link
 * - Privacy Policy link
 * 
 * Use this across all Babylon applications (vault, simple-staking, etc.)
 */
export const StandardSettingsMenu = ({
  theme,
  setTheme,
  trigger,
  open,
  onOpenChange,
}: StandardSettingsMenuProps) => {
  const [selectedTheme, setSelectedTheme] = useState<Theme>(
    (theme as Theme) || "system",
  );

  useEffect(() => {
    if (theme) {
      setSelectedTheme(theme as Theme);
    }
  }, [theme]);

  const isLightMode = selectedTheme === "light";

  const handleToggleTheme = (isLight: boolean) => {
    const newTheme = isLight ? "light" : "dark";
    setSelectedTheme(newTheme);
    setTheme(newTheme);
  };

  const handleTermsOfUse = () => {
    window.open(
      "https://babylonlabs.io/terms-of-use",
      "_blank",
      "noopener,noreferrer",
    );
  };

  const handlePrivacyPolicy = () => {
    window.open(
      "https://babylonlabs.io/privacy-policy",
      "_blank",
      "noopener,noreferrer",
    );
  };

  const getThemeDescription = () => {
    return isLightMode ? "Light mode" : "Dark mode";
  };

  return (
    <SettingMenu trigger={trigger} open={open} onOpenChange={onOpenChange}>
      <SettingMenu.Title>Settings</SettingMenu.Title>

      <SettingMenu.Group background="secondary">
        <SettingMenu.Item
          icon={<ThemeIcon />}
          toggle={{
            value: isLightMode,
            onChange: handleToggleTheme,
          }}
        >
          Theme
          <SettingMenu.Description>
            {getThemeDescription()}
          </SettingMenu.Description>
        </SettingMenu.Item>
      </SettingMenu.Group>

      <SettingMenu.Group>
        <SettingMenu.Item onClick={handleTermsOfUse}>
          Terms of Use
        </SettingMenu.Item>

        <SettingMenu.Item onClick={handlePrivacyPolicy}>
          Privacy Policy
        </SettingMenu.Item>
      </SettingMenu.Group>
    </SettingMenu>
  );
};

