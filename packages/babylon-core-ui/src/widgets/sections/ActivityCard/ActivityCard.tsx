import { Button } from "../../../components/Button";
import { ActivityCardActionSection } from "./components/ActivityCardActionSection";
import { ActivityCardAmountSection } from "./components/ActivityCardAmountSection";
import { ActivityCardDetailsSection } from "./components/ActivityCardDetailsSection";

export interface ActivityCardDetailItem {
  label: string;
  value: string | React.ReactNode;
  collapsible?: boolean;
  nestedDetails?: ActivityCardDetailItem[];
}

export interface ActivityListItemData {
  icon?: string | React.ReactNode;
  iconAlt?: string;
  name: string;
  id?: string;
}

export interface ActivityCardActionButton {
  label: string;
  onClick: () => void;
  variant?: "contained" | "outlined";
  size?: "small" | "medium" | "large";
  className?: string;
  fullWidth?: boolean;
}

export interface ActivityCardData {
  formattedAmount: string;
  icon?: string | React.ReactNode;
  iconAlt?: string;
  chainName?: string;
  chainIcon?: string | React.ReactNode;
  chainIconAlt?: string;
  details: ActivityCardDetailItem[];
  optionalDetails?: ActivityCardDetailItem[];
  listItems?: {
    label: string;
    items: ActivityListItemData[];
  }[];
  primaryAction?: ActivityCardActionButton;
  secondaryActions?: ActivityCardActionButton[];
}

interface ActivityCardProps {
  data: ActivityCardData;
  className?: string;
}

export function ActivityCard({ data, className }: ActivityCardProps) {
  return (
    <div
      className={`w-full bg-secondary-highlight p-3 sm:p-4 rounded flex flex-col justify-between ${className || ""}`}
    >
      <div className="space-y-3 sm:space-y-4">
        <ActivityCardAmountSection
          formattedAmount={data.formattedAmount}
          icon={data.icon}
          iconAlt={data.iconAlt}
          chainName={data.chainName}
          chainIcon={data.chainIcon}
          chainIconAlt={data.chainIconAlt}
        />

        <ActivityCardDetailsSection
          details={data.details}
          optionalDetails={data.optionalDetails}
          listItems={data.listItems}
        />

        {data.secondaryActions && data.secondaryActions.length > 0 && (
          <ActivityCardActionSection actions={data.secondaryActions} />
        )}
      </div>

      {data.primaryAction && (
        <Button
          variant="outlined"
          className={`mt-4 ${data.primaryAction.className || ""}`}
          onClick={data.primaryAction.onClick}
          fluid={data.primaryAction.fullWidth !== false}
        >
          {data.primaryAction.label}
        </Button>
      )}
    </div>
  );
}
