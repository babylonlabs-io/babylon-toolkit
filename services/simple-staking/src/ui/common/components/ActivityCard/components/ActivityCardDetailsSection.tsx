import { ActivityCardDetailItem, ActivityListItemData } from "../ActivityCard";

import { ActivityListItem } from "./ActivityListItem";

interface ActivityCardDetailsSectionProps {
  details: ActivityCardDetailItem[];
  optionalDetails?: ActivityCardDetailItem[];
  listItems?: {
    label: string;
    items: ActivityListItemData[];
  }[];
}

interface DetailRowProps {
  label: string;
  value: string | React.ReactNode;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 overflow-x-auto">
      <span className="flex-shrink-0 text-xs text-accent-primary sm:text-sm">
        {label}
      </span>
      <span className="min-w-0 overflow-x-auto whitespace-nowrap text-right text-xs font-medium text-accent-primary sm:text-sm">
        {value}
      </span>
    </div>
  );
}

export function ActivityCardDetailsSection({
  details,
  optionalDetails,
  listItems,
}: ActivityCardDetailsSectionProps) {
  const hasOptionalDetails = optionalDetails && optionalDetails.length > 0;
  const hasListItems = listItems && listItems.length > 0;

  return (
    <div className="space-y-3 overflow-x-auto sm:space-y-4">
      <div className="space-y-4 sm:space-y-6">
        {details.map((detail, index) => (
          <DetailRow key={index} label={detail.label} value={detail.value} />
        ))}
      </div>

      {hasListItems && (
        <div className="space-y-3 sm:space-y-4">
          {listItems.map((listSection, sectionIndex) => (
            <div
              key={sectionIndex}
              className="space-y-3 overflow-x-auto rounded bg-surface p-3 sm:space-y-4 sm:p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs text-accent-primary sm:text-sm">
                  {listSection.label}
                </span>
                <div className="flex flex-wrap gap-2">
                  {listSection.items.map((item, itemIndex) => (
                    <ActivityListItem key={item.id || itemIndex} item={item} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasOptionalDetails && (
        <div className="space-y-3 overflow-x-auto rounded bg-surface p-3 sm:space-y-4 sm:p-4">
          {optionalDetails.map((detail, index) => (
            <DetailRow key={index} label={detail.label} value={detail.value} />
          ))}
        </div>
      )}
    </div>
  );
}
