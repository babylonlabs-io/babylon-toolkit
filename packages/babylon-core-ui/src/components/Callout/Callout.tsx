import { type HTMLAttributes, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { CheckIcon, CloseIcon, InfoIcon, WarningIcon } from "../Icons";
import { Text } from "../Text";

export type CalloutVariant =
  | "error"
  | "warning"
  | "success"
  | "info"
  | "infoStrong";

export interface CalloutAction {
  label: ReactNode;
  /** Required so an action button always does something when activated. */
  onClick: () => void;
  /**
   * `primary` = filled with the variant accent color; `secondary` = outlined.
   * Defaults to `primary`.
   */
  emphasis?: "primary" | "secondary";
  disabled?: boolean;
}

export interface CalloutProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant: CalloutVariant;
  title?: ReactNode;
  icon?: ReactNode;
  /** Optional action buttons rendered as a row beneath the body. */
  actions?: CalloutAction[];
  children: ReactNode;
}

const VARIANT_BG: Record<CalloutVariant, string> = {
  error: "bg-error-main",
  warning: "bg-warning-main",
  success: "bg-success-main",
  info: "bg-info-main",
  // Deeper navy accent for prominent, non-urgent prompts (e.g. opt-in nudges).
  infoStrong: "bg-info-dark",
};

const DEFAULT_ICONS: Record<CalloutVariant, ReactNode> = {
  error: <CloseIcon size={14} color="text-accent-contrast" />,
  warning: <WarningIcon size={14} color="text-accent-contrast" />,
  success: <CheckIcon size={14} color="text-accent-contrast" />,
  info: <InfoIcon size={14} color="text-accent-contrast" />,
  infoStrong: <InfoIcon size={14} color="text-accent-contrast" />,
};

const ACTION_BASE =
  "flex h-9 items-center justify-center rounded-lg px-4 text-sm transition-opacity disabled:cursor-not-allowed disabled:opacity-50";

export function Callout({
  variant,
  title,
  icon,
  actions,
  className,
  children,
  role,
  ...rest
}: CalloutProps) {
  const resolvedRole = role ?? (variant === "error" ? "alert" : "status");
  const hasActions = Boolean(actions && actions.length > 0);

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
      <div
        className={twMerge(
          "flex min-w-0 flex-1 flex-col",
          hasActions ? "gap-4" : "gap-1",
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
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

        {hasActions && (
          <div className="flex items-center gap-4">
            {actions?.map((action, index) => {
              const { label, emphasis = "primary", onClick, disabled } = action;
              const styles =
                emphasis === "primary"
                  ? twMerge(
                      ACTION_BASE,
                      VARIANT_BG[variant],
                      "text-accent-contrast hover:opacity-90",
                    )
                  : twMerge(
                      ACTION_BASE,
                      "border border-secondary-strokeLight text-accent-primary hover:opacity-80",
                    );
              return (
                <button
                  key={index}
                  type="button"
                  onClick={onClick}
                  disabled={disabled}
                  className={styles}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
