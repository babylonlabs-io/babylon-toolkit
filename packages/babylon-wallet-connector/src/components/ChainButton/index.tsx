import { Avatar, Text } from "@babylonlabs-io/core-ui";
import type { JSX, PropsWithChildren } from "react";
import { twMerge } from "tailwind-merge";

interface ChainButtonProps extends PropsWithChildren {
  className?: string;
  disabled?: boolean;
  logo?: string | JSX.Element;
  title?: string | JSX.Element;
  alt?: string;
  onClick?: () => void;
}

export function ChainButton({ className, disabled, alt, logo, title, children, onClick }: ChainButtonProps) {
  const avatar = typeof logo === "string" ? <Avatar url={logo} alt={alt} /> : <Avatar>{logo}</Avatar>;

  return (
    <Text
      disabled={disabled}
      as={disabled ? "div" : "button"}
      className={twMerge(
        "flex w-full flex-col gap-2.5 rounded border border-secondary-strokeLight bg-surface p-4 text-accent-primary",
        disabled ? "pointer-events-none" : "pointer-events-auto",
        disabled ? "cursor-default" : "cursor-pointer",
        className,
      )}
      onClick={onClick}
    >
      <div className="flex w-full items-center gap-2.5">
        <div className="flex items-center">{avatar}</div>
        {title}

        {!disabled && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            className="ml-auto block"
          >
            <path
              d="M8.58984 16.59L13.1698 12L8.58984 7.41L9.99984 6L15.9998 12L9.99984 18L8.58984 16.59Z"
              fill="currentColor"
            />
          </svg>
        )}
      </div>

      {children && (
        <div className="pointer-events-auto w-full" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </Text>
  );
}
