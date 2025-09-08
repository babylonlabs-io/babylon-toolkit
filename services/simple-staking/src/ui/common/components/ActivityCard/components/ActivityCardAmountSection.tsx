import { Button } from "@babylonlabs-io/core-ui";

import { ActivityCardActionButton } from "../ActivityCard";

interface ActivityCardAmountSectionProps {
  formattedAmount: string;
  icon?: string | React.ReactNode;
  iconAlt?: string;
  primaryAction?: ActivityCardActionButton;
}

export function ActivityCardAmountSection({
  formattedAmount,
  icon,
  iconAlt,
  primaryAction,
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

      {primaryAction && (
        <Button
          variant={primaryAction.variant || "contained"}
          size={primaryAction.size || "small"}
          className={`sm:bbn-btn-medium ${primaryAction.className || ""}`}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </Button>
      )}
    </div>
  );
}
