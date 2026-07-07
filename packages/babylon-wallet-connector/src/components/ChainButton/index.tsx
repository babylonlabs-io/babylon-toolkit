import { Avatar, Text } from "@babylonlabs-io/core-ui";
import type { JSX, PropsWithChildren } from "react";
import { twMerge } from "tailwind-merge";

interface ChainButtonProps extends PropsWithChildren {
  className?: string;
  logo?: string | JSX.Element;
  title?: string | JSX.Element;
  alt?: string;
  onClick?: () => void;
}

export function ChainButton({ className, alt, logo, title, children, onClick }: ChainButtonProps) {
  const avatar = typeof logo === "string" ? <Avatar url={logo} alt={alt} /> : <Avatar>{logo}</Avatar>;

  const getTestId = () => {
    if (typeof title === "string") {
      if (title.includes("Bitcoin")) return "select-bitcoin-wallet-button";
      if (title.includes("Ethereum")) return "select-ethereum-wallet-button";
      if (title.includes("Babylon")) return "select-babylon-wallet-button";
    }
    return "chain-button";
  };

  return (
    <Text
      as="button"
      className={twMerge(
        "flex w-full cursor-pointer flex-col gap-4 rounded-lg bg-primary-contrast p-4 text-accent-primary",
        className,
      )}
      onClick={onClick}
      data-testid={getTestId()}
    >
      <div className="flex w-full items-center gap-2.5">
        <div className="flex items-center">{avatar}</div>
        {title}

        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          className="ml-auto block text-accent-secondary"
        >
          <path
            d="M8.58984 16.59L13.1698 12L8.58984 7.41L9.99984 6L15.9998 12L9.99984 18L8.58984 16.59Z"
            fill="currentColor"
          />
        </svg>
      </div>

      {children && <div className="w-full">{children}</div>}
    </Text>
  );
}
