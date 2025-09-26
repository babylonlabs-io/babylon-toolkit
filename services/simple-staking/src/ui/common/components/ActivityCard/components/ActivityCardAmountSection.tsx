import { Button } from "@babylonlabs-io/core-ui";

import FeatureFlagService from "@/ui/common/utils/FeatureFlagService";

import {
  ThreeDotsMenu,
  ThreeDotsMenuItem,
} from "../../ThreeDotsMenu/ThreeDotsMenu";
import { ActivityCardActionButton } from "../ActivityCard";

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

        {FeatureFlagService.IsTimelockRenewalEnabled &&
          secondaryActions &&
          secondaryActions.length > 0 && (
            <ThreeDotsMenu
              buttonClassName="sm:bbn-btn-medium h-9 flex items-center justify-center rounded border border-secondary-strokeLight px-2 py-1 hover:bg-secondary-highlight transition-colors"
              popoverClassName="min-w-48 rounded border border-secondary-strokeLight bg-surface shadow-md"
            >
              {secondaryActions.map((action, index) => (
                <ThreeDotsMenuItem
                  key={index}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  className={action.className}
                >
                  {action.label}
                </ThreeDotsMenuItem>
              ))}
            </ThreeDotsMenu>
          )}
      </div>
    </div>
  );
}
