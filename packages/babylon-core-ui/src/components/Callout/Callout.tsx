import { type HTMLAttributes, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { CheckIcon, CloseIcon, InfoIcon, WarningIcon } from "../Icons";
import { Text } from "../Text";

export type CalloutVariant = "error" | "warning" | "success" | "info";

export interface CalloutProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant: CalloutVariant;
  title?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
}

const VARIANT_BG: Record<CalloutVariant, string> = {
  error: "bg-error-main",
  warning: "bg-warning-main",
  success: "bg-success-main",
  info: "bg-info-main",
};

const DEFAULT_ICONS: Record<CalloutVariant, ReactNode> = {
  error: <CloseIcon size={14} color="text-accent-contrast" />,
  warning: <WarningIcon size={14} color="text-accent-contrast" />,
  success: <CheckIcon size={14} color="text-accent-contrast" />,
  info: <InfoIcon size={14} color="text-accent-contrast" />,
};

export function Callout({
  variant,
  title,
  icon,
  className,
  children,
  role,
  ...rest
}: CalloutProps) {
  const resolvedRole = role ?? (variant === "error" ? "alert" : "status");

  return (
    <div
      role={resolvedRole}
      className={twMerge(
        "flex w-full items-start gap-4 rounded-lg border border-secondary-strokeLight bg-secondary-highlight p-4",
        className,
      )}
      {...rest}
    >
      <div
        aria-hidden="true"
        className={twMerge(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          VARIANT_BG[variant],
        )}
      >
        {icon ?? DEFAULT_ICONS[variant]}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && (
          <Text variant="body1" className="break-words text-accent-primary">
            {title}
          </Text>
        )}
        <Text
          as="div"
          variant="body2"
          className="break-words text-accent-secondary"
        >
          {children}
        </Text>
      </div>
    </div>
  );
}
