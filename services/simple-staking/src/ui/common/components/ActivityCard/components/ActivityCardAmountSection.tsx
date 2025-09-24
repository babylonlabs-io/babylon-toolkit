import { Button } from "@babylonlabs-io/core-ui";

import { ActivityCardActionButton } from "../ActivityCard";

import { MoreActionMenu } from "./MoreActionMenu";

interface ActivityCardAmountSectionProps {
  formattedAmount: string;
  icon?: string | React.ReactNode;
  iconAlt?: string;
  primaryAction?: ActivityCardActionButton;
  secondaryActions?: ActivityCardActionButton[];
}

export function ActivityCardAmountSection({
  formattedAmount,
  icon,
  iconAlt,
  primaryAction,
  secondaryActions,
}: ActivityCardAmountSectionProps) {
  return (
    <div className="mb-4 flex items-center justify-between sm:mb-6">
      <div className="flex items-center gap-2">
        {icon &&
          (typeof icon === "string" ? (
            <img
              src={icon}
              alt={iconAlt || "icon"}
              className="h-6 w-6 sm:h-8 sm:w-8"
            />
          ) : (
            icon
          ))}
        <span className="text-base font-medium text-accent-primary sm:text-lg">
          {formattedAmount}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {primaryAction && (
          <Button
            variant={primaryAction.variant || "contained"}
            size={primaryAction.size || "small"}
            className={`sm:bbn-btn-medium ${primaryAction.className || ""}`}
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </Button>
        )}

        {secondaryActions && secondaryActions.length > 0 && (
          <MoreActionMenu actions={secondaryActions} />
        )}
      </div>
    </div>
  );
}
