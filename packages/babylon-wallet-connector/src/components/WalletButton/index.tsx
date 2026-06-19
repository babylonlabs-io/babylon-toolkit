import { Avatar, Chip, Text } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

interface WalletButtonProps {
  className?: string;
  logo: string;
  disabled?: boolean;
  name: string;
  fallbackLink?: string;
  installed?: boolean;
  onClick?: () => void;
}

export function WalletButton({
  className,
  disabled = false,
  name,
  logo,
  fallbackLink,
  installed = true,
  onClick,
}: WalletButtonProps) {
  const btnProps = installed ? { as: "button", disabled, onClick } : { as: "a", href: fallbackLink, target: "_blank" };

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
        {installed && <span className="size-2 rounded-full bg-[#15B768] dark:bg-[#00E676]" />}
        <span className={installed ? "text-[#15B768] dark:text-[#00E676]" : "text-accent-secondary"}>
          {installed ? "Installed" : "Uninstalled"}
        </span>
      </Chip>
    </Text>
  );
}
