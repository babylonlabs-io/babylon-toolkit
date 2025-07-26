import { Avatar, Chip, Text } from "@babylonlabs-io/core-ui";
import { twMerge } from "tailwind-merge";

interface WalletButtonProps {
  className?: string;
  logo: string;
  disabled?: boolean;
  name: string;
  label?: string;
  fallbackLink?: string;
  installed?: boolean;
  onClick?: () => void;
}

export function WalletButton({
  className,
  disabled = false,
  name,
  logo,
  label,
  fallbackLink,
  installed = true,
  onClick,
}: WalletButtonProps) {
  const btnProps = installed ? { as: "button", disabled, onClick } : { as: "a", href: fallbackLink, target: "_blank" };

  return (
    <Text
      className={twMerge(
        "flex h-14 w-full cursor-pointer items-center gap-2.5 rounded border border-secondary-strokeLight text-accent-primary px-2",
        disabled ? "cursor-default" : "cursor-pointer",
        className,
      )}
      {...btnProps}
    >
      <Avatar variant="rounded" className="shrink-0" alt={name} url={logo} />
      {name}

      {label && <Chip className="ml-auto shrink-0">{label}</Chip>}
    </Text>
  );
}
