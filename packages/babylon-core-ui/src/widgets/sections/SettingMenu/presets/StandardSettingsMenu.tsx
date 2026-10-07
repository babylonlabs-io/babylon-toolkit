import { useEffect, useState } from "react";
import { MdChevronRight, MdContrast } from "react-icons/md";
import { SettingMenu, type SettingMenuProps } from "../SettingMenu";
import { ThemeIcon } from "@/components/Icons";
import { Toggle } from "@/components/Toggle/Toggle";
import { useIsMobile } from "@/hooks/useIsMobile";

type Theme = "light" | "dark" | "system";

const TERMS_OF_USE_URL = "https://babylonlabs.io/terms-of-use";
const PRIVACY_POLICY_URL = "https://babylonlabs.io/privacy-policy";

const PHONE_LINKS = [
  { label: "Terms of Use", url: TERMS_OF_USE_URL },
  { label: "Privacy Policy", url: PRIVACY_POLICY_URL },
];

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
  /** Phone presentation; `popover` shows the phone dropdown card instead of the drawer */
  mobileMode?: SettingMenuProps["mobileMode"];
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
  mobileMode = "drawer",
}: StandardSettingsMenuProps) => {
  const [selectedTheme, setSelectedTheme] = useState<Theme>(
    (theme as Theme) || "system",
  );
  const isMobile = useIsMobile();
  const isPhonePopover = isMobile && mobileMode === "popover";

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
    window.open(TERMS_OF_USE_URL, "_blank", "noopener,noreferrer");
  };

  const handlePrivacyPolicy = () => {
    window.open(PRIVACY_POLICY_URL, "_blank", "noopener,noreferrer");
  };

  const getThemeDescription = () => {
    return isLightMode ? "Light mode" : "Dark mode";
  };

  if (isPhonePopover) {
    return (
      <SettingMenu trigger={trigger} open={open} onOpenChange={onOpenChange} mobileMode={mobileMode}>
        <div className="flex flex-col gap-4">
          <div className="flex w-[220px] items-center gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center text-accent-primary">
              <MdContrast size={24} />
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm leading-[1.43] tracking-[0.17px] text-accent-secondary">Theme</span>
                <span className="text-xs leading-[1.66] tracking-0.4 text-accent-primary">
                  {getThemeDescription()}
                </span>
              </div>
              <Toggle value={isLightMode} onChange={handleToggleTheme} aria-label="Theme" />
            </div>
          </div>

          <hr className="w-full border-secondary-strokeLight" />

          {PHONE_LINKS.map(({ label, url }) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative flex w-[220px] items-center justify-between text-sm leading-[1.43] tracking-[0.17px] text-accent-primary before:absolute before:-inset-y-2 before:inset-x-0"
            >
              {label}
              <MdChevronRight size={24} />
            </a>
          ))}
        </div>
      </SettingMenu>
    );
  }

  return (
    <SettingMenu trigger={trigger} open={open} onOpenChange={onOpenChange} mobileMode={mobileMode}>
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
