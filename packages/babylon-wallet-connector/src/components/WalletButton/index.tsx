import { Avatar, Chip, Text } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

// Green = software wallet detected/installed; yellow = hardware wallet that is
// available but still needs connecting; secondary/gray = not installed.
const INSTALLED_ACCENT = "text-[#15B768] dark:text-[#00E676]";
const INSTALLED_DOT = "bg-[#15B768] dark:bg-[#00E676]";
const HARDWARE_ACCENT = "text-[#FFB300]";
const HARDWARE_DOT = "bg-[#FFB300]";

interface WalletButtonProps {
  className?: string;
  logo: string;
  disabled?: boolean;
  name: string;
  fallbackLink?: string;
  installed?: boolean;
  hardware?: boolean;
  label?: string;
  onClick?: () => void;
}

export function WalletButton({
  className,
  disabled = false,
  name,
  logo,
  fallbackLink,
  installed = true,
  hardware = false,
  label,
  onClick,
}: WalletButtonProps) {
  // Hardware wallets are always reachable through the connect flow (they have no
  // browser-extension detection step), so they show a yellow "available" badge
  // instead of the detection-based Installed/Uninstalled one, and are clickable
  // even when no provider is detected.
  const reachable = installed || hardware;
  const btnProps = reachable
    ? { as: "button", disabled, onClick }
    : { as: "a", href: fallbackLink, target: "_blank", rel: "noopener noreferrer" };

  const getTestId = () => {
    const normalizedName = name.toLowerCase();
    if (normalizedName.includes("okx")) return "wallet-option-okx";
    if (normalizedName.includes("keplr")) return "wallet-option-keplr";
    if (normalizedName.includes("leap")) return "wallet-option-leap";
    return `wallet-option-${normalizedName.replace(/\s+/g, "-")}`;
  };

  return (
    <Text
      variant="body2"
      className={twMerge(
        "flex h-14 w-full items-center gap-2.5 rounded-lg p-2 text-accent-primary",
        installed ? "bg-neutral-200" : "bg-neutral-100",
        disabled ? "cursor-default" : "cursor-pointer",
        className,
      )}
      {...btnProps}
      data-testid={getTestId()}
    >
      <Avatar variant="rounded" className="shrink-0" alt={name} url={logo} />
      <span className={twMerge("min-w-0 flex-1 truncate text-left", !installed && "text-accent-secondary")}>{name}</span>

      <Chip
        className={twMerge(
          "flex shrink-0 items-center gap-1.5 rounded-full",
          installed ? "bg-neutral-100" : "bg-neutral-200",
        )}
      >
        {(hardware || installed) && (
          <span className={twMerge("size-2 rounded-full", hardware ? HARDWARE_DOT : INSTALLED_DOT)} />
        )}
        <span className={hardware ? HARDWARE_ACCENT : installed ? INSTALLED_ACCENT : "text-accent-secondary"}>
          {hardware ? label : installed ? "Installed" : "Uninstalled"}
        </span>
      </Chip>
    </Text>
  );
}
