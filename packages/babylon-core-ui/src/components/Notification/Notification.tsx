import {
  type ComponentType,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { twMerge } from "tailwind-merge";

import {
  CheckIcon,
  CloseIcon,
  type IconProps,
  InfoIcon,
  WarningIcon,
} from "../Icons";
import { Text } from "../Text";

import {
  type NotificationAction,
  NotificationActionButton,
} from "./NotificationActionButton";

export type { NotificationAction } from "./NotificationActionButton";

export type NotificationVariant =
  | "error"
  | "warning"
  | "info"
  | "success"
  | "paused"
  | "suggestion";

export type NotificationActionsPlacement = "inline" | "below";

export interface NotificationProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Severity — drives the left accent bar, icon chip, tint, and default icon. */
  variant: NotificationVariant;
  title?: ReactNode;
  /** Description body. */
  children?: ReactNode;
  /** `undefined` shows the variant default icon; `null` hides the icon chip. */
  icon?: ReactNode | null;
  /** Action buttons — rendered as severity-aware pills. */
  actions?: NotificationAction[];
  /** `inline` = same row, right-aligned; `below` = stacked under the body. */
  actionsPlacement?: NotificationActionsPlacement;
  /** Nested sub-box rendered below the body (e.g. a suggestion/details panel). */
  suggestion?: ReactNode;
  /** When provided, renders a dismiss (X) control. */
  onClose?: () => void;
}

// Gold has no core-ui theme token, so the "suggestion" variant uses a one-off
// accent (Figma #ffb300). Kept as named constants because Tailwind needs the
// arbitrary-value class strings to appear literally at build time.
const SUGGESTION_BORDER = "border-[#ffb300]";
const SUGGESTION_ACCENT_BG = "bg-[#ffb300]";

// Text/icon color sitting on top of the accent: white on the dark/saturated
// variants, dark on the light gold "suggestion" accent.
const ON_DARK_ACCENT = "text-accent-contrast";
const ON_LIGHT_ACCENT = "text-primary-main";

interface VariantAccent {
  /** Left accent bar color. */
  border: string;
  /** Background of the icon chip and of primary action buttons. */
  accentBg: string;
  /** Foreground color that sits on `accentBg`. */
  onAccent: string;
  /** Optional severity tint layered over the neutral card background. */
  tint: string;
}

const VARIANT_ACCENT: Record<NotificationVariant, VariantAccent> = {
  error: {
    border: "border-error-main",
    accentBg: "bg-error-main",
    onAccent: ON_DARK_ACCENT,
    // High-urgency variant gets a subtle red wash over the neutral card.
    tint: "bg-gradient-to-r from-error-main/[0.06] to-error-main/[0.06]",
  },
  warning: {
    border: "border-warning-main",
    accentBg: "bg-warning-main",
    onAccent: ON_DARK_ACCENT,
    tint: "",
  },
  info: {
    border: "border-info-main",
    accentBg: "bg-info-main",
    onAccent: ON_DARK_ACCENT,
    tint: "",
  },
  success: {
    border: "border-success-main",
    accentBg: "bg-success-main",
    onAccent: ON_DARK_ACCENT,
    tint: "",
  },
  paused: {
    border: "border-info-light",
    accentBg: "bg-info-light",
    onAccent: ON_DARK_ACCENT,
    tint: "",
  },
  suggestion: {
    border: SUGGESTION_BORDER,
    accentBg: SUGGESTION_ACCENT_BG,
    onAccent: ON_LIGHT_ACCENT,
    tint: "",
  },
};

const ICON_SIZE = 24;

const DEFAULT_ICON: Record<NotificationVariant, ComponentType<IconProps>> = {
  error: WarningIcon,
  warning: InfoIcon,
  info: InfoIcon,
  success: CheckIcon,
  paused: InfoIcon,
  suggestion: InfoIcon,
};

// React drops `false`/`null`/`undefined`, but `0` and `""` are valid content —
// gate optional slots on absence, not truthiness, so they are not swallowed.
const isPresent = (node: ReactNode): boolean => node != null && node !== false;

export function Notification({
  variant,
  title,
  icon,
  actions,
  actionsPlacement = "inline",
  suggestion,
  onClose,
  className,
  children,
  role,
  ...rest
}: NotificationProps) {
  const accent = VARIANT_ACCENT[variant];
  const resolvedRole = role ?? (variant === "error" ? "alert" : "status");

  const DefaultIcon = DEFAULT_ICON[variant];
  const iconNode =
    icon === null ? null : (
      (icon ?? <DefaultIcon size={ICON_SIZE} color={accent.onAccent} />)
    );

  const hasActions = Boolean(actions && actions.length > 0);
  const hasInlineActions = hasActions && actionsPlacement === "inline";
  const hasBelowActions = hasActions && actionsPlacement === "below";

  // Vertically center only in the simple inline case (icon + text + actions on
  // one row); any stacked content — a suggestion box or a top-right close —
  // top-aligns so the icon and close control sit at the top.
  const centerAlign = hasInlineActions && !suggestion && !onClose;
  const alignClass = centerAlign ? "items-center" : "items-start";

  const actionButtons = actions?.map((action, index) => (
    <NotificationActionButton
      key={index}
      action={action}
      accentBg={accent.accentBg}
      onAccent={accent.onAccent}
    />
  ));

  return (
    <div
      role={resolvedRole}
      className={twMerge(
        "flex w-full gap-6 rounded-lg border-l-4 bg-secondary-highlight p-6",
        accent.tint,
        accent.border,
        alignClass,
        className,
      )}
      {...rest}
    >
      <div className={twMerge("flex min-w-0 flex-1 gap-4", alignClass)}>
        {iconNode && (
          <div
            aria-hidden="true"
            className={twMerge(
              "flex shrink-0 items-center justify-center rounded-lg p-2.5",
              accent.accentBg,
            )}
          >
            {iconNode}
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {isPresent(title) && (
              <div className="break-words text-xl font-bold tracking-0.15 text-accent-primary">
                {title}
              </div>
            )}
            {isPresent(children) && (
              <Text
                as="div"
                variant="body2"
                className="break-words text-accent-secondary"
              >
                {children}
              </Text>
            )}
          </div>

          {isPresent(suggestion) && (
            <div className="flex w-full flex-col gap-2 rounded-lg bg-neutral-200 p-4 text-accent-secondary">
              {suggestion}
            </div>
          )}

          {hasBelowActions && (
            <div className="flex flex-wrap items-center gap-2">{actionButtons}</div>
          )}
        </div>
      </div>

      {hasInlineActions && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actionButtons}
        </div>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="-mr-1 -mt-1 flex shrink-0 items-center justify-center rounded p-1 text-accent-secondary transition-colors hover:text-accent-primary"
        >
          <CloseIcon size={20} />
        </button>
      )}
    </div>
  );
}
