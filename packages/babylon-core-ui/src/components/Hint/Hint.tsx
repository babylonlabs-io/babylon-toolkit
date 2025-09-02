import { useId, type PropsWithChildren, type ReactNode } from "react";
import { InfoIcon } from "../Icons";
import { Tooltip } from "react-tooltip";
import { twJoin } from "tailwind-merge";

type HintStatus = "default" | "warning" | "error";

export interface HintProps {
  tooltip?: ReactNode;
  status?: HintStatus;
  /** Attach tooltip to children instead of showing separate icon */
  attachToChildren?: boolean;
  /** Custom icon to use instead of default InfoIcon */
  icon?: ReactNode;
  /** Custom className for wrapper */
  className?: string;
  /** Placement of the tooltip */
  placement?: "top" | "bottom" | "left" | "right";
  /** Tooltip text color variant */
  tooltipVariant?: "primary" | "secondary";
  /** Custom offset for tooltip positioning [x, y] */
  offset?: [number, number];
}

const STATUS_COLORS = {
  default: "text-accent-primary",
  warning: "text-warning-main",
  error: "text-error-main",
} as const;

const ICON_COLOR = {
  default: "text-secondary-strokeDark",
  warning: "text-warning-main",
  error: "text-error-main",
} as const;

export function Hint({
  children,
  tooltip,
  status = "default",
  attachToChildren = false,
  icon,
  className,
  placement = "top",
  tooltipVariant = "primary",
  offset = [8, 8],
}: PropsWithChildren<HintProps>) {
  const id = useId();
  const statusColor = STATUS_COLORS[status];

  // Create custom middleware for horizontal offset
  const customOffset = {
    name: 'customOffset',
    fn: ({ x, y, placement }: { x: number; y: number; placement: HintProps['placement'] }) => {
      let nextX = x;
      let nextY = y;

      // Apply offsets based on placement direction so that positive offsets
      // move the tooltip away from the reference element on the main axis
      if (placement === 'top') {
        nextY = y - offset[1];
      } else if (placement === 'bottom') {
        nextY = y + offset[1];
      } else if (placement === 'left') {
        nextX = x - offset[0];
      } else if (placement === 'right') {
        nextX = x + offset[0];
      }

      return { x: nextX, y: nextY };
    },
  };

  if (!tooltip) {
    // Use an inline wrapper when attaching to children to keep valid inline semantics
    if (attachToChildren) {
      return (
        <span className={twJoin("inline-flex items-center gap-1", statusColor, className)}>
          {children}
        </span>
      );
    }
    return (
      <div className={twJoin("inline-flex items-center gap-1", statusColor, className)}>
        {children}
      </div>
    );
  }

  // Default icon with proper size and color
  const defaultIcon = <InfoIcon size={16} className={ICON_COLOR[status]} />;
  const tooltipIcon = icon || defaultIcon;

  return (
    attachToChildren ? (
      <span className={twJoin("inline-flex items-center gap-1", statusColor, className)}>
        <span
          className="cursor-pointer"
          data-tooltip-id={id}
          data-tooltip-content={
            typeof tooltip === "string" ? tooltip : undefined
          }
          data-tooltip-place={placement}
          data-tooltip-position-strategy="fixed"
          data-tooltip-wrapper="span"
        >
          {children}
        </span>

        <Tooltip
          id={id}
          className={twJoin(
            "react-tooltip",
            tooltipVariant === "secondary" && "react-tooltip--secondary"
          )}
          openOnClick={false}
          clickable={true}
          place={placement}
          style={{ zIndex: 99999 }}
          positionStrategy="fixed"
          middlewares={[customOffset]}
          offset={0}
        >
          {typeof tooltip !== "string" && tooltip}
        </Tooltip>
      </span>
    ) : (
      <div className={twJoin("inline-flex items-center gap-1", statusColor, className)}>
        {children}
        <span
          className={twJoin("cursor-pointer inline-flex items-center", statusColor)}
          data-tooltip-id={id}
          data-tooltip-content={
            typeof tooltip === "string" ? tooltip : undefined
          }
          data-tooltip-place={placement}
          data-tooltip-position-strategy="fixed"
          data-tooltip-wrapper="span"
        >
          {tooltipIcon}
        </span>

        <Tooltip
          id={id}
          className={twJoin(
            "react-tooltip",
            tooltipVariant === "secondary" && "react-tooltip--secondary"
          )}
          openOnClick={false}
          clickable={true}
          place={placement}
          style={{ zIndex: 99999 }}
          positionStrategy="fixed"
          middlewares={[customOffset]}
          offset={0}
        >
          {typeof tooltip !== "string" && tooltip}
        </Tooltip>
      </div>
    )
  );
}
